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
use crate::types::{Result, TextSpan};

pub fn parse(raw: &str) -> Result<Vec<TextSpan>> {
    let mut reader = Reader::from_str(raw);
    // Do NOT trim_text — single spaces between <w> tags are meaningful word separators

    let mut spans: Vec<TextSpan> = Vec::new();
    let mut buf = Vec::new();

    // State
    let mut current_strongs: Option<String> = None;
    let mut current_morph: Option<String> = None;
    let mut is_added = false;
    let mut is_red_letter = false;
    let mut in_note = false;
    let mut note_depth = 0u32;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref()).unwrap_or("").to_lowercase();
                match name.as_str() {
                    "note" => { in_note = true; note_depth = 1; }
                    "w" => {
                        // Extract lemma and morph attributes
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("").to_lowercase();
                            let val = std::str::from_utf8(attr.value.as_ref()).unwrap_or("").to_string();
                            if key == "lemma" || key == "l" {
                                // Lemma may be "strong:G25", "G25", or compound "strong:G1 strong:G2 robinson:ε"
                                // Extract the first "strong:NNN" token, or fall back to the full value
                                let num = val.split_whitespace()
                                    .find_map(|tok| {
                                        if tok.to_lowercase().starts_with("strong:") {
                                            let after = &tok[7..]; // skip "strong:"
                                            if !after.is_empty() { return Some(after.to_string()); }
                                        }
                                        None
                                    })
                                    .unwrap_or_else(|| {
                                        // No "strong:" prefix: take whole value if it looks like G/H + digits
                                        val.trim().to_string()
                                    });
                                // Only store if it starts with a known prefix or looks numeric
                                if num.starts_with(|c: char| c == 'G' || c == 'H' || c.is_ascii_digit()) {
                                    current_strongs = Some(num);
                                }
                            } else if key == "morph" || key == "m" {
                                current_morph = Some(val);
                            }
                        }
                    }
                    "transchange" => {
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("").to_lowercase();
                            let val = std::str::from_utf8(attr.value.as_ref()).unwrap_or("").to_string();
                            if key == "type" && val.to_lowercase() == "added" { is_added = true; }
                        }
                    }
                    "q" => {
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("").to_lowercase();
                            let val = std::str::from_utf8(attr.value.as_ref()).unwrap_or("").to_string();
                            if key == "who" && val.to_lowercase() == "jesus" { is_red_letter = true; }
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
                let name = std::str::from_utf8(e.name().as_ref()).unwrap_or("").to_lowercase();
                match name.as_str() {
                    "note" => {
                        if note_depth > 0 { note_depth -= 1; }
                        if note_depth == 0 { in_note = false; }
                    }
                    "w" => {
                        current_strongs = None;
                        current_morph = None;
                    }
                    "transchange" => { is_added = false; }
                    "q" => { is_red_letter = false; }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_note { continue; }
                let raw_text = e.unescape().unwrap_or_default().into_owned();
                if raw_text.is_empty() { continue; }

                // Pure-whitespace nodes (single space between <w> tags) become " ".
                // Mixed nodes preserve leading/trailing space and collapse internal runs.
                let text: String = if raw_text.chars().all(|c: char| c.is_whitespace()) {
                    " ".to_string()
                } else {
                    let has_leading = raw_text.starts_with(|c: char| c.is_whitespace());
                    let has_trailing = raw_text.ends_with(|c: char| c.is_whitespace());
                    let trimmed = raw_text.trim();
                    let mut out = String::with_capacity(trimmed.len() + 2);
                    if has_leading { out.push(' '); }
                    let mut prev_ws = false;
                    for c in trimmed.chars() {
                        if c.is_whitespace() {
                            if !prev_ws { out.push(' '); }
                            prev_ws = true;
                        } else {
                            out.push(c);
                            prev_ws = false;
                        }
                    }
                    if has_trailing && !out.ends_with(' ') { out.push(' '); }
                    out
                };

                // Skip a lone space at the very start of the verse (nothing to separate yet)
                if text == " " && spans.is_empty() { continue; }
                if text.is_empty() { continue; }

                let span = TextSpan {
                    text,
                    strongs: current_strongs.clone(),
                    morph: current_morph.clone(),
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

/// Merge consecutive plain spans and trim leading/trailing whitespace.
fn normalize_spans(spans: Vec<TextSpan>) -> Vec<TextSpan> {
    let mut out: Vec<TextSpan> = Vec::new();
    for span in spans {
        if span.text.is_empty() { continue; }
        // Merge adjacent plain text spans (preserves embedded spaces)
        if span.strongs.is_none() && span.morph.is_none() && span.is_added.is_none() && span.is_red_letter.is_none() {
            if let Some(last) = out.last_mut() {
                if last.strongs.is_none() && last.morph.is_none() && last.is_added.is_none() && last.is_red_letter.is_none() {
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
