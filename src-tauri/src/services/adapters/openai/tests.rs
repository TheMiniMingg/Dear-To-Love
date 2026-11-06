use std::time::Duration;

use tokio_util::sync::CancellationToken;

use super::*;
use crate::domain::provider::{ModelMessage, Role};
use crate::errors::ErrorCode;
use crate::services::adapters::test_server::{serve, short_pause, Reply};
use crate::services::adapters::Charge;

fn req() -> GenerateRequest {
    GenerateRequest {
        model_id: "story-model".into(),
        messages: vec![
            ModelMessage {
                role: Role::System,
                content: "You narrate.".into(),
            },
            ModelMessage {
                role: Role::User,
                content: "Open the letter".into(),
            },
        ],
        max_output_tokens: 300,
        temperature: Some(0.7),
        timeout_ms: 5_000,
        context_tokens: Some(8192),
    }
}

async fn run(
    a: &OpenAiCompatible,
    r: &GenerateRequest,
) -> (Result<Completion, GenerateError>, String) {
    let mut seen = String::new();
    let out = a
        .generate(r, &CancellationToken::new(), &mut |t: &str| {
            seen.push_str(t)
        })
        .await;
    (out, seen)
}

#[tokio::test]
async fn streams_fragmented_chunks_and_normalizes_usage() {
    let server = serve(vec![Reply::sse_text(
        &["The lamp ", "hums. 灯台 ", "glows."],
        Some(r#"{"prompt_tokens":120,"completion_tokens":9,"prompt_tokens_details":{"cached_tokens":100}}"#),
    )])
    .await;
    let a = OpenAiCompatible::new(&server.base_url, Some("sk-test-123".into())).unwrap();
    let (out, seen) = run(&a, &req()).await;
    let c = out.unwrap();
    assert_eq!(c.text, "The lamp hums. 灯台 glows.");
    assert_eq!(seen, c.text);
    assert_eq!(c.finish_reason, "stop");
    assert_eq!(
        c.usage,
        NormalizedUsage {
            input_tokens: Some(120),
            cached_input_tokens: Some(100),
            output_tokens: Some(9),
        }
    );
    let sent = &server.requests()[0];
    assert_eq!(sent.method, "POST");
    assert_eq!(sent.path, "/v1/chat/completions");
    assert_eq!(sent.authorization.as_deref(), Some("Bearer sk-test-123"));
    let body: Value = serde_json::from_str(&sent.body).unwrap();
    assert_eq!(body["model"], "story-model");
    assert_eq!(body["stream"], true);
    assert_eq!(body["stream_options"]["include_usage"], true);
    assert_eq!(body["max_tokens"], 300);
    assert_eq!(body["messages"][1]["content"], "Open the letter");
}

#[tokio::test]
async fn missing_usage_stays_unknown() {
    let server = serve(vec![Reply::sse_text(&["Hello."], None)]).await;
    let a = OpenAiCompatible::new(&server.base_url, None).unwrap();
    let (out, _) = run(&a, &req()).await;
    let c = out.unwrap();
    assert!(c.usage.is_empty());
    assert_eq!(server.requests()[0].authorization, None);
}

#[tokio::test]
async fn stream_without_done_marker_but_with_finish_reason_completes() {
    let body = format!(
        "data: {}\n\ndata: {}\n\n",
        serde_json::json!({"choices":[{"delta":{"content":"Fine."}}]}),
        serde_json::json!({"choices":[{"delta":{},"finish_reason":"length"}]})
    );
    let server = serve(vec![Reply::sse_raw(&body)]).await;
    let a = OpenAiCompatible::new(&server.base_url, None).unwrap();
    let c = run(&a, &req()).await.0.unwrap();
    assert_eq!(c.finish_reason, "length");
}

#[tokio::test]
async fn plain_json_reply_is_accepted() {
    let server = serve(vec![Reply::json(
        200,
        r#"{"choices":[{"message":{"role":"assistant","content":"Whole reply."},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}"#,
    )])
    .await;
    let a = OpenAiCompatible::new(&server.base_url, None).unwrap();
    let (out, seen) = run(&a, &req()).await;
    let c = out.unwrap();
    assert_eq!(c.text, "Whole reply.");
    assert_eq!(seen, "Whole reply.");
    assert_eq!(c.usage.output_tokens, Some(2));
}

#[tokio::test]
async fn http_errors_are_typed_and_never_echo_the_key() {
    let cases = [
        (
            401,
            r#"{"error":{"message":"Incorrect API key provided"}}"#,
            ErrorCode::AuthFailed,
            Charge::None,
        ),
        (
            429,
            r#"{"error":{"message":"Rate limit reached"}}"#,
            ErrorCode::RateLimited,
            Charge::None,
        ),
        (
            400,
            r#"{"error":{"message":"This model's maximum context length is 8192 tokens","code":"context_length_exceeded"}}"#,
            ErrorCode::ContextTooLong,
            Charge::None,
        ),
        (
            404,
            r#"{"error":{"message":"model not found"}}"#,
            ErrorCode::ProviderError,
            Charge::None,
        ),
        (500, "oops", ErrorCode::ProviderError, Charge::Unknown),
    ];
    for (status, body, code, charge) in cases {
        let server = serve(vec![Reply::json(status, body)]).await;
        let a = OpenAiCompatible::new(&server.base_url, Some("sk-secret-999".into())).unwrap();
        let e = run(&a, &req()).await.0.unwrap_err();
        assert_eq!(e.error.code, code, "status {status}");
        assert_eq!(e.charge, charge, "status {status}");
        assert!(
            !e.error.message.contains("sk-secret"),
            "{}",
            e.error.message
        );
    }
}

#[tokio::test]
async fn error_inside_stream_fails_the_reply() {
    let body = format!(
        "data: {}\n\ndata: {}\n\n",
        serde_json::json!({"choices":[{"delta":{"content":"Half"}}]}),
        serde_json::json!({"error":{"message":"overloaded"}})
    );
    let server = serve(vec![Reply::sse_raw(&body)]).await;
    let a = OpenAiCompatible::new(&server.base_url, None).unwrap();
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::ProviderError);
    assert_eq!(e.charge, Charge::Unknown);
}

#[tokio::test]
async fn dropped_connection_mid_reply_is_unreachable_and_maybe_charged() {
    let server = serve(vec![
        Reply::sse_text(&["a ", "b ", "c ", "d"], None).dropped()
    ])
    .await;
    let a = OpenAiCompatible::new(&server.base_url, None).unwrap();
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::ProviderUnreachable);
    assert_eq!(e.charge, Charge::Unknown);
}

#[tokio::test]
async fn idle_timeout_between_chunks() {
    let server = serve(vec![
        Reply::sse_text(&["slow"], None).with_delay(Duration::from_millis(400))
    ])
    .await;
    let a = OpenAiCompatible::new(&server.base_url, None).unwrap();
    let mut r = req();
    r.timeout_ms = 100;
    let e = run(&a, &r).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::ProviderUnreachable);
}

#[tokio::test]
async fn cancel_mid_stream() {
    let server = serve(vec![
        Reply::sse_text(&["one ", "two ", "three"], None).with_delay(Duration::from_millis(40))
    ])
    .await;
    let a = OpenAiCompatible::new(&server.base_url, None).unwrap();
    let cancel = CancellationToken::new();
    let c2 = cancel.clone();
    tokio::spawn(async move {
        short_pause().await;
        short_pause().await;
        c2.cancel();
    });
    let e = a
        .generate(&req(), &cancel, &mut |_: &str| {})
        .await
        .unwrap_err();
    assert_eq!(e.error.code, ErrorCode::Cancelled);
}

#[tokio::test]
async fn unreachable_server_was_never_sent() {
    // Bind then drop to get a port nobody listens on.
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let a = OpenAiCompatible::new(&format!("http://127.0.0.1:{port}/v1"), None).unwrap();
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::ProviderUnreachable);
    assert_eq!(e.charge, Charge::None);
}

#[tokio::test]
async fn list_models_is_a_get_without_story_text() {
    let server = serve(vec![
        Reply::json(200, r#"{"data":[{"id":"story-model"},{"id":"other"}]}"#),
        Reply::json(401, r#"{"error":{"message":"bad key"}}"#),
    ])
    .await;
    let a = OpenAiCompatible::new(&server.base_url, Some("k".into())).unwrap();
    assert_eq!(a.list_models().await.unwrap(), vec!["story-model", "other"]);
    assert_eq!(
        a.list_models().await.unwrap_err().code,
        ErrorCode::AuthFailed
    );
    for r in server.requests() {
        assert_eq!(r.method, "GET");
        assert_eq!(r.path, "/v1/models");
        assert!(r.body.is_empty());
    }
}

#[test]
fn official_openai_uses_max_completion_tokens() {
    let a = OpenAiCompatible::new("https://api.openai.com/v1", None).unwrap();
    let body = a.request_body(&req());
    assert_eq!(body["max_completion_tokens"], 300);
    assert!(body.get("max_tokens").is_none());
}
