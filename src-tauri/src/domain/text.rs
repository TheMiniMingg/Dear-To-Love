//! Plain-text helpers for search and excerpts.

/// Case-insensitive key for one character. A character whose lowercase
/// form is more than one character keeps its own form, so positions in
/// folded text line up with the original.
pub fn fold(c: char) -> char {
    let mut lower = c.to_lowercase();
    match (lower.next(), lower.next()) {
        (Some(l), None) => l,
        _ => c,
    }
}

/// The first `max` characters of `text` on one line (whitespace runs become
/// one space), cut at a word and ending in "…" when shortened.
pub fn excerpt(text: &str, max: usize) -> String {
    let mut out = String::new();
    let mut n = 0;
    for word in text.split_whitespace() {
        let len = word.chars().count();
        let need = len + usize::from(n > 0);
        if n + need > max {
            if n == 0 {
                out.extend(word.chars().take(max));
            }
            out.push('…');
            return out;
        }
        if n > 0 {
            out.push(' ');
        }
        out.push_str(word);
        n += need;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_case_without_moving_positions() {
        let folded: String = "ÉCLAIR İstanbul".chars().map(fold).collect();
        assert_eq!(folded, "éclair İstanbul");
        assert_eq!(folded.chars().count(), "ÉCLAIR İstanbul".chars().count());
    }

    #[test]
    fn excerpts_cut_at_a_word() {
        assert_eq!(excerpt("  The lamp\n\nis lit.  ", 40), "The lamp is lit.");
        assert_eq!(excerpt("The lamp is lit tonight", 12), "The lamp is…");
        assert_eq!(excerpt("Unbreakableword", 5), "Unbre…");
        assert_eq!(excerpt("", 5), "");
    }
}

/// Tags the storyteller uses for texts, calls, thoughts, letters and posts.
const MESSAGE_TAGS: [&str; 5] = ["text", "call", "thought", "letter", "post"];

/// `key="value"` pairs from inside a tag.
fn tag_attrs(head: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut rest = head;
    while let Some(eq) = rest.find("=\"") {
        let key = rest[..eq]
            .rsplit(|c: char| c.is_whitespace())
            .next()
            .unwrap_or("")
            .to_string();
        let value_start = &rest[eq + 2..];
        let Some(close) = value_start.find('"') else {
            break;
        };
        out.push((key, value_start[..close].trim().to_string()));
        rest = &value_start[close + 1..];
    }
    out
}

/// Message tags written out as plain text, for exports and offline
/// summaries: `<text from="Erika">Hi</text>` becomes `[Text from Erika] Hi`.
/// Anything that is not a known tag is left as it is.
pub fn plain_message_tags(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(i) = rest.find('<') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let tag = MESSAGE_TAGS
            .iter()
            .find(|t| after.starts_with(*t) && after[t.len()..].starts_with([' ', '>', '/']));
        let (Some(tag), Some(end)) = (tag, after.find('>')) else {
            out.push('<');
            rest = after;
            continue;
        };
        let head = &after[tag.len()..end];
        let attrs = tag_attrs(head);
        let get = |k: &str| {
            attrs
                .iter()
                .find(|(key, _)| key == k)
                .map(|(_, v)| v.as_str())
                .filter(|v| !v.is_empty())
        };
        let close = format!("</{tag}>");
        let tail = &after[end + 1..];
        let (body, next) = if head.trim_end().ends_with('/') {
            ("", tail)
        } else {
            match tail.find(&close) {
                Some(j) => (tail[..j].trim(), &tail[j + close.len()..]),
                None => (tail.trim(), ""),
            }
        };
        let label = match *tag {
            "text" => match (get("from"), get("to")) {
                (Some(from), _) => format!("Text from {from}"),
                (None, Some(to)) => format!("Text to {to}"),
                _ => "Text".to_string(),
            },
            "call" => match (get("with"), get("status")) {
                (Some(w), Some(s)) => format!("Call with {w}: {s}"),
                (Some(w), None) => format!("Call with {w}"),
                (None, Some(s)) => format!("Call: {s}"),
                _ => "Call".to_string(),
            },
            "thought" => format!("{} thinks", get("who").unwrap_or("Someone")),
            "letter" => match get("from") {
                Some(from) => format!("Letter from {from}"),
                None => "Letter".to_string(),
            },
            _ => match get("from") {
                Some(from) => format!("Post by {from}"),
                None => "Post".to_string(),
            },
        };
        let label = match get("time") {
            Some(time) => format!("{label}, {time}"),
            None => label,
        };
        if *tag == "thought" {
            out.push_str(&format!("({label}: {body})"));
        } else if body.is_empty() {
            out.push_str(&format!("[{label}]"));
        } else {
            out.push_str(&format!("[{label}] {body}"));
        }
        rest = next;
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod message_tag_tests {
    use super::plain_message_tags;

    #[test]
    fn message_tags_become_plain_text() {
        assert_eq!(
            plain_message_tags(
                "Your phone buzzes.\n<text from=\"Erika K.\" time=\"7:11 PM\">Z...?\nIs that \
                 really you?</text>\n<call with=\"Erika K.\" status=\"ringing\"/> Ring.\n\
                 <thought who=\"Mara\">Careful.</thought> <text to=\"Erika\">hi</text> \
                 <letter>Dear you</letter> <post from=\"Kit\">Sunset!</post>"
            ),
            "Your phone buzzes.\n[Text from Erika K., 7:11 PM] Z...?\nIs that really you?\n\
             [Call with Erika K.: ringing] Ring.\n(Mara thinks: Careful.) [Text to Erika] hi \
             [Letter] Dear you [Post by Kit] Sunset!"
        );
        assert_eq!(
            plain_message_tags("a < b <i>x</i> <textual>"),
            "a < b <i>x</i> <textual>"
        );
        assert_eq!(
            plain_message_tags("<text from=\"A\">cut off"),
            "[Text from A] cut off"
        );
    }
}
