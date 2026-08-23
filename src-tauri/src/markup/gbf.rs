/// GBF (General Bible Format) parser — basic fidelity.
///
/// GBF uses inline tags: <FO>text<Fo> (bold), <WT123> (Strong's), <WTG00025> (Strong's Greek)
/// This parser extracts plain text + Strong's numbers, discards formatting tags.
/// It does NOT crash on unknown tags — unknown tags produce no output.
///
/// Reference: https://crosswire.org/wiki/Markup_languages_for_digital_Bibles#GBF
use crate::types::{Result, TextSpan};

pub fn parse(raw: &str) -> Result<Vec<TextSpan>> {
    let mut spans = Vec::new();
    let mut current_strongs: Option<String> = None;
    let mut red_letter = false;
    let mut pos = 0;
    let bytes = raw.as_bytes();

    while pos < bytes.len() {
        if bytes[pos] == b'<' {
            // Find closing >
            if let Some(end) = raw[pos..].find('>') {
                let tag = &raw[pos + 1..pos + end];
                let tag_upper = tag.to_uppercase();

                if tag_upper == "FR" {
                    // GBF red letter start (Christ's words)
                    red_letter = true;
                } else if tag_upper == "FR_END" || tag == "Fr" {
                    red_letter = false;
                } else if tag_upper.starts_with("WT") {
                    // Strong's tag: <WT123> or <WTG00025> or <WTH430>
                    let num_part = &tag[2..];
                    let strongs = if num_part.starts_with('G') || num_part.starts_with('H') {
                        // Already has letter prefix
                        num_part.trim_start_matches('0').to_string()
                    } else {
                        // Bare number — assume Greek for NT (heuristic; real modules set context)
                        format!("G{}", num_part.trim_start_matches('0'))
                    };
                    current_strongs = Some(strongs);
                } else if tag_upper.starts_with("WTH") || tag_upper.starts_with("WG") {
                    let digits = tag[3..].trim_start_matches('0');
                    let prefix = if tag_upper.starts_with("WG") {
                        "G"
                    } else {
                        "H"
                    };
                    current_strongs = Some(format!("{prefix}{digits}"));
                } else if tag_upper == "WT" {
                    // End of Strong's word
                    current_strongs = None;
                }
                // All other tags ignored (formatting, footnote markers, etc.)
                pos += end + 1;
            } else {
                // Unclosed tag — skip the '<' and continue
                pos += 1;
            }
        } else {
            // Plain text — collect until next '<'
            let end = raw[pos..].find('<').map_or(raw.len(), |i| pos + i);
            let text = &raw[pos..end];
            if !text.is_empty() {
                spans.push(TextSpan {
                    text: text.to_string(),
                    strongs: current_strongs.clone().map(|strongs| vec![strongs]),
                    morph: None,
                    is_added: None,
                    is_footnote: None,
                    is_red_letter: if red_letter { Some(true) } else { None },
                });
            }
            pos = end;
        }
    }

    Ok(spans)
}
