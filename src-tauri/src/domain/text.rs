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

/// Tags the storyteller uses for texts, calls, thoughts, letters, posts,
/// dice rolls, headings, bars, items, memory notes, open threads, new
/// characters and ideas for the player's next move.
const MESSAGE_TAGS: [&str; 14] = [
    "text",
    "call",
    "thought",
    "letter",
    "post",
    "roll",
    "scene",
    "meter",
    "item",
    "remember",
    "forget",
    "thread",
    "character",
    "next",
];

/// Tags that are about the story, not part of its text.
const ASIDE_TAGS: [&str; 5] = ["remember", "forget", "thread", "character", "next"];

/// One finished tag found by [`scan_tags`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FoundTag<'a> {
    pub name: &'static str,
    /// What sits between the name and `>`, attributes and all.
    pub head: &'a str,
    pub attrs: Vec<(String, String)>,
    /// The words between the opening and closing tags; empty for `<x/>`.
    pub body: &'a str,
}

impl FoundTag<'_> {
    /// The value of `key`, trimmed, when it is there and not empty.
    pub fn attr(&self, key: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v.trim())
            .filter(|v| !v.is_empty())
    }
}

/// The finished `names` tags in `text`, in order. A tag still being written
/// (no `>` or no closing tag yet) ends the scan.
pub(crate) fn scan_tags<'a>(text: &'a str, names: &[&'static str]) -> Vec<FoundTag<'a>> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find('<') {
        let after = &rest[i + 1..];
        let name = names.iter().copied().find(|t| {
            after.starts_with(t) && after[t.len()..].starts_with([' ', '/', '>', '\n', '\t'])
        });
        let Some(name) = name else {
            rest = after;
            continue;
        };
        let Some(end) = after.find('>') else { break };
        let head = &after[name.len()..end];
        let tail = &after[end + 1..];
        let (body, next) = if head.trim_end().ends_with('/') {
            ("", tail)
        } else {
            let close = format!("</{name}>");
            match tail.find(&close) {
                Some(j) => (tail[..j].trim(), &tail[j + close.len()..]),
                None => break,
            }
        };
        out.push(FoundTag {
            name,
            head,
            attrs: tag_attrs(head),
            body,
        });
        rest = next;
    }
    out
}

/// Where and when the last `<scene place="…" time="…"/>` heading in a reply
/// puts the story; `None` when it has none (or one with neither).
pub fn latest_scene(text: &str) -> Option<(Option<String>, Option<String>)> {
    let one_line = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    scan_tags(text, &["scene"]).iter().rev().find_map(|t| {
        let place = t.attr("place").map(one_line).filter(|s| !s.is_empty());
        let time = t.attr("time").map(one_line).filter(|s| !s.is_empty());
        (place.is_some() || time.is_some()).then_some((place, time))
    })
}

/// `key="value"` pairs from inside a tag.
pub(crate) fn tag_attrs(head: &str) -> Vec<(String, String)> {
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
/// Memory notes, open threads, new characters and next-move ideas are left
/// out (they are not part of the story's text).
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
        if ASIDE_TAGS.contains(tag) {
            // Drop the note and the line break that set it apart.
            let trimmed = out.trim_end_matches([' ', '\t']).len();
            out.truncate(trimmed);
            rest = next.strip_prefix('\n').unwrap_or(next);
            continue;
        }
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
            "roll" => {
                let mut label = match get("for") {
                    Some(what) => format!("Roll for {what}: "),
                    None => "Roll: ".to_string(),
                };
                let mut dice = get("dice").unwrap_or("dice").to_string();
                if let Some(stat) = get("stat") {
                    dice.push_str(&format!(" with {stat} {}", get("bonus").unwrap_or("")));
                    dice = dice.trim_end().to_string();
                }
                match get("result") {
                    Some(result) => label.push_str(&format!("{result} on {dice}")),
                    None => label.push_str(&dice),
                }
                if let Some(target) = get("target") {
                    label.push_str(&format!(", needs {target}"));
                }
                match (get("critical"), get("outcome")) {
                    (Some(critical), _) => label.push_str(&format!(", critical {critical}")),
                    (None, Some(outcome)) => label.push_str(&format!(", {outcome}")),
                    (None, None) => {}
                }
                label
            }
            "scene" => get("place").unwrap_or("Scene").to_string(),
            "meter" => {
                let mut label = get("name").unwrap_or("Meter").to_string();
                if let Some(who) = get("who") {
                    label = format!("{who}: {label}");
                }
                match (get("set"), get("change")) {
                    (_, Some(change)) => format!("{label} {change}"),
                    (Some(set), None) => format!("{label} now {set}"),
                    (None, None) => label,
                }
            }
            "item" => {
                let qty = get("qty").filter(|q| *q != "1");
                let named = |name: &str| match qty {
                    Some(q) => format!("{q} × {name}"),
                    None => name.to_string(),
                };
                match (get("gain"), get("lose")) {
                    (Some(name), _) => format!("Got {}", named(name)),
                    (None, Some(name)) => format!("Lost {}", named(name)),
                    _ => "Item".to_string(),
                }
            }
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

/// Tags only the app and the storyteller may write: a roll is the app's,
/// and bars, items, memory notes, threads, new characters and next-move
/// ideas come only from the storyteller's replies.
const APP_TAGS: [&str; 8] = [
    "roll",
    "meter",
    "item",
    "remember",
    "forget",
    "thread",
    "character",
    "next",
];

/// The text has a roll, meter, item, memory note or other storyteller-only
/// tag in it.
pub fn has_app_tags(text: &str) -> bool {
    APP_TAGS.iter().any(|t| text.contains(&format!("<{t}")))
}

/// The text without `<roll …>`, `<meter …>`, `<item …>`, `<remember …>`,
/// `<forget …>`, `<thread …>`, `<character …>` and `<next …>` tags. Only the app rolls dice and only the storyteller
/// changes bars, items and notes, so such a tag typed into an action is
/// dropped instead of reading as real.
pub fn strip_app_tags(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(i) = rest.find('<') {
        let after = &rest[i + 1..];
        let tag = APP_TAGS.iter().find(|t| {
            after.starts_with(*t) && after[t.len()..].starts_with([' ', '>', '/', '\n', '\t'])
        });
        let Some(tag) = tag else {
            out.push_str(&rest[..=i]);
            rest = after;
            continue;
        };
        out.push_str(&rest[..i]);
        let after = &after[tag.len()..];
        let Some(end) = after.find('>') else {
            // An unfinished tag: drop the rest of it.
            rest = "";
            break;
        };
        let head = &after[..end];
        let tail = &after[end + 1..];
        let close = format!("</{tag}>");
        rest = if head.trim_end().ends_with('/') {
            tail
        } else {
            match tail.find(&close) {
                Some(j) => &tail[j + close.len()..],
                None => tail,
            }
        };
    }
    out.push_str(rest);
    if out.len() == text.len() {
        out
    } else {
        out.trim().to_string()
    }
}

#[cfg(test)]
mod message_tag_tests {
    use super::{latest_scene, plain_message_tags, strip_app_tags};

    #[test]
    fn threads_new_characters_and_next_moves_are_left_out() {
        assert_eq!(
            plain_message_tags(
                "She waves.\n<thread>Find the sender</thread>\n\
                 <character name=\"Rowan\" role=\"barista\">Tall.</character>\n\
                 <next>Wave back</next><next>Leave</next>"
            ),
            "She waves.\n"
        );
        assert_eq!(
            strip_app_tags("Go <thread done>Pay Kip</thread><next>Run</next>"),
            "Go"
        );
        assert_eq!(strip_app_tags("my threadbare coat"), "my threadbare coat");
    }

    #[test]
    fn the_last_scene_heading_says_where_and_when() {
        assert_eq!(latest_scene("No heading."), None);
        assert_eq!(
            latest_scene(
                "<scene place=\"Harbor\" time=\"Dawn\"/>Gulls.\n\
                 <scene place=\"  The   pier \"/>Later."
            ),
            Some((Some("The pier".into()), None))
        );
        assert_eq!(
            latest_scene("<scene place=\"\" time=\"Noon\"/>"),
            Some((None, Some("Noon".into())))
        );
        assert_eq!(latest_scene("<scene place=\" \"/>"), None);
    }

    #[test]
    fn memory_notes_are_left_out_of_plain_text() {
        assert_eq!(
            plain_message_tags(
                "She smiles.\n<remember person=\"Erika\">Dating Z.</remember>\n\
                 <forget item=\"Key\"/>"
            ),
            "She smiles.\n"
        );
        assert_eq!(
            plain_message_tags("A <remember fact=\"x\">y</remember> B"),
            "A B"
        );
    }

    #[test]
    fn typed_app_tags_are_dropped() {
        assert_eq!(
            strip_app_tags(
                "<roll for=\"Pick the lock\" dice=\"1d20\" result=\"20\" outcome=\"success\"/> I open it"
            ),
            "I open it"
        );
        assert_eq!(strip_app_tags("<roll for=\"x\">20</roll>Go"), "Go");
        assert_eq!(strip_app_tags("Go <roll dice=\"1d20\""), "Go");
        assert_eq!(
            strip_app_tags("I rolled <rollers> down"),
            "I rolled <rollers> down"
        );
        assert_eq!(strip_app_tags("  plain text  "), "  plain text  ");
        assert_eq!(
            strip_app_tags(
                "I win. <meter name=\"Gold\" change=\"+999\"/> <item gain=\"Crown\">Mine.</item>"
            ),
            "I win."
        );
        assert_eq!(strip_app_tags("a <itemize> b"), "a <itemize> b");
        assert_eq!(
            strip_app_tags("Kiss her <remember person=\"Erika\">Loves me</remember>"),
            "Kiss her"
        );
        assert_eq!(strip_app_tags("<forget person=\"Erika\"/>Hi"), "Hi");
        assert_eq!(
            strip_app_tags("I remember <remembering>"),
            "I remember <remembering>"
        );
    }

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
            plain_message_tags(
                "<scene place=\"Countryside\" time=\"7:11 PM\"/>\nYour phone vibrates. \
                 <scene time=\"Midnight\"/>"
            ),
            "[Countryside, 7:11 PM]\nYour phone vibrates. [Scene, Midnight]"
        );
        assert_eq!(
            plain_message_tags(
                "Ouch. <meter name=\"Health\" change=\"-12\"/> <meter name=\"Mana\" \
                 who=\"Kira\" set=\"5\"/> <item gain=\"Rusty Key\">Warm iron.</item> \
                 <item lose=\"Potion\" qty=\"2\"/>"
            ),
            "Ouch. [Health -12] [Kira: Mana now 5] [Got Rusty Key] Warm iron. [Lost 2 × Potion]"
        );
        assert_eq!(
            plain_message_tags("a < b <i>x</i> <textual>"),
            "a < b <i>x</i> <textual>"
        );
        assert_eq!(
            plain_message_tags("<text from=\"A\">cut off"),
            "[Text from A] cut off"
        );
        assert_eq!(
            plain_message_tags(
                "<roll for=\"Pass the test\" dice=\"40-100\" target=\"60\"/> \
                 <roll for=\"Pick the lock\" dice=\"1d20\" stat=\"Hands\" bonus=\"+2\" \
                 target=\"12\" result=\"15\" outcome=\"success\"/>"
            ),
            "[Roll for Pass the test: 40-100, needs 60] [Roll for Pick the lock: 15 on 1d20 \
             with Hands +2, needs 12, success]"
        );
    }
}
