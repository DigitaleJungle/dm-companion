//! Readable plain text from 5etools entries, for the search index.

use serde_json::Value;

// Keys that hold metadata, not readable text.
const SKIP_KEYS: &[&str] = &[
    "type", "source", "page", "href", "style", "id", "ordinal", "credit", "width", "height", "srd", "srd52",
    "basicRules", "basicRules2024", "otherSources", "reprintedAs", "_copy", "tag", "hash", "url", "path",
];

/// Display text for one inline tag body, e.g. `spell Fireball|XPHB` → `Fireball`.
fn tag_display(tag: &str, body: &str) -> String {
    let parts: Vec<&str> = body.split('|').collect();
    let first = parts.first().copied().unwrap_or("");
    match tag {
        "dc" => format!("DC {first}"),
        "hit" => {
            if first.starts_with(['+', '-']) {
                first.to_string()
            } else {
                format!("+{first}")
            }
        }
        // `{@spell name|source|display}`: a third part, when present, is the text to show.
        _ => parts.get(2).filter(|d| !d.is_empty()).copied().unwrap_or(first).to_string(),
    }
}

/// Replaces `{@tag body}` markup with its display text. Handles nested tags (innermost first).
pub fn strip_tags(text: &str) -> String {
    let mut s = text.to_string();
    loop {
        // The last "{@" is always an innermost tag.
        let Some(start) = s.rfind("{@") else { return s };
        let Some(len) = s[start..].find('}') else { return s };
        let inner = &s[start + 2..start + len];
        let (tag, body) = inner.split_once(' ').unwrap_or((inner, ""));
        let display = tag_display(tag, body);
        s.replace_range(start..start + len + 1, &display);
    }
}

fn collect(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(s) => out.push(strip_tags(s)),
        Value::Array(items) => items.iter().for_each(|v| collect(v, out)),
        Value::Object(map) => {
            // serde_json sorts keys, so put the heading before the text it heads.
            if let Some(name) = map.get("name") {
                collect(name, out);
            }
            for (key, v) in map {
                if key != "name" && !SKIP_KEYS.contains(&key.as_str()) {
                    collect(v, out);
                }
            }
        }
        _ => {}
    }
}

/// All readable text in an entry tree, tags resolved, joined by spaces.
pub fn plain_text(value: &Value) -> String {
    let mut out = vec![];
    collect(value, &mut out);
    out.join(" ")
}

/// Book entry types that start their own named section in the search index.
pub const SECTION_TYPES: &[&str] = &["section", "entries", "inset", "insetReadaloud", "variant", "variantSub"];

/// A named section that gets its own search row.
pub fn is_section(value: &Value) -> bool {
    value.get("name").and_then(Value::as_str).is_some()
        && value.get("type").and_then(Value::as_str).is_some_and(|t| SECTION_TYPES.contains(&t))
}

/// Text of a section without the text of the named sections nested inside it (they're indexed separately).
pub fn own_text(section: &Value) -> String {
    fn walk(value: &Value, top: bool, out: &mut Vec<String>) {
        if !top && is_section(value) {
            return;
        }
        match value {
            Value::String(s) => out.push(strip_tags(s)),
            Value::Array(items) => items.iter().for_each(|v| walk(v, false, out)),
            Value::Object(map) => {
                for (key, v) in map {
                    if key != "name" && !SKIP_KEYS.contains(&key.as_str()) {
                        walk(v, false, out);
                    }
                }
            }
            _ => {}
        }
    }
    let mut out = vec![];
    walk(section, true, &mut out);
    out.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn strips_simple_and_display_tags() {
        assert_eq!(strip_tags("Cast {@spell fireball|XPHB}."), "Cast fireball.");
        assert_eq!(strip_tags("{@spell fireball|XPHB|the big boom}"), "the big boom");
        assert_eq!(strip_tags("Roll {@dice 1d6} and {@b stop}"), "Roll 1d6 and stop");
        assert_eq!(strip_tags("Make a {@dc 15} save, {@hit 5} to hit"), "Make a DC 15 save, +5 to hit");
        assert_eq!(strip_tags("no tags here"), "no tags here");
    }

    #[test]
    fn handles_nested_and_broken_tags() {
        assert_eq!(strip_tags("{@b bold {@i and italic}}"), "bold and italic");
        assert_eq!(strip_tags("unclosed {@b tag"), "unclosed {@b tag");
    }

    #[test]
    fn collects_readable_text_and_skips_metadata() {
        let entry = json!({
            "type": "entries", "name": "Hiding", "page": 33, "source": "XPHB",
            "entries": ["You hide with a {@skill Stealth} check.", { "type": "list", "items": ["One", "Two"] }]
        });
        assert_eq!(plain_text(&entry), "Hiding You hide with a Stealth check. One Two");
    }

    #[test]
    fn own_text_leaves_out_nested_sections() {
        let section = json!({
            "type": "section", "name": "Combat",
            "entries": ["Combat is fast.", { "type": "entries", "name": "Hiding", "entries": ["Sneaky."] }, { "type": "list", "items": ["Item"] }]
        });
        assert_eq!(own_text(&section), "Combat is fast. Item");
        assert!(is_section(&section));
        assert!(!is_section(&json!({ "type": "list", "items": [] })));
    }
}
