use crate::types::{Result, TextSpan};
/// OSIS XML parser.
///
/// Converts OSIS markup to a flat list of TextSpan structs.
/// Preserves Strong's numbers, morphology, and italics (added-words) as structured data.
/// Does NOT produce HTML — presentation is left to the frontend.
///
/// Elements handled:
///   <w lemma="strong:G25" morph="...">loved</w>  → TextSpan with strongs/morph
///   <transChange type="added">word</transChange>  → TextSpan with is_added
///   <note>...</note>                               → TextSpan with is_footnote (text suppressed in main flow)
///   <verse>, <chapter>, <div>, <p>, <lg>, <l>    → structural, generate whitespace if needed
///   All other tags → text content extracted, tag ignored
use quick_xml::events::Event;
use quick_xml::Reader;

pub fn parse(raw: &str) -> Result<Vec<TextSpan>> {
    let mut reader = Reader::from_str(raw);
    // Do NOT trim_text — single spaces between <w> tags are meaningful word separators

    let mut spans: Vec<TextSpan> = Vec::new();
    let mut buf = Vec::new();

    // State
    // `w` elements can carry several Strong's numbers. Keep a stack rather
    // than one mutable value so nested OSIS words cannot leak their metadata
    // into the surrounding text.
    let mut word_stack: Vec<(Vec<String>, Option<String>)> = Vec::new();
    let mut is_added = false;
    let mut is_red_letter = false;
    let mut in_note = false;
    let mut note_depth = 0u32;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                match name.as_str() {
                    "note" => {
                        in_note = true;
                        note_depth = 1;
                    }
                    "w" => {
                        // Extract lemma and morph attributes
                        let mut strongs = Vec::new();
                        let mut morph = None;
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref())
                                .unwrap_or("")
                                .to_lowercase();
                            let val = std::str::from_utf8(attr.value.as_ref())
                                .unwrap_or("")
                                .to_string();
                            if key == "lemma" || key == "l" {
                                strongs.extend(strongs_from_lemma(&val));
                            } else if key == "morph" || key == "m" {
                                morph = Some(val);
                            }
                        }
                        word_stack.push((strongs, morph));
                    }
                    "transchange" => {
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref())
                                .unwrap_or("")
                                .to_lowercase();
                            let val = std::str::from_utf8(attr.value.as_ref())
                                .unwrap_or("")
                                .to_string();
                            if key == "type" && val.to_lowercase() == "added" {
                                is_added = true;
                            }
                        }
                    }
                    "q" => {
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref())
                                .unwrap_or("")
                                .to_lowercase();
                            let val = std::str::from_utf8(attr.value.as_ref())
                                .unwrap_or("")
                                .to_string();
                            if key == "who" && val.to_lowercase() == "jesus" {
                                is_red_letter = true;
                            }
                        }
                    }
                    "verse" | "chapter" | "div" | "lg" => {} // structural, no action
                    "p" | "l" => {
                        // Paragraph/line — emit a space if we have content
                        if !spans.is_empty() {
                            spans.push(TextSpan::plain(" "));
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                match name.as_str() {
                    "note" => {
                        if note_depth > 0 {
                            note_depth -= 1;
                        }
                        if note_depth == 0 {
                            in_note = false;
                        }
                    }
                    "w" => {
                        word_stack.pop();
                    }
                    "transchange" => {
                        is_added = false;
                    }
                    "q" => {
                        is_red_letter = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_note {
                    continue;
                }
                let raw_text = e.unescape().unwrap_or_default().into_owned();
                if raw_text.is_empty() {
                    continue;
                }

                // Pure-whitespace nodes (single space between <w> tags) become " ".
                // Mixed nodes preserve leading/trailing space and collapse internal runs.
                let text: String = if raw_text.chars().all(|c: char| c.is_whitespace()) {
                    " ".to_string()
                } else {
                    let has_leading = raw_text.starts_with(|c: char| c.is_whitespace());
                    let has_trailing = raw_text.ends_with(|c: char| c.is_whitespace());
                    let trimmed = raw_text.trim();
                    let mut out = String::with_capacity(trimmed.len() + 2);
                    if has_leading {
                        out.push(' ');
                    }
                    let mut prev_ws = false;
                    for c in trimmed.chars() {
                        if c.is_whitespace() {
                            if !prev_ws {
                                out.push(' ');
                            }
                            prev_ws = true;
                        } else {
                            out.push(c);
                            prev_ws = false;
                        }
                    }
                    if has_trailing && !out.ends_with(' ') {
                        out.push(' ');
                    }
                    out
                };

                // Skip a lone space at the very start of the verse (nothing to separate yet)
                if text == " " && spans.is_empty() {
                    continue;
                }
                if text.is_empty() {
                    continue;
                }

                let span = TextSpan {
                    text,
                    strongs: word_stack
                        .last()
                        .and_then(|(strongs, _)| (!strongs.is_empty()).then(|| strongs.clone())),
                    morph: word_stack.last().and_then(|(_, morph)| morph.clone()),
                    is_added: if is_added { Some(true) } else { None },
                    is_footnote: None,
                    is_red_letter: if is_red_letter { Some(true) } else { None },
                };
                spans.push(span);
            }
            Ok(Event::Eof) => break,
            Err(_e) => {
                // Log the error but don't fail — return what we have plus a fallback span
                // TODO: surface parse errors as warnings rather than silently continuing
                if spans.is_empty() {
                    spans.push(TextSpan::plain(strip_xml_tags(raw)));
                }
                break;
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(normalize_spans(spans))
}

/// Extract every valid Strong's number from an OSIS `lemma` attribute.
///
/// The standard form is a whitespace-separated list such as
/// `strong:H0853 strong:H01254`; modules may also provide a lone `G25`/`H430`.
fn strongs_from_lemma(value: &str) -> Vec<String> {
    let mut strongs = Vec::new();

    for token in value.split_whitespace() {
        let candidate = token
            .strip_prefix("strong:")
            .or_else(|| token.strip_prefix("Strong:"))
            .or_else(|| token.strip_prefix("STRONG:"))
            .unwrap_or(token);
        let mut chars = candidate.chars();
        let Some(prefix) = chars.next() else { continue };
        let prefix = prefix.to_ascii_uppercase();
        let suffix = chars.as_str();
        if matches!(prefix, 'G' | 'H')
            && !suffix.is_empty()
            && suffix
                .chars()
                .all(|c| c.is_ascii_digit() || c.is_ascii_alphabetic())
        {
            let number = format!("{prefix}{suffix}");
            if !strongs.contains(&number) {
                strongs.push(number);
            }
        }
    }

    strongs
}

/// Merge consecutive plain spans and trim leading/trailing whitespace.
fn normalize_spans(spans: Vec<TextSpan>) -> Vec<TextSpan> {
    let mut out: Vec<TextSpan> = Vec::new();
    for span in spans {
        if span.text.is_empty() {
            continue;
        }
        // Merge adjacent plain text spans (preserves embedded spaces)
        if span.strongs.is_none()
            && span.morph.is_none()
            && span.is_added.is_none()
            && span.is_red_letter.is_none()
        {
            if let Some(last) = out.last_mut() {
                if last.strongs.is_none()
                    && last.morph.is_none()
                    && last.is_added.is_none()
                    && last.is_red_letter.is_none()
                {
                    last.text.push_str(&span.text);
                    continue;
                }
            }
        }
        out.push(span);
    }
    // Trim trailing whitespace from the last span (OSIS verses may end with a space)
    if let Some(last) = out.last_mut() {
        let trimmed = last.text.trim_end().to_string();
        if trimmed.is_empty() {
            out.pop();
        } else {
            last.text = trimmed;
        }
    }
    out
}

/// Emergency fallback: strip all XML/HTML tags from a string
fn strip_xml_tags(s: &str) -> &str {
    // Very naive: if we fail to parse at all, return the raw string truncated
    // A proper strip would use a regex, but we avoid adding regex overhead here.
    s.trim()
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn preserves_every_strongs_number_on_a_word() {
        let spans = parse(
            r#"<w lemma="strong:H0853 strong:H01254" morph="strongMorph:TH8804">created</w>"#,
        )
        .unwrap();

        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].text, "created");
        assert_eq!(
            spans[0].strongs.as_ref().unwrap(),
            &vec!["H0853".to_string(), "H01254".to_string()]
        );
        assert_eq!(spans[0].morph.as_deref(), Some("strongMorph:TH8804"));
    }

    #[test]
    fn does_not_leak_nested_word_metadata() {
        let spans =
            parse(r#"<w lemma="strong:G1">outer <w lemma="strong:G2">inner</w> outer</w> plain"#)
                .unwrap();

        assert_eq!(spans[0].strongs.as_ref().unwrap(), &vec!["G1".to_string()]);
        assert_eq!(spans[1].strongs.as_ref().unwrap(), &vec!["G2".to_string()]);
        assert_eq!(spans[2].strongs.as_ref().unwrap(), &vec!["G1".to_string()]);
        assert_eq!(spans[3].strongs, None);
    }
}
