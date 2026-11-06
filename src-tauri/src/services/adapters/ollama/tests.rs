use serde_json::json;
use tokio_util::sync::CancellationToken;

use super::*;
use crate::domain::provider::ModelMessage;
use crate::errors::ErrorCode;
use crate::services::adapters::test_server::{serve, short_pause, Reply, TestServer};
use crate::services::adapters::Charge;

fn req() -> GenerateRequest {
    GenerateRequest {
        model_id: "llama3.2".into(),
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

/// The scripted server's root (it reports an OpenAI-style `/v1` base).
fn root(server: &TestServer) -> String {
    server.base_url.trim_end_matches("/v1").to_string()
}

fn piece(text: &str) -> Value {
    json!({"model":"llama3.2","message":{"role":"assistant","content":text},"done":false})
}

fn last(reason: &str) -> Value {
    json!({"model":"llama3.2","message":{"role":"assistant","content":""},"done":true,
           "done_reason":reason,"prompt_eval_count":812,"eval_count":57})
}

async fn run(a: &Ollama, r: &GenerateRequest) -> (Result<Completion, GenerateError>, String) {
    let mut seen = String::new();
    let out = a
        .generate(r, &CancellationToken::new(), &mut |t: &str| {
            seen.push_str(t)
        })
        .await;
    (out, seen)
}

#[test]
fn base_url_accepts_root_api_or_v1() {
    for b in [
        "http://localhost:11434",
        "http://localhost:11434/",
        "http://localhost:11434/api",
        "http://localhost:11434/v1/",
    ] {
        assert_eq!(api_root(b), "http://localhost:11434");
    }
}

/// T60: a local Ollama reply streams, reports tokens, and sets num_ctx.
#[tokio::test]
async fn streams_ndjson_sets_context_and_reports_tokens() {
    let server = serve(vec![Reply::ndjson(&[
        piece("The lamp "),
        json!({"message":{"role":"assistant","content":"","thinking":"hidden plan"},"done":false}),
        piece("hums. 灯台 "),
        piece("glows."),
        last("stop"),
    ])])
    .await;
    let a = Ollama::new(&root(&server), None).unwrap();
    let (out, seen) = run(&a, &req()).await;
    let c = out.unwrap();
    assert_eq!(c.text, "The lamp hums. 灯台 glows.");
    assert_eq!(seen, c.text);
    assert!(!c.text.contains("hidden plan"));
    assert_eq!(c.finish_reason, "stop");
    assert_eq!(
        c.usage,
        NormalizedUsage {
            input_tokens: Some(812),
            cached_input_tokens: None,
            output_tokens: Some(57),
        }
    );
    let sent = &server.requests()[0];
    assert_eq!(
        (sent.method.as_str(), sent.path.as_str()),
        ("POST", "/api/chat")
    );
    assert_eq!(sent.authorization, None);
    let body: Value = serde_json::from_str(&sent.body).unwrap();
    assert_eq!(body["model"], "llama3.2");
    assert_eq!(body["stream"], true);
    assert_eq!(body["options"]["num_ctx"], 8192);
    assert_eq!(body["options"]["num_predict"], 300);
    assert_eq!(body["messages"][0]["role"], "system");
    assert_eq!(body["messages"][1]["content"], "Open the letter");
}

#[tokio::test]
async fn whole_json_reply_and_missing_counts_stay_unknown() {
    let server = serve(vec![Reply::json(
        200,
        r#"{"message":{"role":"assistant","content":"Whole reply."},"done":true,"done_reason":"length"}"#,
    )])
    .await;
    let a = Ollama::new(&root(&server), None).unwrap();
    let (out, seen) = run(&a, &req()).await;
    let c = out.unwrap();
    assert_eq!(
        (c.text.as_str(), seen.as_str()),
        ("Whole reply.", "Whole reply.")
    );
    assert_eq!(c.finish_reason, "length");
    assert!(c.usage.is_empty());
}

#[tokio::test]
async fn errors_are_typed() {
    // Unknown model: refused, so nothing was used.
    let server = serve(vec![Reply::json(
        404,
        r#"{"error":"model \"llama9\" not found, try pulling it first"}"#,
    )])
    .await;
    let a = Ollama::new(&root(&server), None).unwrap();
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(
        (e.error.code, e.charge),
        (ErrorCode::ProviderError, Charge::None)
    );
    assert!(e.error.message.contains("try pulling it first"));

    // An error line mid-stream.
    let server = serve(vec![Reply::ndjson(&[
        piece("Half"),
        json!({"error":"an error was encountered while running the model"}),
    ])])
    .await;
    let a = Ollama::new(&root(&server), None).unwrap();
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::ProviderError);

    // Stream that ends without the final line.
    let server = serve(vec![Reply::ndjson(&[piece("Cut off")])]).await;
    let a = Ollama::new(&root(&server), None).unwrap();
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::ProviderUnreachable);

    // Nothing listening: never sent.
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let a = Ollama::new(&format!("http://127.0.0.1:{port}"), None).unwrap();
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(
        (e.error.code, e.charge),
        (ErrorCode::ProviderUnreachable, Charge::None)
    );
}

#[tokio::test]
async fn cancel_mid_stream() {
    let server = serve(vec![Reply::ndjson(&[
        piece("one "),
        piece("two "),
        piece("three "),
        last("stop"),
    ])
    .with_delay(std::time::Duration::from_millis(40))])
    .await;
    let a = Ollama::new(&root(&server), None).unwrap();
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
async fn lists_installed_models() {
    let server = serve(vec![Reply::json(
        200,
        r#"{"models":[{"name":"llama3.2:latest","model":"llama3.2:latest"},{"name":"qwen3:8b"}]}"#,
    )])
    .await;
    let a = Ollama::new(&root(&server), Some("remote-key".into())).unwrap();
    assert_eq!(
        a.list_models().await.unwrap(),
        vec!["llama3.2:latest".to_string(), "qwen3:8b".to_string()]
    );
    let sent = &server.requests()[0];
    assert_eq!(
        (sent.method.as_str(), sent.path.as_str()),
        ("GET", "/api/tags")
    );
    assert_eq!(sent.authorization.as_deref(), Some("Bearer remote-key"));
}
