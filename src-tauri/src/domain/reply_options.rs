//! Choices the player makes for one reply only: how long it is, and a hint
//! for Another reply ("shorter", "more romantic"). They go with that reply's
//! request and never into the story.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::errors::{AppError, AppResult};

/// A hint is a few words, not a new story setup.
pub const MAX_HINT: usize = 300;

/// Normal length is no choice at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ReplyLength {
    Short,
    Long,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ReplyOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub length: Option<ReplyLength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hint: Option<String>,
}

impl ReplyOptions {
    /// The options with blank parts left out, checked.
    pub fn cleaned(&self) -> AppResult<Self> {
        let hint = self
            .hint
            .as_deref()
            .map(str::trim)
            .filter(|h| !h.is_empty())
            .map(str::to_string);
        if hint.as_ref().is_some_and(|h| h.chars().count() > MAX_HINT) {
            return Err(AppError::invalid_input(format!(
                "a hint must be at most {MAX_HINT} characters"
            )));
        }
        Ok(Self {
            length: self.length,
            hint,
        })
    }

    pub fn is_empty(&self) -> bool {
        self.length.is_none() && self.hint.is_none()
    }

    /// What the storyteller is told after the player's action, for this
    /// reply only.
    pub fn direction(&self) -> Option<String> {
        let mut parts: Vec<String> = Vec::new();
        match self.length {
            Some(ReplyLength::Short) => {
                parts.push("keep this reply short, one or two short paragraphs".into())
            }
            Some(ReplyLength::Long) => {
                parts.push("make this reply longer than usual, with more detail".into())
            }
            None => {}
        }
        if let Some(h) = self
            .hint
            .as_deref()
            .map(str::trim)
            .filter(|h| !h.is_empty())
        {
            parts.push(format!("the player asks for this: {h}"));
        }
        if parts.is_empty() {
            return None;
        }
        Some(format!(
            "(Out of character, for this reply only: {}. Never mention this note in the story.)",
            parts.join("; ")
        ))
    }

    /// Stored with the run; nothing at all when there is nothing to say.
    pub fn to_json(&self) -> Option<String> {
        (!self.is_empty()).then(|| serde_json::to_string(self).expect("options serialize"))
    }

    /// From the run's stored column. Unreadable options count as none.
    pub fn from_json(json: Option<&str>) -> Self {
        json.and_then(|j| serde_json::from_str(j).ok())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn options_say_what_the_next_reply_should_be() {
        assert_eq!(ReplyOptions::default().direction(), None);
        let o = ReplyOptions {
            length: Some(ReplyLength::Short),
            hint: Some("  more romantic ".into()),
        }
        .cleaned()
        .unwrap();
        assert_eq!(o.hint.as_deref(), Some("more romantic"));
        let d = o.direction().unwrap();
        assert!(d.contains("short") && d.contains("the player asks for this: more romantic"));
        assert_eq!(ReplyOptions::from_json(o.to_json().as_deref()), o);
        let blank = ReplyOptions {
            length: None,
            hint: Some("   ".into()),
        }
        .cleaned()
        .unwrap();
        assert!(blank.is_empty() && blank.to_json().is_none());
        let long = ReplyOptions {
            length: None,
            hint: Some("x".repeat(MAX_HINT + 1)),
        };
        assert!(long.cleaned().is_err());
        assert_eq!(
            ReplyOptions::from_json(Some("not json")),
            ReplyOptions::default()
        );
    }
}
