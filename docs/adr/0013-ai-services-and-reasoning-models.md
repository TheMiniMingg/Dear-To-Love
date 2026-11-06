# ADR 0013: AI services, Claude's own API, and models that think first

Status: accepted (follow-up to ADR 0012)

## Context

MiniMe asked for every big AI lab's API to work, along with open models
and models on the player's own computer. The app spoke two protocols:
OpenAI-compatible chat completions and Ollama's native API. Most services
offer the OpenAI-compatible protocol (Google, xAI, Mistral, DeepSeek, Groq,
Together, Fireworks, DeepInfra, Hugging Face, OpenRouter, and local servers
such as llama.cpp, KoboldCpp, Jan, vLLM and text-generation-webui).
Anthropic's compatibility layer is meant for trying models, not for
production, so Claude needs its own adapter. Separately, models that think
before answering caused three failures: OpenAI's reasoning models reject a
non-default temperature, open reasoning models write `<think>…</think>`
into the reply on many servers, and a thinking model can use the whole
reply length before writing a word.

## Decision

- **`AdapterKind::Anthropic`** speaks `POST {base}/messages` with
  `x-api-key` (marked sensitive) and `anthropic-version: 2023-06-01`. The
  system messages become the `system` field; same-role neighbours are
  joined and a window that would start with a story reply gets a short
  player turn first. Only `text_delta` events are reply text; thinking
  blocks and unknown events are skipped. Usage counts cache reads and
  writes as input, with cache reads as cached input. `refusal` maps to the
  same `CONTENT_FILTERED` handling as a content filter, `max_tokens` to
  `length`. No temperature is sent: current Claude models reject sampling
  settings. `GET {base}/models` is the free connection check.
- **Presets, not protocols.** The connection form groups presets: on this
  computer, AI labs, hosted open models, and Other. A preset fills the type,
  address, billing, context limit and, for the labs, a larger reply length
  (4,000 tokens) because reasoning models think inside it. Nothing is
  contacted until the player tests or plays.
- **OpenAI's reasoning models** (`o1`, `o3`, `o4…`, `gpt-5…`, but not
  `…-chat` models) get no temperature on `api.openai.com`; other services
  keep the setting whatever the model is called.
- **Thinking out loud is hidden.** `Adapter::generate` passes drafts through
  a `ThinkFilter` that drops a leading `<think>…</think>` block (and the
  blank lines after it), and strips it from the saved reply. A tag later in
  a reply is left alone.
- **Empty replies say why.** One `empty_reply_error` for every adapter: a
  content filter or refusal is `CONTENT_FILTERED`; running out of length
  with no text points to **Longest reply**; anything else is a plain empty
  reply.
- Google lists models as `models/…`; the list drops that prefix so the
  connection check matches the name players type.

## Consequences

Saved connections keep working; `anthropic` is a new stored adapter value,
so an older app version cannot use a Claude connection made by a newer one.
Services that change their compatible API can still break, and **Other**
remains the escape hatch for anything with an OpenAI-compatible API.
Amazon Bedrock and Vertex AI need cloud credentials rather than an API key
and are reached through OpenRouter or a compatible gateway for now.
