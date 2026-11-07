//! Open threads: the promises, mysteries, goals and plans a story has not
//! settled yet, kept as a short quest log in the story's state.
//!
//! The storyteller writes them as tags at the end of a reply, and the
//! reader shows them on the "Memory updated" line under it:
//!
//! - `<thread>Find out who sent the letter</thread>` opens one;
//! - `<thread done>Find out who sent the letter</thread>` settles it (also
//!   `done="yes"` or `status="done"`): it moves to the done list.
//!
//! Replay applies the tags of each reply in order, like memory notes, so
//! every route and branch keeps its own log. The player can tick, change and
//! remove threads too, and undo what one reply wrote.

use super::text::{scan_tags, FoundTag};

/// Open threads a story keeps; past this, new ones are not added.
pub const MAX_OPEN: usize = 40;
/// Settled threads kept for the log; the oldest go first.
pub const MAX_DONE: usize = 40;
pub const MAX_THREAD_TEXT: usize = 200;

/// One thread tag in a reply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ThreadTag {
    Open(String),
    Done(String),
}

impl ThreadTag {
    pub fn text(&self) -> &str {
        match self {
            ThreadTag::Open(t) | ThreadTag::Done(t) => t,
        }
    }
}

/// A thread's key, for matching: lower case, single spaces, no closing
/// full stop.
pub fn thread_key(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches(['.', '?', '!', '。', '？', '！'])
        .to_lowercase()
}

fn clip(s: &str) -> String {
    let one_line = s.split_whitespace().collect::<Vec<_>>().join(" ");
    one_line.chars().take(MAX_THREAD_TEXT).collect()
}

/// `done`, `done="yes"`, `status="done"` (or resolved, settled, closed).
fn is_done(tag: &FoundTag<'_>) -> bool {
    let settled = |v: &str| {
        matches!(
            v.to_lowercase().as_str(),
            "done" | "yes" | "true" | "resolved" | "settled" | "closed"
        )
    };
    if tag.attr("done").is_some_and(settled) || tag.attr("status").is_some_and(settled) {
        return true;
    }
    // A bare `done` word outside any quotes.
    let mut quoted = false;
    let mut bare = String::new();
    for ch in tag.head.chars() {
        if ch == '"' {
            quoted = !quoted;
        } else if !quoted {
            bare.push(ch);
        }
    }
    // `done="no"` leaves `done=` here, an attribute and not the word.
    let words: Vec<&str> = bare
        .split(|c: char| c.is_whitespace() || c == '/')
        .filter(|w| !w.is_empty())
        .collect();
    words.iter().enumerate().any(|(i, w)| {
        w.eq_ignore_ascii_case("done") && !words.get(i + 1).is_some_and(|n| n.starts_with('='))
    })
}

/// The `<thread>` tags in `text`, in order. A tag without words, or one
/// still being written, is left out.
pub fn scan(text: &str) -> Vec<ThreadTag> {
    scan_tags(text, &["thread"])
        .iter()
        .filter_map(|t| {
            let words = clip(t.body);
            if words.is_empty() {
                None
            } else if is_done(t) {
                Some(ThreadTag::Done(words))
            } else {
                Some(ThreadTag::Open(words))
            }
        })
        .collect()
}

fn position(list: &[String], text: &str) -> Option<usize> {
    let key = thread_key(text);
    list.iter().position(|t| thread_key(t) == key)
}

/// Open `text`: added at the end unless it is open already; taken off the
/// done list if it was settled before.
pub fn open(open: &mut Vec<String>, done: &mut Vec<String>, text: &str) {
    if let Some(i) = position(done, text) {
        done.remove(i);
    }
    if position(open, text).is_none() && open.len() < MAX_OPEN {
        open.push(text.to_string());
    }
}

/// Settle `text`: it leaves the open list (keeping the words it had there)
/// and goes to the end of the done list.
pub fn settle(open: &mut Vec<String>, done: &mut Vec<String>, text: &str) {
    let words = match position(open, text) {
        Some(i) => open.remove(i),
        None => text.to_string(),
    };
    if let Some(i) = position(done, &words) {
        done.remove(i);
    }
    done.push(words);
    if done.len() > MAX_DONE {
        let extra = done.len() - MAX_DONE;
        done.drain(..extra);
    }
}

/// Apply the thread tags in one of the storyteller's replies.
pub fn apply_reply(open_list: &mut Vec<String>, done_list: &mut Vec<String>, text: &str) {
    for tag in scan(text) {
        match tag {
            ThreadTag::Open(t) => open(open_list, done_list, &t),
            ThreadTag::Done(t) => settle(open_list, done_list, &t),
        }
    }
}

/// Take `text` out of `list`; its place and words, when it was there.
pub fn take(list: &mut Vec<String>, text: &str) -> Option<(usize, String)> {
    let i = position(list, text)?;
    Some((i, list.remove(i)))
}

/// The place and words of `text` in `list`.
pub fn find<'a>(list: &'a [String], text: &str) -> Option<(usize, &'a String)> {
    position(list, text).map(|i| (i, &list[i]))
}

/// Where `text` stands in the log: `Some(false)` open, `Some(true)`
/// settled, `None` in neither.
pub fn standing(open: &[String], done: &[String], text: &str) -> Option<bool> {
    if position(open, text).is_some() {
        Some(false)
    } else if position(done, text).is_some() {
        Some(true)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_open_and_done_tags() {
        let text = "She smiles.\n<thread>Find out who sent the letter</thread>\n\
                    <thread done>Get the key back.</thread>\n\
                    <thread status=\"resolved\">Pay Kip</thread>\n\
                    <thread done=\"no\">Ask about the done deal</thread>\n\
                    <thread>  </thread><thread>Unfinished";
        assert_eq!(
            scan(text),
            vec![
                ThreadTag::Open("Find out who sent the letter".into()),
                ThreadTag::Done("Get the key back.".into()),
                ThreadTag::Done("Pay Kip".into()),
                ThreadTag::Open("Ask about the done deal".into()),
            ]
        );
    }

    #[test]
    fn opening_settling_and_opening_again() {
        let (mut open_list, mut done_list) = (vec!["Get the key back".to_string()], vec![]);
        apply_reply(
            &mut open_list,
            &mut done_list,
            "<thread>Find the sender</thread><thread done>get the key  back.</thread>",
        );
        assert_eq!(open_list, vec!["Find the sender"]);
        assert_eq!(done_list, vec!["Get the key back"]);
        // The same thread again is not added twice.
        apply_reply(
            &mut open_list,
            &mut done_list,
            "<thread>Find the sender.</thread>",
        );
        assert_eq!(open_list, vec!["Find the sender"]);
        // A settled thread can come back.
        apply_reply(
            &mut open_list,
            &mut done_list,
            "<thread>Get the key back</thread>",
        );
        assert_eq!(open_list, vec!["Find the sender", "Get the key back"]);
        assert!(done_list.is_empty());
        assert_eq!(
            standing(&open_list, &done_list, "find the sender"),
            Some(false)
        );
        assert_eq!(standing(&open_list, &done_list, "Pay Kip"), None);
        // Settling one that was never open still logs it.
        settle(&mut open_list, &mut done_list, "Pay Kip");
        assert_eq!(standing(&open_list, &done_list, "Pay Kip"), Some(true));
    }

    #[test]
    fn the_log_keeps_its_size() {
        let (mut open_list, mut done_list) = (Vec::new(), Vec::new());
        for n in 0..MAX_OPEN + 5 {
            open(&mut open_list, &mut done_list, &format!("Thread {n}"));
        }
        assert_eq!(open_list.len(), MAX_OPEN);
        for n in 0..MAX_DONE + 5 {
            settle(&mut open_list, &mut done_list, &format!("Old {n}"));
        }
        assert_eq!(done_list.len(), MAX_DONE);
        assert_eq!(done_list[0], "Old 5");
        let long = "x".repeat(MAX_THREAD_TEXT + 50);
        assert_eq!(
            scan(&format!("<thread>{long}</thread>"))[0].text().len(),
            MAX_THREAD_TEXT
        );
    }
}
