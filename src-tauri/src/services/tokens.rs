//! Approximate token counts for prompt budgeting and Prompt Preview.
//!
//! No provider tokenizer is bundled, so this deliberately overestimates:
//! about 3.3 ASCII characters per token (English averages nearer 4) and one
//! token for every other character (CJK and emoji are rarely cheaper).
//! Provider-reported usage, when a reply returns it, is what the ledger
//! records; these numbers only decide what fits.

use crate::domain::provider::ModelMessage;

/// Role markers and separators around each chat message.
pub const MESSAGE_OVERHEAD: u32 = 4;
/// Tokens that prime the reply after the last message.
pub const PROMPT_OVERHEAD: u32 = 3;

pub fn estimate_text(s: &str) -> u32 {
    let (mut ascii, mut other) = (0u64, 0u64);
    for c in s.chars() {
        if c.is_ascii() {
            ascii += 1;
        } else {
            other += 1;
        }
    }
    u32::try_from((ascii * 3).div_ceil(10) + other).unwrap_or(u32::MAX)
}

pub fn estimate_message(m: &ModelMessage) -> u32 {
    estimate_text(&m.content).saturating_add(MESSAGE_OVERHEAD)
}

pub fn estimate_messages(messages: &[ModelMessage]) -> u32 {
    messages
        .iter()
        .map(estimate_message)
        .fold(PROMPT_OVERHEAD, u32::saturating_add)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::provider::Role;

    #[test]
    fn overestimates_english_and_counts_other_scripts_per_character() {
        let english = "The lighthouse keeper climbed the stairs slowly.";
        // 48 characters: about 11 real tokens; we say 15.
        assert_eq!(estimate_text(english), 15);
        assert_eq!(estimate_text("灯台守"), 3);
        assert_eq!(estimate_text(""), 0);
    }

    #[test]
    fn messages_include_overheads() {
        let m = ModelMessage {
            role: Role::User,
            content: "abc".into(),
        };
        assert_eq!(estimate_message(&m), 1 + MESSAGE_OVERHEAD);
        assert_eq!(
            estimate_messages(&[m.clone(), m]),
            PROMPT_OVERHEAD + 2 * (1 + MESSAGE_OVERHEAD)
        );
    }
}
