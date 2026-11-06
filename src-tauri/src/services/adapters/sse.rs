//! Incremental server-sent-events reader. Network chunks can split lines,
//! events and multi-byte characters anywhere; this only yields whole events.

#[derive(Default)]
pub struct SseReader {
    buf: Vec<u8>,
    data: Option<String>,
}

impl SseReader {
    /// Feed raw bytes; returns the `data` payload of every completed event.
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(chunk);
        let mut out = Vec::new();
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let mut line: Vec<u8> = self.buf.drain(..=pos).collect();
            line.pop(); // '\n'
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            self.line(&String::from_utf8_lossy(&line), &mut out);
        }
        out
    }

    /// End of stream: dispatch whatever is left.
    pub fn finish(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        if !self.buf.is_empty() {
            let rest = std::mem::take(&mut self.buf);
            let rest = String::from_utf8_lossy(&rest)
                .trim_end_matches('\r')
                .to_string();
            self.line(&rest, &mut out);
        }
        if let Some(d) = self.data.take() {
            out.push(d);
        }
        out
    }

    fn line(&mut self, line: &str, out: &mut Vec<String>) {
        if line.is_empty() {
            if let Some(d) = self.data.take() {
                out.push(d);
            }
            return;
        }
        if line.starts_with(':') {
            return; // comment / keep-alive
        }
        let (field, value) = match line.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (line, ""),
        };
        if field == "data" {
            match &mut self.data {
                Some(d) => {
                    d.push('\n');
                    d.push_str(value);
                }
                None => self.data = Some(value.to_string()),
            }
        }
        // `event`, `id` and `retry` are not used by chat-completion streams.
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed_bytewise(input: &[u8]) -> Vec<String> {
        let mut r = SseReader::default();
        let mut out = Vec::new();
        for b in input {
            out.extend(r.push(std::slice::from_ref(b)));
        }
        out.extend(r.finish());
        out
    }

    #[test]
    fn events_split_at_any_byte_survive() {
        let input = "data: {\"a\":\"héllo 灯台\"}\n\n: keep-alive\n\ndata: [DONE]\n\n".as_bytes();
        assert_eq!(
            feed_bytewise(input),
            vec!["{\"a\":\"héllo 灯台\"}".to_string(), "[DONE]".to_string()]
        );
    }

    #[test]
    fn crlf_and_multiline_data() {
        let mut r = SseReader::default();
        let out = r.push(b"event: message\r\ndata: one\r\ndata: two\r\n\r\n");
        assert_eq!(out, vec!["one\ntwo".to_string()]);
    }

    #[test]
    fn unterminated_final_event_is_flushed() {
        let mut r = SseReader::default();
        assert!(r.push(b"data: {\"x\":1}").is_empty());
        assert_eq!(r.finish(), vec!["{\"x\":1}".to_string()]);
    }
}
