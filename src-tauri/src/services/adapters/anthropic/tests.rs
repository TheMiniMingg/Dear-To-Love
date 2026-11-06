use tokio_util::sync::CancellationToken;

use super::*;
use crate::domain::provider::{ModelMessage, Role};
use crate::errors::ErrorCode;
use crate::services::adapters::test_server::{serve, Reply};
use crate::services::adapters::Charge;

fn msg(role: Role, content: &str) -> ModelMessage {
    ModelMessage {
        role,
        content: content.into(),
    }
}

fn req() -> GenerateRequest {
    GenerateRequest {
        model_id: "claude-opus-5-5".into(),
        messages: vec![
            msg(Role::System, "You narrate."),
            msg(Role::User, "Open the letter"),
        ],
        max_output_tokens: 300,
        temperature: Some(0.9),
        timeout_ms: 5_000,
        context_tokens: Some(8192),
    }
}

fn event(v: Value) -> String {
    format!(
        "event: {}\ndata: {v}\n\n",
        v["type"].as_str().unwrap_or("x")
    )
}

/// A Messages stream: a thinking block (skipped), then the text pieces.
fn stream(pieces: &[&str], stop_reason: &str) -> Reply {
    let mut events = vec![
        event(
            json!({"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-opus-5-5","stop_reason":null,"usage":{"input_tokens":20,"cache_read_input_tokens":100,"cache_creation_input_tokens":5,"output_tokens":1}}}),
        ),
        event(
            json!({"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}),
        ),
        event(
            json!({"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"secret plan"}}),
        ),
        event(json!({"type":"content_block_stop","index":0})),
        event(json!({"type":"ping"})),
        event(
            json!({"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}),
        ),
    ];
    for p in pieces {
        events.push(event(
            json!({"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":p}}),
        ));
    }
    events.push(event(json!({"type":"content_block_stop","index":1})));
    events.push(event(json!({"type":"message_delta","delta":{"stop_reason":stop_reason,"stop_sequence":null},"usage":{"output_tokens":42}})));
    events.push(event(json!({"type":"message_stop"})));
    Reply::sse_raw(&events.concat())
}

async fn run(a: &Anthropic, r: &GenerateRequest) -> (Result<Completion, GenerateError>, String) {
    let mut seen = String::new();
    let out = a
        .generate(r, &CancellationToken::new(), &mut |t: &str| {
            seen.push_str(t)
        })
        .await;
    (out, seen)
}

#[tokio::test]
async fn streams_text_skips_thinking_and_counts_cached_input() {
    let server = serve(vec![stream(
        &["The lamp ", "hums. 灯台 ", "glows."],
        "end_turn",
    )])
    .await;
    let a = Anthropic::new(&server.base_url, Some("sk-ant-test".into())).unwrap();
    let (out, seen) = run(&a, &req()).await;
    let c = out.unwrap();
    assert_eq!(c.text, "The lamp hums. 灯台 glows.");
    assert_eq!(seen, c.text);
    assert_eq!(c.finish_reason, "stop");
    assert_eq!(
        c.usage,
        NormalizedUsage {
            input_tokens: Some(125),
            cached_input_tokens: Some(100),
            output_tokens: Some(42),
        }
    );

    let sent = &server.requests()[0];
    assert_eq!(sent.path, "/v1/messages");
    assert_eq!(sent.header("x-api-key"), Some("sk-ant-test"));
    assert_eq!(sent.header("anthropic-version"), Some(API_VERSION));
    assert_eq!(sent.authorization, None);
    let body: Value = serde_json::from_str(&sent.body).unwrap();
    assert_eq!(body["system"], "You narrate.");
    assert_eq!(body["max_tokens"], 300);
    assert_eq!(body["stream"], true);
    assert_eq!(
        body["messages"],
        json!([{"role":"user","content":"Open the letter"}])
    );
    // Current Claude models reject sampling settings, so none are sent.
    assert!(body.get("temperature").is_none());
}

#[test]
fn turns_start_with_the_player_and_alternate() {
    let a = Anthropic::new("https://api.anthropic.com/v1", None).unwrap();
    let r = GenerateRequest {
        messages: vec![
            msg(Role::System, "Rules."),
            msg(Role::Assistant, "Earlier reply"),
            msg(Role::User, "Look around"),
            msg(Role::User, "Then wave"),
            msg(Role::System, "Summary so far."),
            msg(Role::Assistant, "Mara waves back."),
            msg(Role::User, "Smile"),
        ],
        ..req()
    };
    let body = a.request_body(&r);
    assert_eq!(body["system"], "Rules.\n\nSummary so far.");
    assert_eq!(
        body["messages"],
        json!([
            {"role":"user","content":OPENING_TURN},
            {"role":"assistant","content":"Earlier reply"},
            {"role":"user","content":"Look around\n\nThen wave"},
            {"role":"assistant","content":"Mara waves back."},
            {"role":"user","content":"Smile"},
        ])
    );
}

#[tokio::test]
async fn a_refusal_without_text_is_reported_as_filtered() {
    let server = serve(vec![stream(&[], "refusal")]).await;
    let a = Anthropic::new(&server.base_url, Some("k".into())).unwrap();
    let err = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(err.error.code, ErrorCode::ContentFiltered);
    assert_eq!(err.charge, Charge::Unknown);
}

#[tokio::test]
async fn running_out_of_reply_length_while_thinking_says_what_to_raise() {
    let server = serve(vec![stream(&[], "max_tokens")]).await;
    let a = Anthropic::new(&server.base_url, Some("k".into())).unwrap();
    let err = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(err.error.code, ErrorCode::ProviderError);
    assert!(
        err.error.message.contains("Longest reply"),
        "{}",
        err.error.message
    );
}

#[tokio::test]
async fn a_cut_off_reply_is_kept_as_written() {
    let server = serve(vec![stream(&["Half a ", "sentence"], "max_tokens")]).await;
    let a = Anthropic::new(&server.base_url, Some("k".into())).unwrap();
    let c = run(&a, &req()).await.0.unwrap();
    assert_eq!(c.text, "Half a sentence");
    assert_eq!(c.finish_reason, "length");
}

#[tokio::test]
async fn http_and_stream_errors_map_to_plain_codes() {
    let server = serve(vec![
        Reply::json(
            401,
            r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#,
        ),
        Reply::json(
            400,
            r#"{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 250000 tokens > 200000 maximum"}}"#,
        ),
        Reply::sse_raw(&event(
            json!({"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}),
        )),
    ])
    .await;
    let a = Anthropic::new(&server.base_url, Some("k".into())).unwrap();
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::AuthFailed);
    assert_eq!(e.charge, Charge::None);
    assert!(e.error.message.contains("invalid x-api-key"));
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::ContextTooLong);
    let e = run(&a, &req()).await.0.unwrap_err();
    assert_eq!(e.error.code, ErrorCode::ProviderError);
    assert!(
        e.error.message.contains("overloaded"),
        "{}",
        e.error.message
    );
}

#[tokio::test]
async fn lists_models_with_the_key_header() {
    let server = serve(vec![Reply::json(
        200,
        r#"{"data":[{"type":"model","id":"claude-opus-5-5","display_name":"Claude Opus 5.5"},{"type":"model","id":"claude-haiku-5-5"}],"has_more":false}"#,
    )])
    .await;
    let a = Anthropic::new(&server.base_url, Some("sk-ant-x".into())).unwrap();
    assert_eq!(
        a.list_models().await.unwrap(),
        vec!["claude-opus-5-5".to_string(), "claude-haiku-5-5".into()]
    );
    let sent = &server.requests()[0];
    assert_eq!(sent.method, "GET");
    assert!(sent.path.starts_with("/v1/models"));
    assert_eq!(sent.header("x-api-key"), Some("sk-ant-x"));
}
