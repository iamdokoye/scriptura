use crate::types::CrossReference;
/// TSK (Treasury of Scripture Knowledge) cross-reference text parser.
///
/// TSK entries look like (after markup stripping):
///   "In the beginning. Pr 8:22, 23; Joh 1:1, 2. created. Ps 33:6, 9; 89:12."
///
/// We extract all explicit `BookAbbr Chapter:Verse` patterns. Implicit same-book
/// references (e.g., "; 89:12") are omitted in this pass to stay conservative.
use once_cell::sync::Lazy;
use regex::Regex;

// Matches: optional 1/2/3 prefix, then 2-8 alpha chars, space(s), chapter:verse[-end]
static REF_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b([1-3]?\s*[A-Za-z]{2,8})\s+(\d+):(\d+)(?:-(\d+))?").unwrap());

/// Strip HTML-style tags and GBF backslash markup from raw module text.
fn strip_markup(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '<' => {
                while chars.next_if(|&c| c != '>').is_some() {}
                chars.next();
            }
            '\\' => {
                while chars.next_if(|&c| c != '\\' && c != ' ').is_some() {}
                chars.next_if(|&c| c == '\\');
            }
            _ => out.push(ch),
        }
    }
    out
}

/// Resolve a TSK/SWORD book abbreviation (case-insensitive) to the canonical full name.
pub fn resolve_book(abbr: &str) -> Option<&'static str> {
    let key = abbr.replace(' ', "").to_lowercase();
    match key.as_str() {
        // OT
        "ge" | "gen" | "gn" | "genesis" => Some("Genesis"),
        "ex" | "exo" | "exod" | "exodus" => Some("Exodus"),
        "le" | "lev" | "lv" | "leviticus" => Some("Leviticus"),
        "nu" | "num" | "nm" | "nb" | "numbers" => Some("Numbers"),
        "de" | "deu" | "dt" | "deut" | "deuteronomy" => Some("Deuteronomy"),
        "jos" | "josh" | "joshua" => Some("Joshua"),
        "jdg" | "judg" | "jg" | "jud" | "judges" => Some("Judges"),
        "ru" | "rut" | "rth" | "ruth" => Some("Ruth"),
        "1sa" | "1sam" | "1s" | "1samuel" => Some("1 Samuel"),
        "2sa" | "2sam" | "2s" | "2samuel" => Some("2 Samuel"),
        "1ki" | "1kgs" | "1k" | "1kings" | "1kin" => Some("1 Kings"),
        "2ki" | "2kgs" | "2k" | "2kings" | "2kin" => Some("2 Kings"),
        "1ch" | "1chr" | "1chron" | "1chronicles" => Some("1 Chronicles"),
        "2ch" | "2chr" | "2chron" | "2chronicles" => Some("2 Chronicles"),
        "ezr" | "ez" | "ezra" => Some("Ezra"),
        "ne" | "neh" | "nehemiah" => Some("Nehemiah"),
        "es" | "est" | "esth" | "esther" => Some("Esther"),
        "job" | "jb" => Some("Job"),
        "ps" | "psa" | "psm" | "pss" | "psalms" | "psalm" => Some("Psalms"),
        "pr" | "pro" | "prv" | "prov" | "proverbs" => Some("Proverbs"),
        "ec" | "ecc" | "eccles" | "qoh" | "ecclesiastes" => Some("Ecclesiastes"),
        "sol" | "song" | "sg" | "so" | "ca" | "ss" | "songofsongs" => Some("Song of Solomon"),
        "isa" | "is" | "isaiah" => Some("Isaiah"),
        "jer" | "jr" | "jeremiah" => Some("Jeremiah"),
        "la" | "lam" | "lamentations" => Some("Lamentations"),
        "eze" | "ezk" | "ezek" | "ezekiel" => Some("Ezekiel"),
        "da" | "dn" | "dan" | "daniel" => Some("Daniel"),
        "ho" | "hos" | "hosea" => Some("Hosea"),
        "joe" | "jl" | "joel" => Some("Joel"),
        "am" | "amo" | "amos" => Some("Amos"),
        "ob" | "oba" | "obad" | "obadiah" => Some("Obadiah"),
        "jon" | "jnh" | "jonah" => Some("Jonah"),
        "mic" | "micah" => Some("Micah"),
        "na" | "nah" | "nahum" => Some("Nahum"),
        "hab" | "habakkuk" => Some("Habakkuk"),
        "zep" | "zeph" | "zp" | "zephaniah" => Some("Zephaniah"),
        "hag" | "hg" | "haggai" => Some("Haggai"),
        "zec" | "zech" | "zk" | "zechariah" => Some("Zechariah"),
        "mal" | "ml" | "malachi" => Some("Malachi"),
        // NT
        "mt" | "mat" | "matt" | "matthew" => Some("Matthew"),
        "mr" | "mk" | "mar" | "mark" => Some("Mark"),
        "lk" | "lu" | "luk" | "luke" => Some("Luke"),
        "joh" | "jn" | "john" => Some("John"),
        "ac" | "act" | "acts" => Some("Acts"),
        "ro" | "rm" | "rom" | "romans" => Some("Romans"),
        "1co" | "1cor" | "1corinthians" => Some("1 Corinthians"),
        "2co" | "2cor" | "2corinthians" => Some("2 Corinthians"),
        "ga" | "gal" | "galatians" => Some("Galatians"),
        "eph" | "ephesians" => Some("Ephesians"),
        "php" | "phi" | "phl" | "phil" | "philippians" => Some("Philippians"),
        "col" | "colossians" => Some("Colossians"),
        "1th" | "1thes" | "1thess" | "1thessalonians" => Some("1 Thessalonians"),
        "2th" | "2thes" | "2thess" | "2thessalonians" => Some("2 Thessalonians"),
        "1ti" | "1tim" | "1timothy" => Some("1 Timothy"),
        "2ti" | "2tim" | "2timothy" => Some("2 Timothy"),
        "tit" | "titus" => Some("Titus"),
        "phm" | "phlm" | "philemon" => Some("Philemon"),
        "heb" | "hebrews" => Some("Hebrews"),
        "jas" | "jms" | "jam" | "james" => Some("James"),
        "1pe" | "1pet" | "1pt" | "1peter" => Some("1 Peter"),
        "2pe" | "2pet" | "2pt" | "2peter" => Some("2 Peter"),
        "1jo" | "1jn" | "1joh" | "1john" => Some("1 John"),
        "2jo" | "2jn" | "2joh" | "2john" => Some("2 John"),
        "3jo" | "3jn" | "3joh" | "3john" => Some("3 John"),
        "jude" => Some("Jude"),
        "re" | "rv" | "rev" | "apoc" | "revelation" => Some("Revelation"),
        _ => None,
    }
}

/// Parse cross-reference text from a TSK module entry and return resolved references.
/// `max` caps the result to avoid flooding the UI (TSK has up to ~200 refs per verse).
pub fn parse_tsk_text(text: &str, max: usize) -> Vec<CrossReference> {
    let clean = strip_markup(text);
    let mut refs: Vec<CrossReference> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for cap in REF_RE.captures_iter(&clean) {
        let book_raw = cap[1].trim();
        let chapter: u32 = match cap[2].parse() {
            Ok(n) => n,
            Err(_) => continue,
        };
        let verse: u32 = match cap[3].parse() {
            Ok(n) => n,
            Err(_) => continue,
        };
        let end_verse: Option<u32> = cap.get(4).and_then(|m| m.as_str().parse().ok());

        if chapter == 0 || verse == 0 {
            continue;
        }

        let Some(book) = resolve_book(book_raw) else {
            continue;
        };

        let key = (book, chapter, verse);
        if seen.insert(key) {
            refs.push(CrossReference {
                book: book.to_string(),
                chapter,
                verse,
                end_verse,
            });
            if refs.len() >= max {
                break;
            }
        }
    }

    refs
}

#[cfg(test)]
mod tests {
    use super::parse_tsk_text;

    #[test]
    fn reads_references_inside_thml_scripref_elements() {
        let refs = parse_tsk_text(
            r#"<scripRef>Pr 8:22-24; Joh 1:1-3; 1Jo 1:1</scripRef>"#,
            120,
        );

        assert_eq!(refs.len(), 3);
        assert_eq!(refs[0].book, "Proverbs");
        assert_eq!(refs[1].book, "John");
        assert_eq!(refs[2].book, "1 John");
    }
}
