//! Reader for STEPBible-Data's plain-text lexicons (Tyndale House Cambridge,
//! CC BY 4.0: https://github.com/STEPBible/STEPBible-Data) — a different
//! shape of resource than the SWORD zLD/RawLD modules the rest of `sword/`
//! reads: tab-separated text files, not a CrossWire-installable module, so
//! they're fetched straight from GitHub and cached locally instead of going
//! through `ModuleRegistry`.
//!
//! Three sources, all sharing the same 8-column layout (eStrong#, dStrong#,
//! uStrong#, lemma, transliteration, morph, gloss, meaning):
//!   - TBESG: corrected/extended Abbott-Smith for Greek, with a clean
//!     human-curated one-word `gloss` column.
//!   - TBESH: Hebrew, based on BDB's full numbered sense structure (not just
//!     a short gloss).
//!   - TFLSJ: the full Liddell-Scott-Jones lexicon reformatted for Bible
//!     words — the deepest option, covering all of Greek literature rather
//!     than just NT usage.

use crate::sword::lexicon::{is_untranslated_marker_text, parse_strongs_number};
use crate::types::{AppError, Result, StrongsEntry};
use std::path::{Path, PathBuf};

/// Strips TEI/HTML-ish markup the way `lexicon::strip_xml_tags` does, except
/// it inserts a space at every tag boundary instead of deleting the tag
/// outright. STEPBible's data uses bare `<br>` as its ONLY separator between
/// numbered sub-senses ("lover<br>1) to love<br>1a) (Qal)") — removing the
/// tag with nothing in its place glues adjacent words together
/// ("lover1)  to love1a)"), which `strip_xml_tags` never has to handle
/// because our other sources always have real whitespace around their tags.
fn strip_stepbible_markup(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Removes a `<tag ...>...</tag>` element (the tag AND its content, unlike
/// `strip_stepbible_markup` which keeps the content) — used for `<ref>`
/// verse-citation elements, which read as pure clutter inline in a
/// definition ("Jo 13:35", "Ro 5:8") rather than part of the meaning.
fn remove_tag_and_content(xml: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = String::with_capacity(xml.len());
    let mut pos = 0;
    while let Some(rel) = xml[pos..].find(&open) {
        let abs = pos + rel;
        out.push_str(&xml[pos..abs]);
        match xml[abs..].find(&close) {
            Some(end_rel) => pos = abs + end_rel + close.len(),
            None => {
                pos = xml.len();
                break;
            }
        }
    }
    out.push_str(&xml[pos..]);
    out
}

/// Removes every `[...]` bracketed aside — Abbott-Smith and LSJ both use
/// square brackets for etymological/Septuagint cross-references and source
/// citations ("[in LXX for אַהֲבָה, which is also rendered by ἀγάπησις and
/// φιλία;]", "[LXX+2nd c.BC+]") that interrupt the actual meaning with
/// citation detail most readers don't need.
fn remove_bracketed_spans(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0u32;
    for ch in s.chars() {
        match ch {
            '[' => depth += 1,
            ']' if depth > 0 => depth -= 1,
            c if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out
}

/// Removes inline runs of Greek or Hebrew script — Abbott-Smith and LSJ both
/// weave the original word's synonyms and cross-references directly into
/// English prose in their own script ("distinct from φιλία, friendship").
/// The lemma is already shown in its own script in the sheet's header, so
/// this only ever removes *extra* foreign words mixed into the body text,
/// which are unreadable clutter for anyone who doesn't read Greek/Hebrew.
fn remove_foreign_script_words(s: &str) -> String {
    fn is_foreign(c: char) -> bool {
        let cp = c as u32;
        (0x0370..=0x03FF).contains(&cp) // Greek and Coptic
            || (0x1F00..=0x1FFF).contains(&cp) // Greek Extended
            || (0x0590..=0x05FF).contains(&cp) // Hebrew (incl. points/cantillation)
    }
    fn continues_foreign(chars: &[char], i: usize) -> bool {
        is_foreign(chars[i]) || ((chars[i] == '-' || chars[i] == '\'') && chars.get(i + 1).is_some_and(|&c| is_foreign(c)))
    }

    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        if continues_foreign(&chars, i) {
            while i < chars.len() && continues_foreign(&chars, i) {
                i += 1;
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// Cleans up the orphaned punctuation left behind once bracketed asides and
/// foreign words have been removed (e.g. "love, , esteem" -> "love, esteem",
/// or a leading ", " where the sentence used to open with a removed word).
fn cleanup_punctuation(s: &str) -> String {
    let mut out = s.split_whitespace().collect::<Vec<_>>().join(" ");
    loop {
        let replaced = out
            .replace(" , ", ", ")
            .replace(" ; ", "; ")
            .replace(", ,", ",")
            .replace(", ;", ";")
            .replace("; ,", ";")
            .replace("(, ", "(")
            .replace(", )", ")")
            .replace("( )", "")
            .replace("[ ]", "")
            .replace(" ,", ",")
            .replace(" ;", ";")
            .replace(" .", ".");
        if replaced == out {
            break;
        }
        out = replaced;
    }
    out.trim_start_matches([',', ';', ':', ' ']).to_string()
}

/// Converts STEPBible's "Meaning" column — TEI/HTML-ish markup weaving
/// together English prose, bracketed citations, verse references, and
/// inline Greek/Hebrew script — into plain, readable English. See the
/// individual helpers above for what each pass removes and why.
fn clean_stepbible_prose(raw_html: &str) -> String {
    let without_refs = remove_tag_and_content(raw_html, "ref");
    let plain = strip_stepbible_markup(&without_refs);
    let without_brackets = remove_bracketed_spans(&plain);
    let without_foreign = remove_foreign_script_words(&without_brackets);
    cleanup_punctuation(&without_foreign)
}

pub struct StepBibleSource {
    pub id: &'static str,
    filename: &'static str,
    url: &'static str,
}

pub const TBESG: StepBibleSource = StepBibleSource {
    id: "TBESG",
    filename: "TBESG.txt",
    url: "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt",
};

pub const TBESH: StepBibleSource = StepBibleSource {
    id: "TBESH",
    filename: "TBESH.txt",
    url: "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt",
};

pub const TFLSJ: StepBibleSource = StepBibleSource {
    id: "TFLSJ",
    filename: "TFLSJ.txt",
    url: "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/TFLSJ%20%200-5624%20-%20Translators%20Formatted%20full%20LSJ%20Bible%20lexicon%20-%20STEPBible.org%20CC%20BY.txt",
};

pub fn source_for_id(id: &str) -> Option<&'static StepBibleSource> {
    match id {
        "TBESG" => Some(&TBESG),
        "TBESH" => Some(&TBESH),
        "TFLSJ" => Some(&TFLSJ),
        _ => None,
    }
}

fn local_path(cache_dir: &Path, source: &StepBibleSource) -> PathBuf {
    cache_dir.join(source.filename)
}

/// Downloads the source's data file if it isn't already cached. Safe to call
/// on every lookup — the exists() check makes repeat calls a no-op.
pub fn ensure_downloaded(cache_dir: &Path, source: &StepBibleSource) -> Result<()> {
    let path = local_path(cache_dir, source);
    if path.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(cache_dir)
        .map_err(|e| AppError::Sword(format!("cannot create {}: {e}", cache_dir.display())))?;

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let bytes = client
        .get(source.url)
        .send()
        .map_err(|e| AppError::Network(format!("{}: {e}", source.id)))?
        .error_for_status()
        .map_err(|e| AppError::Network(format!("{}: {e}", source.id)))?
        .bytes()
        .map_err(|e| AppError::Network(e.to_string()))?;

    // Download to a temp file first so a crash/kill mid-download can't leave
    // a truncated file that is_downloaded() would treat as complete.
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, &bytes)
        .map_err(|e| AppError::Sword(format!("cannot write {}: {e}", tmp_path.display())))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| AppError::Sword(format!("cannot finalize {}: {e}", path.display())))?;
    Ok(())
}

pub fn get_entry(cache_dir: &Path, source: &StepBibleSource, number: &str) -> Result<StrongsEntry> {
    let path = local_path(cache_dir, source);
    let content = std::fs::read_to_string(&path).map_err(|_| {
        AppError::Sword(format!("{} not downloaded yet", source.id))
    })?;

    // Numbers in this data are zero-padded to 4 digits after the language
    // prefix (e.g. "G0026", "H0157"), unlike our bare-number SWORD modules.
    let n = parse_strongs_number(number)?;
    let prefix = number.chars().next().unwrap_or('H');
    let target = format!("{prefix}{n:04}\t");

    for line in content.lines() {
        if line.starts_with(&target) {
            return parse_row(number, line);
        }
    }

    Err(AppError::Sword(format!(
        "Strong's number {number} not found in {}",
        source.id
    )))
}

fn parse_row(number: &str, line: &str) -> Result<StrongsEntry> {
    let cols: Vec<&str> = line.split('\t').collect();
    if cols.len() < 8 {
        return Err(AppError::Sword(format!(
            "malformed STEPBible row for {number}"
        )));
    }

    let lemma = cols[3].trim().to_string();
    let transliteration = cols[4].trim().to_string();
    let part_of_speech = cols[5].trim().to_string();
    let gloss = cols[6].trim().to_string();
    // Raw Meaning text mixes English prose with verse-reference citations,
    // bracketed etymological/Septuagint asides, and inline Greek/Hebrew
    // words — clean_stepbible_prose strips all of that down to plain
    // readable English (see its doc comment for the full pipeline).
    let long_def = clean_stepbible_prose(cols[7]);
    let is_untranslated_marker = is_untranslated_marker_text(&long_def);

    Ok(StrongsEntry {
        number: number.to_string(),
        lemma: if lemma.is_empty() { number.to_string() } else { lemma },
        transliteration,
        part_of_speech,
        short_def: if gloss.is_empty() {
            long_def.chars().take(160).collect()
        } else {
            gloss
        },
        long_def,
        usage_count: 0,
        usage_by_book: vec![],
        is_untranslated_marker,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_real_tbesg_row() {
        let line = "G0026\tG0026 =\tG0026\tἀγάπη\tagapē\tG:N-F\tlove\t <b>ἀγάπη</b>, -ης, ἡ <BR /> [in LXX for אַהֲבָה, which is also rendered by ἀγάπησις and φιλία ;] <BR /> <b>love, goodwill, esteem</b>.";
        let entry = parse_row("G26", line).unwrap();
        assert_eq!(entry.lemma, "ἀγάπη");
        assert_eq!(entry.short_def, "love");
        assert!(entry.long_def.contains("love, goodwill, esteem"));
        assert!(!entry.long_def.contains('<'));
        // The bracketed LXX/Septuagint cross-reference and the lemma's own
        // repeated Greek script are exactly the "languages and refs" clutter
        // this parser is meant to strip from the readable definition.
        assert!(!entry.long_def.contains('['));
        assert!(!entry.long_def.contains("LXX"));
        assert!(!entry.long_def.chars().any(|c| (0x0370..=0x03FF).contains(&(c as u32))));
    }

    #[test]
    fn real_abbott_smith_entry_reads_as_plain_english() {
        // The actual raw TBESG row for G26 — mixes English prose with a
        // bracketed LXX cross-reference, inline Greek synonym words in the
        // SYN. discussion, and <ref> verse citations throughout.
        let line = "G0026\tG0026 =\tG0026\tἀγάπη\tagapē\tG:N-F\tlove\t <b>ἀγάπη</b>, -ης, ἡ <BR /> [in LXX for אַהֲבָה, which is also rendered by ἀγάπησις and φιλία ;] <BR /> <b>love, goodwill, esteem</b>. Outside of bibl. and eccl. books, there is no clear instance. In NT, like ἀγαπάω, -ῶ, <BR />__1. <b>Of men's love</b>: <BR />__(a) to one another, <ref='John.13.35'>Jhn 13:35;</ref> <BR /> __(b) to God, <ref='1Jn.2.5.'>1Jn 2:5.</ref><BR /> <re><i>SYN.</i>: φιλία. It is thus distinct from φιλία, <b>friendship</b>, στοργή, <b>natural affection</b>, and ἔρως, <b>sexual love</b>.</re>";
        let entry = parse_row("G26", line).unwrap();
        assert!(entry.long_def.contains("love, goodwill, esteem"));
        assert!(entry.long_def.contains("Of men's love"));
        assert!(entry.long_def.contains("distinct from"));
        assert!(entry.long_def.contains("friendship"));
        // No verse citations, no brackets, no leftover Greek script anywhere.
        assert!(!entry.long_def.contains("13:35"));
        assert!(!entry.long_def.contains("2:5"));
        assert!(!entry.long_def.contains('['));
        assert!(!entry.long_def.contains('<'));
        assert!(!entry.long_def.chars().any(|c| (0x0370..=0x03FF).contains(&(c as u32))));
        // No orphaned punctuation left behind by the removed words.
        assert!(!entry.long_def.contains(" ,"));
        assert!(!entry.long_def.contains(", ,"));
        assert!(!entry.long_def.starts_with(','));
    }

    #[test]
    fn strips_tflsj_hover_tooltip_citations_entirely() {
        // TFLSJ's hover-tooltip citations are always bracket-wrapped in the
        // source text, so once bracket-stripping is in the pipeline the
        // whole citation — both the hidden title and the visible bracketed
        // text — should read as pure clutter and disappear, leaving only
        // the actual English meaning.
        let line = "G0026\tG0026 =\tG0026\tἀγάπη\tagapē\tG:N-F\tlove\t<b>love,</b> [<a href=\"javascript:void(0)\" title=\"LXX.Jer.2.2\">LXX+2nd c.BC+</a>] used of divine love.";
        let entry = parse_row("G26", line).unwrap();
        assert!(entry.long_def.contains("used of divine love"));
        assert!(!entry.long_def.contains("LXX"));
        assert!(!entry.long_def.contains("javascript"));
        assert!(!entry.long_def.contains("Jer.2.2"));
        assert!(!entry.long_def.contains('['));
    }

    #[test]
    fn rejects_a_malformed_row() {
        let result = parse_row("G26", "G0026\tonly\tthree\tcolumns");
        assert!(result.is_err());
    }
}
