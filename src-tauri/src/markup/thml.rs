use crate::types::{Result, TextSpan};
/// ThML (Theological Markup Language) parser — plain-text extraction.
///
/// ThML is HTML-like XML. We extract text content and Strong's numbers from
/// <sync type="Strongs" value="G25"/> elements. Formatting tags are ignored.
/// Footnotes (<note>) are skipped from the main text flow.
use quick_xml::events::Event;
use quick_xml::Reader;

pub fn parse(raw: &str) -> Result<Vec<TextSpan>> {
    let mut reader = Reader::from_str(raw);
    reader.config_mut().trim_text(true);

    let mut spans = Vec::new();
    let mut buf = Vec::new();
    let mut pending_strongs: Option<String> = None;
    let mut in_note = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                if name == "sync" {
                    let mut sync_type = String::new();
                    let mut sync_val = String::new();
                    for attr in e.attributes().flatten() {
                        let k = std::str::from_utf8(attr.key.as_ref())
                            .unwrap_or("")
                            .to_lowercase();
                        let v = std::str::from_utf8(attr.value.as_ref())
                            .unwrap_or("")
                            .to_string();
                        if k == "type" {
                            sync_type = v.to_lowercase();
                        }
                        if k == "value" {
                            sync_val = v;
                        }
                    }
                    if sync_type == "strongs" && !sync_val.is_empty() {
                        pending_strongs = Some(sync_val);
                    }
                }
            }
            Ok(Event::Start(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                if name == "note" || name == "scripref" {
                    in_note = true;
                }
            }
            Ok(Event::End(ref e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_lowercase();
                if name == "note" || name == "scripref" {
                    in_note = false;
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_note {
                    continue;
                }
                let text = e.unescape().unwrap_or_default().into_owned();
                if text.trim().is_empty() {
                    continue;
                }
                spans.push(TextSpan {
                    text,
                    strongs: pending_strongs.take().map(|strongs| vec![strongs]),
                    morph: None,
                    is_added: None,
                    is_footnote: None,
                    is_red_letter: None,
                });
            }
            Ok(Event::Eof) => break,
            Err(_) => {
                // On parse failure, return the raw text stripped of tags as a fallback
                if spans.is_empty() {
                    let stripped = raw
                        .chars()
                        .scan(0i32, |depth, c| {
                            if c == '<' {
                                *depth += 1;
                                Some(None)
                            } else if c == '>' {
                                *depth -= 1;
                                Some(None)
                            } else if *depth == 0 {
                                Some(Some(c))
                            } else {
                                Some(None)
                            }
                        })
                        .flatten()
                        .collect::<String>();
                    spans.push(TextSpan::plain(stripped.trim()));
                }
                break;
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(spans)
}
