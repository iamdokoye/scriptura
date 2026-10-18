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
use once_cell::sync::Lazy;
use regex::Regex;
use std::path::{Path, PathBuf};

static REF_ATTR_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)<ref(?:=['"]?([^'">]+)['"]?)?>(.*?)</ref>"#).unwrap()
});

fn normalize_ref_tags(s: &str) -> String {
    REF_ATTR_RE
        .replace_all(s, |caps: &regex::Captures| {
            let target = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            let content = caps.get(2).map(|m| m.as_str().trim()).unwrap_or("");
            if target.is_empty() {
                format!("<ref target=\"{content}\">{content}</ref>")
            } else {
                format!("<ref target=\"{target}\">{content}</ref>")
            }
        })
        .to_string()
}

static A_TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"(?is)<a[^>]*>(.*?)</a>"#).unwrap());

fn unwrap_a_tags(s: &str) -> String {
    A_TAG_RE.replace_all(s, "$1").to_string()
}

static BR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"(?i)<br\s*/?>"#).unwrap());

fn replace_br_with_newline(s: &str) -> String {
    BR_RE.replace_all(s, "\n").to_string()
}

static HTML_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)</?([a-zA-Z0-9_-]+)(?:[\s/=][^>]*)?>"#).unwrap()
});

fn strip_unsupported_tags(s: &str) -> String {
    HTML_TAG_RE
        .replace_all(s, |caps: &regex::Captures| {
            let tag_name = caps
                .get(1)
                .map(|m| m.as_str().to_ascii_lowercase())
                .unwrap_or_default();
            match tag_name.as_str() {
                "b" | "i" | "ref" => caps.get(0).unwrap().as_str().to_string(),
                _ => String::new(),
            }
        })
        .to_string()
}

fn cleanup_punctuation(s: &str) -> String {
    let mut out = s.to_string();
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
            .replace(" .", ".")
            .replace(" :", ":")
            .replace(", .", ".")
            .replace(",.", ".");
        if replaced == out {
            break;
        }
        out = replaced;
    }
    out
}

static SENSE_MARKER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"__([IVXLCDM]+)\b|__(\d+)\.|__(\d+)\b|__\(([a-z])\)|(?:\n|^)\s*(\d{1,2})([a-z]{1,2})?(\d{1,2})?\)",
    )
    .unwrap()
});

fn format_sense_outline(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_end = 0;

    for caps in SENSE_MARKER_RE.captures_iter(s) {
        let m = caps.get(0).unwrap();
        out.push_str(s[last_end..m.start()].trim_end());

        let (label, depth) = if let Some(roman) = caps.get(1) {
            (roman.as_str().to_string(), 0)
        } else if let Some(n) = caps.get(2) {
            (n.as_str().to_string(), 0)
        } else if let Some(n) = caps.get(3) {
            (n.as_str().to_string(), 1)
        } else if let Some(letter) = caps.get(4) {
            (letter.as_str().to_string(), 2)
        } else {
            let digits = caps.get(5).unwrap().as_str();
            let letters = caps.get(6).map(|m| m.as_str());
            let digits2 = caps.get(7).map(|m| m.as_str());
            let depth = match (letters, digits2) {
                (None, _) => 0,
                (Some(_), None) => 1,
                (Some(_), Some(_)) => 2,
            };
            (
                format!("{digits}{}{}", letters.unwrap_or(""), digits2.unwrap_or("")),
                depth,
            )
        };

        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&"  ".repeat(depth));
        out.push_str(&label);
        out.push(')');
        out.push(' ');
        last_end = m.end();
    }
    out.push_str(s[last_end..].trim_end());

    out.lines()
        .map(|l| {
            let indent = l.len() - l.trim_start().len();
            let trimmed = l.trim();
            format!(
                "{}{}",
                &" ".repeat(indent),
                trimmed.split_whitespace().collect::<Vec<_>>().join(" ")
            )
        })
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Converts STEPBible's "Meaning" column into formatted rich text preserving
/// Greek and Hebrew text, Septuagint references, Scripture citations, and
/// hierarchical sense outlines.
fn clean_stepbible_prose(raw_html: &str) -> String {
    let unwrap_a = unwrap_a_tags(raw_html);
    let norm_refs = normalize_ref_tags(&unwrap_a);
    let with_re = norm_refs.replace("<re>", "\n\n").replace("</re>", "\n\n");
    let with_br = replace_br_with_newline(&with_re);
    let stripped = strip_unsupported_tags(&with_br);
    let cleaned = cleanup_punctuation(&stripped);
    format_sense_outline(&cleaned)
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
    let content = std::fs::read_to_string(&path)
        .map_err(|_| AppError::Sword(format!("{} not downloaded yet", source.id)))?;

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
        lemma: if lemma.is_empty() {
            number.to_string()
        } else {
            lemma
        },
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
        assert!(entry.long_def.contains("<b>ἀγάπη</b>"));
        assert!(entry.long_def.contains("LXX"));
        assert!(entry.long_def.contains("אַהֲבָה"));
        assert!(entry.long_def.contains("ἀγάπησις"));
        assert!(entry.long_def.contains("φιλία"));
    }

    #[test]
    fn real_abbott_smith_entry_preserves_greek_and_verse_citations() {
        let line = "G0026\tG0026 =\tG0026\tἀγάπη\tagapē\tG:N-F\tlove\t <b>ἀγάπη</b>, -ης, ἡ <BR /> [in LXX for אַהֲבָה, which is also rendered by ἀγάπησις and φιλία ;] <BR /> <b>love, goodwill, esteem</b>. Outside of bibl. and eccl. books, there is no clear instance. In NT, like ἀγαπάω, -ῶ, <BR />__1. <b>Of men's love</b>: <BR />__(a) to one another, <ref='John.13.35'>Jhn 13:35;</ref> <BR /> __(b) to God, <ref='1Jn.2.5.'>1Jn 2:5.</ref><BR /> <re><i>SYN.</i>: φιλία. It is thus distinct from φιλία, <b>friendship</b>, στοργή, <b>natural affection</b>, and ἔρως, <b>sexual love</b>.</re>";
        let entry = parse_row("G26", line).unwrap();
        assert!(entry.long_def.contains("love, goodwill, esteem"));
        assert!(entry.long_def.contains("Of men's love"));
        assert!(entry.long_def.contains("distinct from"));
        assert!(entry.long_def.contains("friendship"));
        assert!(entry.long_def.contains("<ref target=\"John.13.35\">Jhn 13:35;</ref>"));
        assert!(entry.long_def.contains("<ref target=\"1Jn.2.5.\">1Jn 2:5.</ref>"));
        assert!(entry.long_def.contains("φιλία"));
        assert!(entry.long_def.contains("στοργή"));
        assert!(entry.long_def.contains("ἔρως"));
        assert!(entry.long_def.contains("אַהֲבָה"));
        assert!(entry.long_def.contains("<b>love, goodwill, esteem</b>"));
        assert!(entry.long_def.contains("<i>SYN.</i>"));
        assert!(!entry.long_def.contains(" ,"));
        assert!(!entry.long_def.contains(", ,"));
    }

    #[test]
    fn parses_morphe_g3444_with_citations_and_greek_synonyms() {
        let line = "G3444\tG3444G =\tG3444G\tμορφή\tmorphē\tG:N-F\tform\t <b>μορφή</b>, -ῆς, ἡ, <BR /> [in LXX for תְּמוּנָה, תֹּאַר, etc. ;] <BR />__1. properly, <b>form, shape, outward appearance</b>: <ref='Mrk.16.12'>Mrk 16:12</ref> (cf. Westc., Intr., 338; Milligan, NTD, 44). <BR />__2. In philos. language, <b>the form</b> (ἡ μορφὴ ἡ κατὰ τὸν λόγον, Arist., Phys., ii, 1), <b>the character or sort:</b> <ref='Php.2.6-7'>Php 2:6, 7</ref>. <BR /> <re><i>SYN.</i>: σχῆμα, which see for distinctions; also Gifford, Incarn., 22 ff.; Lft., Notes, 262 f.; Trench, Syn., § lxx.</re>";
        let entry = parse_row("G3444", line).unwrap();
        assert!(entry.long_def.contains("<ref target=\"Mrk.16.12\">Mrk 16:12</ref>"));
        assert!(entry.long_def.contains("<ref target=\"Php.2.6-7\">Php 2:6, 7</ref>"));
        assert!(entry.long_def.contains("μορφή"));
        assert!(entry.long_def.contains("σχῆμα"));
        assert!(entry.long_def.contains("תְּמוּנָה"));
        assert!(entry.long_def.contains("1) properly, <b>form, shape, outward appearance</b>"));
        assert!(entry.long_def.contains("2) In philos. language"));
        assert!(entry.long_def.contains("Notes, 262 f."));
    }

    #[test]
    fn unwraps_tflsj_hover_tooltip_citations() {
        let line = "G0026\tG0026 =\tG0026\tἀγάπη\tagapē\tG:N-F\tlove\t<b>love,</b> [<a href=\"javascript:void(0)\" title=\"LXX.Jer.2.2\">LXX+2nd c.BC+</a>] used of divine love.";
        let entry = parse_row("G26", line).unwrap();
        assert!(entry.long_def.contains("used of divine love"));
        assert!(entry.long_def.contains("LXX+2nd c.BC+"));
        assert!(!entry.long_def.contains("javascript"));
        assert!(!entry.long_def.contains("<a"));
    }

    #[test]
    fn rejects_a_malformed_row() {
        let result = parse_row("G26", "G0026\tonly\tthree\tcolumns");
        assert!(result.is_err());
    }
}

#[cfg(test)]
mod sense_outline_tests {
    use super::*;

    #[test]
    fn formats_bdb_sense_outline_with_indentation() {
        // Real TBESH row for H157 (ahab, "to love") — the same run-together
        // outline from the screenshot: "1) name 1a) name 1b) reputation...".
        let line = "H0157\tH0157G =\tH0157G\tאָהֵב\ta.hav\tH:V\tto love: lover\t: lover<br>1) to love<br>1a) (Qal)<br>1a1) human love for another, includes family, and sexual<br>1a2) human appetite for objects such as food, drink, sleep, wisdom<br>2) to like";
        let entry = parse_row("H157", line).unwrap();
        eprintln!("=== FORMATTED ===\n{}\n", entry.long_def);

        let lines: Vec<&str> = entry.long_def.lines().collect();
        // Each sense/sub-sense is its own line, not run together.
        assert!(lines.iter().any(|l| l.trim_start() == "1) to love"));
        assert!(lines.iter().any(|l| l.trim_start() == "1a) (Qal)"));
        assert!(lines
            .iter()
            .any(|l| l.trim_start().starts_with("1a1) human love for another")));
        assert!(lines.iter().any(|l| l.trim_start() == "2) to like"));
        // Sub-senses are indented further than their parent.
        let l1 = lines
            .iter()
            .position(|l| l.trim_start() == "1) to love")
            .unwrap();
        let l1a = lines
            .iter()
            .position(|l| l.trim_start() == "1a) (Qal)")
            .unwrap();
        let l1a1 = lines
            .iter()
            .position(|l| l.trim_start().starts_with("1a1)"))
            .unwrap();
        let indent_of = |l: &str| l.len() - l.trim_start().len();
        assert!(indent_of(lines[l1a]) > indent_of(lines[l1]));
        assert!(indent_of(lines[l1a1]) > indent_of(lines[l1a]));
    }

    #[test]
    fn formats_abbott_smith_groups_with_nested_sub_senses_in_order() {
        let line = "G0622\tG0622G =\tG0622G\tἀπόλλυμι\tapollymi\tG:V\tto destroy\t__1. Act., <BR /> __1 <b>to destroy</b>; <BR /> __2 <b>to lose</b>. <BR /> __2. Mid., <BR /> __1 <b>to perish</b>; <BR /> __(a) <b>of things</b>: <ref='Mat.5.29'>Mat.5:29</ref>, <ref='Jhn.6.12'>Jhn.6:12</ref>, <ref='Heb.1.11'>Heb.1:11</ref> (LXX, al.; <BR /> __(b) <b>of persons</b>: <ref='Mat.8.26'>Mat.8:26</ref>, al. Metaphorical, of loss of eternal life, <ref='Jhn.3.15-16; 10.28; 17.12'>Jhn.3:15-16 10:28 17:12</ref>, <ref='Rom.2.12'>Rom.2:12</ref>. In the perishing, contrasted in <ref='1Co.1.18'>1Co.1:18</ref>, al., with the saved.";
        let entry = parse_row("G622", line).unwrap();
        eprintln!("=== FORMATTED ===\n{}\n", entry.long_def);

        // No dangling punctuation left behind by stripped <ref> lists.
        assert!(!entry.long_def.contains(" :,"));
        assert!(!entry.long_def.contains(",,"));
        assert!(!entry.long_def.contains(", ."));

        let lines: Vec<&str> = entry.long_def.lines().collect();
        let group2 = lines
            .iter()
            .position(|l| l.trim_start().starts_with("2) Mid."))
            .unwrap();
        let sub1 = lines
            .iter()
            .position(|l| l.trim_start() == "1) <b>to perish</b>;")
            .unwrap();
        let sub_a = lines
            .iter()
            .position(|l| l.trim_start().starts_with("a) <b>of things</b>"))
            .unwrap();

        assert!(group2 < sub1);
        let indent_of = |l: &str| l.len() - l.trim_start().len();
        assert!(indent_of(lines[sub1]) > indent_of(lines[group2]));
        assert!(indent_of(lines[sub_a]) > indent_of(lines[sub1]));
    }
}
