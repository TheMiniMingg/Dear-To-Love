//! Model adapters. Each turns a provider-neutral `GenerateRequest` into one
//! outbound call and streams draft text back. Adapters never retry: every
//! retry is a new generation run with its own ledger row.

pub mod anthropic;
pub mod http;
pub mod offline;
pub mod ollama;
pub mod openai;
pub mod sse;
#[cfg(test)]
pub mod test_server;

use tokio_util::sync::CancellationToken;

use crate::domain::provider::{AdapterKind, GenerateRequest, NormalizedUsage};
use crate::errors::{AppError, AppResult, ErrorCode};

#[derive(Debug, Clone, PartialEq)]
pub struct Completion {
    pub text: String,
    pub finish_reason: String,
    pub usage: NormalizedUsage,
}

/// What we know about charges when a call fails.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Charge {
    /// Nothing reached the provider, or it refused the request outright.
    None,
    /// The provider may have done (and billed) work we never saw.
    Unknown,
}

#[derive(Debug, Clone)]
pub struct GenerateError {
    pub error: AppError,
    pub charge: Charge,
}

impl GenerateError {
    pub fn not_sent(error: AppError) -> Self {
        Self {
            error,
            charge: Charge::None,
        }
    }

    pub fn not_charged(error: AppError) -> Self {
        Self {
            error,
            charge: Charge::None,
        }
    }

    pub fn maybe_charged(error: AppError) -> Self {
        Self {
            error,
            charge: Charge::Unknown,
        }
    }

    /// Cancelling after sending may still be billed by the provider.
    pub fn cancelled() -> Self {
        Self::maybe_charged(AppError::new(
            ErrorCode::Cancelled,
            "the reply was cancelled",
        ))
    }
}

/// Why a reply came back with no text, in words the player can act on.
pub fn empty_reply_error(finish_reason: Option<&str>) -> GenerateError {
    let reason = finish_reason.unwrap_or_default().to_ascii_lowercase();
    GenerateError::maybe_charged(match reason.as_str() {
        "content_filter" => AppError::new(
            ErrorCode::ContentFiltered,
            "the AI service's content filter stopped this reply. Try another reply, change the \
             action, or use a model whose rules allow this story, such as a local model",
        ),
        "length" => http::provider_err(
            "the model used up the reply length before writing anything (some models think \
             first). Raise \"Longest reply\" under Advanced in this connection's settings",
        ),
        _ => http::provider_err("the AI service returned an empty reply"),
    })
}

/// Hides a leading `<think>…</think>` block, which open reasoning models
/// (DeepSeek R1, Qwen and others) write before the reply on many servers.
#[derive(Default)]
pub struct ThinkFilter {
    pending: String,
    state: ThinkState,
}

#[derive(Default, PartialEq)]
enum ThinkState {
    #[default]
    Start,
    Thinking,
    /// Just after the block: blank lines before the reply are dropped.
    Trimming,
    Passing,
}

const THINK_OPEN: &str = "<think>";
const THINK_CLOSE: &str = "</think>";

impl ThinkFilter {
    /// Feed a piece of the reply; returns the part to show now.
    pub fn push(&mut self, t: &str) -> String {
        match self.state {
            ThinkState::Passing => t.to_string(),
            ThinkState::Trimming => self.trimmed(t),
            ThinkState::Thinking => {
                self.pending.push_str(t);
                self.after_open()
            }
            ThinkState::Start => {
                self.pending.push_str(t);
                let lead = self.pending.trim_start();
                if lead.starts_with(THINK_OPEN) {
                    self.state = ThinkState::Thinking;
                    self.after_open()
                } else if THINK_OPEN.starts_with(lead) {
                    String::new() // not sure yet
                } else {
                    self.state = ThinkState::Passing;
                    std::mem::take(&mut self.pending)
                }
            }
        }
    }

    fn after_open(&mut self) -> String {
        match self.pending.find(THINK_CLOSE) {
            Some(end) => {
                let rest = self.pending[end + THINK_CLOSE.len()..].to_string();
                self.pending.clear();
                self.state = ThinkState::Trimming;
                self.trimmed(&rest)
            }
            None => String::new(),
        }
    }

    fn trimmed(&mut self, t: &str) -> String {
        let t = t.trim_start();
        if !t.is_empty() {
            self.state = ThinkState::Passing;
        }
        t.to_string()
    }

    /// End of the reply: text held back while deciding, if it was not a tag.
    pub fn finish(&mut self) -> String {
        if self.state == ThinkState::Start {
            std::mem::take(&mut self.pending)
        } else {
            String::new()
        }
    }

    /// The whole reply without its leading thinking block.
    pub fn strip(text: &str) -> String {
        let mut f = Self::default();
        let mut out = f.push(text);
        out.push_str(&f.finish());
        out
    }
}

/// A ready-to-call adapter for one run.
pub enum Adapter {
    OpenAi(openai::OpenAiCompatible),
    Anthropic(anthropic::Anthropic),
    Ollama(ollama::Ollama),
    Offline(offline::Offline),
    /// A picture connection: it can list its models (the free connection
    /// check) but never writes story replies.
    Pictures(super::pictures::PictureMaker),
}

/// Extra tokens an OpenAI reasoning model may spend reasoning before it
/// writes. Reasoning counts against the token limit, so without this room a
/// short limit can end before any story is written. The budget reserves it.
pub const REASONING_ROOM: u32 = 2_000;

impl Adapter {
    /// The request as this connection should send it: room to reason first
    /// for a model that does. Callers reserve the budget for what this
    /// returns, so the reservation covers the reasoning too.
    pub fn fit_request(&self, mut req: GenerateRequest) -> GenerateRequest {
        if let Self::OpenAi(a) = self {
            if a.thinks_first(&req.model_id) {
                req.max_output_tokens = req.max_output_tokens.saturating_add(REASONING_ROOM);
                req.temperature = None;
            }
        }
        req
    }

    /// The network adapter for a saved connection.
    pub fn live(kind: AdapterKind, base_url: &str, api_key: Option<String>) -> AppResult<Self> {
        Ok(match kind {
            AdapterKind::OpenaiCompatible => {
                Self::OpenAi(openai::OpenAiCompatible::new(base_url, api_key)?)
            }
            AdapterKind::Anthropic => {
                Self::Anthropic(anthropic::Anthropic::new(base_url, api_key)?)
            }
            AdapterKind::Ollama => Self::Ollama(ollama::Ollama::new(base_url, api_key)?),
            AdapterKind::OpenaiImages | AdapterKind::StableDiffusion => {
                Self::Pictures(super::pictures::PictureMaker::new(kind, base_url, api_key)?)
            }
        })
    }

    /// Free connection check. Never sends story text.
    pub async fn list_models(&self) -> AppResult<Vec<String>> {
        match self {
            Self::OpenAi(a) => a.list_models().await,
            Self::Anthropic(a) => a.list_models().await,
            Self::Ollama(a) => a.list_models().await,
            Self::Offline(_) => Ok(vec!["offline".into()]),
            Self::Pictures(a) => a.list_models().await,
        }
    }

    pub async fn generate(
        &self,
        req: &GenerateRequest,
        cancel: &CancellationToken,
        on_delta: &mut (dyn FnMut(&str) + Send),
    ) -> Result<Completion, GenerateError> {
        // Open models on OpenAI-compatible servers and Ollama may think
        // out loud first; drafts and the reply both leave that out.
        let mut think = ThinkFilter::default();
        let result = {
            let mut shown = |t: &str| {
                let s = think.push(t);
                if !s.is_empty() {
                    on_delta(&s);
                }
            };
            match self {
                Self::OpenAi(a) => a.generate(req, cancel, &mut shown).await,
                Self::Anthropic(a) => a.generate(req, cancel, &mut shown).await,
                Self::Ollama(a) => a.generate(req, cancel, &mut shown).await,
                Self::Offline(a) => a.generate(cancel, &mut shown).await,
                Self::Pictures(_) => Err(GenerateError::not_sent(AppError::invalid_input(
                    "this connection makes pictures, not story replies; choose another storyteller",
                ))),
            }
        };
        let mut c = result?;
        let rest = think.finish();
        if !rest.is_empty() {
            on_delta(&rest);
        }
        let text = ThinkFilter::strip(&c.text);
        if text.trim().is_empty() {
            return Err(empty_reply_error(Some(&c.finish_reason)));
        }
        c.text = text;
        Ok(c)
    }
}

#[cfg(test)]
mod think_tests {
    use super::ThinkFilter;

    fn feed(pieces: &[&str]) -> String {
        let mut f = ThinkFilter::default();
        let mut out: String = pieces.iter().map(|p| f.push(p)).collect();
        out.push_str(&f.finish());
        out
    }

    #[test]
    fn a_leading_think_block_is_hidden_wherever_it_splits() {
        let pieces = [
            "\n<th",
            "ink>The player",
            " wants…</thi",
            "nk>\n\nThe lamp ",
            "hums.",
        ];
        assert_eq!(feed(&pieces), "The lamp hums.");
        assert_eq!(
            ThinkFilter::strip("<think>plan</think> The lamp hums."),
            "The lamp hums."
        );
    }

    #[test]
    fn ordinary_replies_pass_through_untouched() {
        assert_eq!(feed(&["<", "b>Bold</b> move."]), "<b>Bold</b> move.");
        assert_eq!(
            feed(&["The <think> tag ", "is mid-reply."]),
            "The <think> tag is mid-reply."
        );
        assert_eq!(feed(&["<"]), "<");
        assert_eq!(ThinkFilter::strip("  "), "  ");
    }

    #[test]
    fn a_reply_that_never_stops_thinking_is_empty() {
        assert_eq!(ThinkFilter::strip("<think>still going"), "");
    }

    #[tokio::test]
    async fn open_model_thinking_never_reaches_the_story() {
        use super::test_server::{serve, Reply};
        use super::Adapter;
        use crate::domain::provider::{AdapterKind, GenerateRequest, ModelMessage, Role};
        use tokio_util::sync::CancellationToken;

        let server = serve(vec![
            Reply::sse_text(
                &[
                    "<think>The player",
                    " opens it.</think>",
                    "\nThe seal ",
                    "cracks.",
                ],
                None,
            ),
            Reply::sse_text(&["<think>Only ", "thinking"], None),
        ])
        .await;
        let a = Adapter::live(AdapterKind::OpenaiCompatible, &server.base_url, None).unwrap();
        let req = GenerateRequest {
            model_id: "deepseek-r1".into(),
            messages: vec![ModelMessage {
                role: Role::User,
                content: "Open the letter".into(),
            }],
            max_output_tokens: 300,
            temperature: None,
            timeout_ms: 5_000,
            context_tokens: None,
        };
        let mut seen = String::new();
        let c = a
            .generate(&req, &CancellationToken::new(), &mut |t: &str| {
                seen.push_str(t)
            })
            .await
            .unwrap();
        assert_eq!(c.text, "The seal cracks.");
        assert_eq!(seen, "The seal cracks.");
        let err = a
            .generate(&req, &CancellationToken::new(), &mut |_: &str| {})
            .await
            .unwrap_err();
        assert!(
            err.error.message.contains("empty reply"),
            "{}",
            err.error.message
        );
    }
}
