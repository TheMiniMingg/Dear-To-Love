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
