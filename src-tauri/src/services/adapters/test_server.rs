//! Scripted HTTP/1.1 server on 127.0.0.1 for adapter and generation tests.
//! Each accepted connection takes the next scripted reply.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Clone)]
pub struct Reply {
    pub status: u16,
    pub content_type: &'static str,
    /// (delay before, bytes) pieces written with chunked encoding.
    pub chunks: Vec<(Duration, Vec<u8>)>,
    /// Close the socket without finishing the body (a dropped connection).
    pub drop_mid_body: bool,
}

impl Reply {
    pub fn json(status: u16, body: &str) -> Self {
        Self {
            status,
            content_type: "application/json",
            chunks: vec![(Duration::ZERO, body.as_bytes().to_vec())],
            drop_mid_body: false,
        }
    }

    /// SSE stream of chat-completion deltas, then optional usage and `[DONE]`.
    pub fn sse_text(pieces: &[&str], usage: Option<&str>) -> Self {
        let mut events: Vec<String> = pieces
            .iter()
            .map(|p| {
                format!(
                    "data: {}\n\n",
                    serde_json::json!({"choices":[{"index":0,"delta":{"content":p},"finish_reason":null}]})
                )
            })
            .collect();
        events.push(format!(
            "data: {}\n\n",
            serde_json::json!({"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]})
        ));
        if let Some(u) = usage {
            events.push(format!("data: {{\"choices\":[],\"usage\":{u}}}\n\n"));
        }
        events.push("data: [DONE]\n\n".into());
        Self::sse_raw(&events.concat())
    }

    /// Raw SSE body, deliberately split into small uneven chunks.
    pub fn sse_raw(body: &str) -> Self {
        let bytes = body.as_bytes();
        let chunks = bytes
            .chunks(7)
            .map(|c| (Duration::ZERO, c.to_vec()))
            .collect();
        Self {
            status: 200,
            content_type: "text/event-stream",
            chunks,
            drop_mid_body: false,
        }
    }

    pub fn with_delay(mut self, d: Duration) -> Self {
        for c in &mut self.chunks {
            c.0 = d;
        }
        self
    }

    pub fn dropped(mut self) -> Self {
        self.drop_mid_body = true;
        self
    }
}

#[derive(Debug, Clone)]
pub struct Recorded {
    pub method: String,
    pub path: String,
    pub authorization: Option<String>,
    pub body: String,
}

pub struct TestServer {
    pub base_url: String,
    pub requests: Arc<Mutex<Vec<Recorded>>>,
}

impl TestServer {
    pub fn requests(&self) -> Vec<Recorded> {
        self.requests.lock().unwrap().clone()
    }
}

pub async fn serve(replies: Vec<Reply>) -> TestServer {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let recorded = requests.clone();
    let replies = Arc::new(Mutex::new(replies.into_iter()));
    tokio::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                return;
            };
            let next = replies.lock().unwrap().next();
            let recorded = recorded.clone();
            tokio::spawn(async move {
                let Some(req) = read_request(&mut sock).await else {
                    return;
                };
                recorded.lock().unwrap().push(req);
                let Some(reply) = next else {
                    let _ = sock
                        .write_all(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                        .await;
                    return;
                };
                let head = format!(
                    "HTTP/1.1 {} X\r\nContent-Type: {}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
                    reply.status, reply.content_type
                );
                if sock.write_all(head.as_bytes()).await.is_err() {
                    return;
                }
                let n = reply.chunks.len();
                for (i, (delay, bytes)) in reply.chunks.into_iter().enumerate() {
                    if reply.drop_mid_body && i == n / 2 {
                        let _ = sock.shutdown().await;
                        return;
                    }
                    if !delay.is_zero() {
                        tokio::time::sleep(delay).await;
                    }
                    let frame = [
                        format!("{:x}\r\n", bytes.len()).into_bytes(),
                        bytes,
                        b"\r\n".to_vec(),
                    ]
                    .concat();
                    if sock.write_all(&frame).await.is_err() {
                        return;
                    }
                    let _ = sock.flush().await;
                }
                let _ = sock.write_all(b"0\r\n\r\n").await;
                let _ = sock.shutdown().await;
            });
        }
    });
    TestServer {
        base_url: format!("http://{addr}/v1"),
        requests,
    }
}

async fn read_request(sock: &mut tokio::net::TcpStream) -> Option<Recorded> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];
    let header_end = loop {
        let n = sock.read(&mut tmp).await.ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break p + 4;
        }
    };
    let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let mut lines = head.lines();
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.to_string();
    let path = first.next()?.to_string();
    let mut len = 0usize;
    let mut authorization = None;
    for l in lines {
        if let Some((k, v)) = l.split_once(':') {
            match k.trim().to_ascii_lowercase().as_str() {
                "content-length" => len = v.trim().parse().unwrap_or(0),
                "authorization" => authorization = Some(v.trim().to_string()),
                _ => {}
            }
        }
    }
    let mut body = buf[header_end..].to_vec();
    while body.len() < len {
        let n = sock.read(&mut tmp).await.ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..n]);
    }
    Some(Recorded {
        method,
        path,
        authorization,
        body: String::from_utf8_lossy(&body).to_string(),
    })
}

/// Wait helper for tests that race against streaming.
pub async fn short_pause() {
    tokio::time::sleep(Duration::from_millis(30)).await;
}
