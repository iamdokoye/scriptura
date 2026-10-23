//! Parsers that turn song files into `Song` values (nothing is saved here).
//!
//! Supported: OpenLyrics XML, and plain text — including the layout CCLI
//! SongSelect exports (title, labelled blocks, then a "CCLI Song #" footer).

use super::model::{Song, SongSection};
use crate::types::{AppError, Result};
use once_cell::sync::Lazy;
use quick_xml::events::Event;
use quick_xml::Reader;
use regex::Regex;

const MAX_IMPORT_BYTES: usize = 2_000_000;

/// Parse one file's text. `file_name` is only used as a title fallback.
pub fn parse_song_file(file_name: &str, content: &str) -> Result<Vec<Song>> {
    if content.len() > MAX_IMPORT_BYTES {
        return Err(AppError::Other("File is too large to import".into()));
    }
    let content = content.trim_start_matches('\u{feff}');
    let stem = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name)
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(file_name)
        .trim();
    let song = if content.trim_start().starts_with('<') {
        parse_openlyrics(content)?
    } else {
        parse_plain_text(content, stem)
    };
    if song.sections.is_empty() {
        return Err(AppError::Other("No lyrics found".into()));
    }
    Ok(vec![song])
}

// ── Section labels ───────────────────────────────────────────────────────────

/// (prefix used in keys, canonical name, regex alternatives)
const KINDS: &[(&str, &str, &[&str])] = &[
    ("v", "Verse", &["verse", "v"]),
    ("c", "Chorus", &["chorus", "refrain", "ref", "ch", "c", "r"]),
    ("p", "Pre-Chorus", &["pre-chorus", "pre chorus", "prechorus", "pre", "pc", "p"]),
    ("b", "Bridge", &["bridge", "b"]),
    ("t", "Tag", &["tag", "t"]),
    ("i", "Intro", &["intro", "i"]),
    ("o", "Outro", &["outro", "ending", "end", "e", "o"]),
    ("n", "Interlude", &["interlude", "instrumental", "n"]),
];

static LABEL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*[\[\(]?\s*([a-z][a-z \-]*?)\s*(\d+)?\s*[\]\)]?\s*:?\s*$").unwrap()
});

/// Recognise a section header line such as "Verse 1", "[Chorus]", "Bridge:" or "C2".
/// Returns (key, display label).
fn parse_label(line: &str) -> Option<(String, String)> {
    let caps = LABEL_RE.captures(line.trim())?;
    let word = caps.get(1)?.as_str().to_lowercase();
    let num = caps.get(2).map(|m| m.as_str());
    let (prefix, name, _) = KINDS.iter().find(|(_, _, alts)| alts.contains(&word.as_str()))?;
    // Single letters are only labels when numbered or bracketed ("V1", "[C]"),
    // so ordinary one-word lyric lines like "I" or "O" aren't swallowed.
    let t = line.trim();
    if word.len() == 1 && num.is_none() && !(t.starts_with('[') || t.starts_with('(')) {
        return None;
    }
    let key = format!("{prefix}{}", num.unwrap_or(""));
    let label = match num {
        Some(n) => format!("{name} {n}"),
        None => (*name).to_string(),
    };
    Some((key, label))
}

/// Human label for an OpenLyrics-style key ("v1" -> "Verse 1").
fn label_from_key(key: &str) -> String {
    let lower = key.to_lowercase();
    let digits: String = lower.chars().rev().take_while(|c| c.is_ascii_digit()).collect::<Vec<_>>().into_iter().rev().collect();
    let word = lower[..lower.len() - digits.len()].to_string();
    match KINDS.iter().find(|(p, _, alts)| *p == word || alts.contains(&word.as_str())) {
        Some((_, name, _)) if digits.is_empty() => (*name).to_string(),
        Some((_, name, _)) => format!("{name} {digits}"),
        None => key.to_string(),
    }
}

fn normalise_lyrics(s: &str) -> String {
    s.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ").to_lowercase()
}

// ── Plain text / SongSelect ──────────────────────────────────────────────────

static CCLI_NO_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)CCLI\s*Song\s*#?\s*(\d+)").unwrap());

#[derive(Default)]
struct Footer {
    ccli: String,
    authors: Vec<String>,
    copyright: String,
}

/// Peel a SongSelect-style footer off the end of the block list.
fn take_footer(blocks: &mut Vec<Vec<String>>) -> Footer {
    let mut footer = Footer::default();
    let Some(idx) = blocks.iter().position(|b| b.iter().any(|l| CCLI_NO_RE.is_match(l))) else {
        return footer;
    };
    for block in blocks.drain(idx..) {
        for line in block {
            let t = line.trim();
            if let Some(c) = CCLI_NO_RE.captures(t) {
                footer.ccli = c[1].to_string();
            } else if t.starts_with('©') || t.to_lowercase().starts_with("copyright") {
                if !footer.copyright.is_empty() {
                    footer.copyright.push(' ');
                }
                footer.copyright.push_str(t);
            } else if t.to_lowercase().contains("ccli license")
                || t.to_lowercase().starts_with("for use solely")
                || t.to_lowercase().contains("all rights reserved")
            {
                // boilerplate
            } else if footer.authors.is_empty() && footer.copyright.is_empty() && !t.is_empty() {
                footer.authors = t.split(['|', ',']).map(|a| a.trim().to_string()).filter(|a| !a.is_empty()).collect();
            }
        }
    }
    footer
}

/// A section's place in the play order, resolved once every section is known.
enum Entry {
    Key(String),
    /// "Play the chorus here" — resolved to the first section of that kind (key prefix).
    Kind(String),
}

/// "1 text", "2. text", "3) text" — a verse number starting a line.
static NUMBERED_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s*(\d{1,2})(?:[.):]\s*|\s+)(.*)$").unwrap());
static BARE_NUMBER_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s*(\d{1,2})\s*[.):]?\s*$").unwrap());
/// A repeat marker closing a line: "[Refrain]", "(Chorus x2)", "[repeat chorus]".
static TRAILING_REPEAT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\s*[\[\(]\s*(?:repeat\s+|x\d+\s+)?(refrain|chorus|bridge|tag|pre-?chorus|ref)\b[^\]\)]*[\]\)]\s*$").unwrap()
});

enum Line {
    Header { key: String, label: String, rest: String, number: Option<u32> },
    Content(String),
}

fn kind_prefix(word: &str) -> Option<&'static str> {
    let w = word.to_lowercase().replace("prechorus", "pre-chorus");
    KINDS.iter().find(|(_, _, alts)| alts.contains(&w.as_str())).map(|(p, _, _)| *p)
}

fn classify(line: &str, numbered_mode: bool, last_num: u32) -> Line {
    if let Some((key, label)) = parse_label(line) {
        return Line::Header { key, label, rest: String::new(), number: None };
    }
    // "Refrain: I am bound…" — a label, a colon, then the first line of text.
    if let Some((head, tail)) = line.split_once(':') {
        if !tail.trim().is_empty() {
            if let Some((key, label)) = parse_label(&format!("{}:", head.trim())) {
                return Line::Header { key, label, rest: tail.trim().to_string(), number: None };
            }
        }
    }
    if numbered_mode {
        let hit = BARE_NUMBER_RE
            .captures(line)
            .map(|c| (c[1].to_string(), String::new()))
            .or_else(|| NUMBERED_RE.captures(line).map(|c| (c[1].to_string(), c[2].trim().to_string())));
        if let Some((n, rest)) = hit {
            let n: u32 = n.parse().unwrap_or(0);
            if n == 1 || (n > 1 && n == last_num + 1) {
                return Line::Header { key: format!("v{n}"), label: format!("Verse {n}"), rest, number: Some(n) };
            }
        }
    }
    Line::Content(line.to_string())
}

/// Remove a trailing repeat marker from a lyric line, returning the cleaned line
/// and the kind it pointed at.
fn strip_repeat(line: &str) -> (String, Option<&'static str>) {
    match TRAILING_REPEAT_RE.captures(line) {
        Some(c) => {
            let kind = kind_prefix(&c[1]);
            (line[..c.get(0).unwrap().start()].trim_end().to_string(), kind)
        }
        None => (line.trim_end().to_string(), None),
    }
}

struct Current {
    key: String,
    label: String,
    labelled: bool,
    lines: Vec<String>,
    after: Vec<&'static str>,
}

struct Builder {
    sections: Vec<SongSection>,
    order: Vec<Entry>,
    verse_count: u32,
}

impl Builder {
    fn finish(&mut self, cur: Current) {
        let lyrics = cur.lines.join("\n");
        if lyrics.trim().is_empty() {
            // A bare "Chorus" line is a repeat marker for a section already defined.
            if cur.labelled {
                match find_section(&self.sections, &cur.key) {
                    Some(k) => self.order.push(Entry::Key(k)),
                    None => self.order.push(Entry::Kind(cur.key.chars().take_while(|c| c.is_alphabetic()).collect())),
                }
            }
        } else if let Some(existing) = self.sections.iter().find(|s| normalise_lyrics(&s.lyrics) == normalise_lyrics(&lyrics)) {
            // The same lyrics written out again re-use the first copy.
            self.order.push(Entry::Key(existing.key.clone()));
        } else {
            let mut key = cur.key;
            let base = key.clone();
            let mut n = 2;
            while self.sections.iter().any(|s| s.key == key) {
                key = format!("{base}_{n}");
                n += 1;
            }
            self.order.push(Entry::Key(key.clone()));
            self.sections.push(SongSection { key, label: cur.label, lyrics });
        }
        for kind in cur.after {
            self.order.push(Entry::Kind(kind.to_string()));
        }
    }
}

pub fn parse_plain_text(content: &str, fallback_title: &str) -> Song {
    let text = content.replace("\r\n", "\n").replace('\r', "\n");
    let mut blocks: Vec<Vec<String>> = Vec::new();
    let mut cur: Vec<String> = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            if !cur.is_empty() {
                blocks.push(std::mem::take(&mut cur));
            }
        } else {
            cur.push(line.trim_end().to_string());
        }
    }
    if !cur.is_empty() {
        blocks.push(cur);
    }

    let footer = take_footer(&mut blocks);

    // Verse numbers only count as headings when the song actually starts with "1".
    let numbered_mode = blocks.iter().flatten().any(|l| {
        NUMBERED_RE.captures(l).map_or(false, |c| &c[1] == "1" && !c[2].trim().is_empty())
            || BARE_NUMBER_RE.captures(l).map_or(false, |c| &c[1] == "1")
    });

    // A leading single-line block that isn't a heading, followed by a heading, is the title.
    let is_heading = |l: &str| !matches!(classify(l, numbered_mode, 0), Line::Content(_));
    let mut title = String::new();
    if blocks.len() > 1 && blocks[0].len() == 1 && !is_heading(&blocks[0][0]) && is_heading(&blocks[1][0]) {
        title = blocks.remove(0).remove(0).trim().to_string();
    }
    if title.is_empty() {
        title = fallback_title.trim().to_string();
    }

    let mut b = Builder { sections: Vec::new(), order: Vec::new(), verse_count: 0 };
    let mut last_num = 0u32;

    for block in blocks {
        let mut current: Option<Current> = None;
        for line in &block {
            match classify(line, numbered_mode, last_num) {
                Line::Header { key, label, rest, number } => {
                    if let Some(c) = current.take() {
                        b.finish(c);
                    }
                    if let Some(n) = number {
                        last_num = n;
                        b.verse_count = b.verse_count.max(n);
                    }
                    let mut c = Current { key, label, labelled: true, lines: Vec::new(), after: Vec::new() };
                    if !rest.is_empty() {
                        add_line(&mut c, &rest);
                    }
                    current = Some(c);
                }
                Line::Content(l) => {
                    let c = current.get_or_insert_with(|| {
                        b.verse_count += 1;
                        Current {
                            key: format!("v{}", b.verse_count),
                            label: format!("Verse {}", b.verse_count),
                            labelled: false,
                            lines: Vec::new(),
                            after: Vec::new(),
                        }
                    });
                    add_line(c, &l);
                }
            }
        }
        if let Some(c) = current.take() {
            b.finish(c);
        }
    }

    let Builder { sections, order, .. } = b;
    let arrangement: Vec<String> = order
        .into_iter()
        .filter_map(|e| match e {
            Entry::Key(k) => Some(k),
            Entry::Kind(p) => sections.iter().find(|s| s.key.starts_with(&p)).map(|s| s.key.clone()),
        })
        .collect();
    let default_order: Vec<&String> = sections.iter().map(|s| &s.key).collect();
    let arrangement = if arrangement.iter().collect::<Vec<_>>() == default_order { Vec::new() } else { arrangement };

    Song {
        title,
        author: footer.authors.join(", "),
        copyright: footer.copyright,
        ccli_number: footer.ccli,
        arrangement,
        sections,
        ..Default::default()
    }
}

/// Add a lyric line to a section, peeling off any trailing "[Refrain]" marker.
fn add_line(c: &mut Current, line: &str) {
    let (clean, kind) = strip_repeat(line);
    if let Some(k) = kind {
        c.after.push(k);
    }
    if !clean.trim().is_empty() {
        c.lines.push(clean);
    }
}

/// Find an already-defined section matching a bare repeat marker: exact key
/// first, then the first section of the same kind ("Chorus" -> "c1").
fn find_section(sections: &[SongSection], key: &str) -> Option<String> {
    if let Some(s) = sections.iter().find(|s| s.key == key) {
        return Some(s.key.clone());
    }
    let prefix: String = key.chars().take_while(|c| c.is_alphabetic()).collect();
    sections.iter().find(|s| s.key.starts_with(&prefix) && key.len() == prefix.len()).map(|s| s.key.clone())
}

// ── OpenLyrics ───────────────────────────────────────────────────────────────

pub fn parse_openlyrics(xml: &str) -> Result<Song> {
    let mut reader = Reader::from_str(xml);
    let mut song = Song::default();
    let mut path: Vec<String> = Vec::new();
    let mut text = String::new();
    let mut verse_name = String::new();
    let mut verse_lines: Vec<String> = Vec::new();
    let mut verse_order = String::new();
    let mut first_title = true;
    let mut authors: Vec<String> = Vec::new();
    let mut seen_verse_names: Vec<String> = Vec::new();

    let xml_err = |e: quick_xml::Error| AppError::Other(format!("Invalid OpenLyrics file: {e}"));

    loop {
        match reader.read_event().map_err(xml_err)? {
            Event::Start(e) => {
                let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                if name == "verse" {
                    verse_name = e
                        .attributes()
                        .flatten()
                        .find(|a| a.key.local_name().as_ref() == b"name")
                        .map(|a| String::from_utf8_lossy(&a.value).to_string())
                        .unwrap_or_default();
                    verse_lines.clear();
                }
                if name == "lines" {
                    text.clear();
                }
                if name == "tempo" || name == "title" || name == "author" || name == "theme" {
                    text.clear();
                }
                path.push(name);
            }
            Event::Empty(e) => {
                let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                if name == "br" && path.last().map(|s| s.as_str()) == Some("lines") {
                    text.push('\n');
                }
            }
            Event::Text(t) => {
                let s = t.unescape().map_err(xml_err)?;
                if in_path(&path, "lines") {
                    text.push_str(&s.replace('\n', " ").replace('\r', ""));
                } else {
                    text.push_str(s.trim());
                }
            }
            Event::CData(c) => text.push_str(&String::from_utf8_lossy(&c)),
            Event::End(e) => {
                let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                path.pop();
                match name.as_str() {
                    "title" if first_title => {
                        song.title = text.trim().to_string();
                        first_title = false;
                    }
                    "author" => authors.push(text.trim().to_string()),
                    "copyright" => song.copyright = text.trim().to_string(),
                    "ccliNo" => song.ccli_number = text.trim().to_string(),
                    "key" => song.key = text.trim().to_string(),
                    "tempo" => song.tempo = text.trim().to_string(),
                    "verseOrder" => verse_order = text.trim().to_string(),
                    "theme" => {
                        let t = text.trim().to_string();
                        if !t.is_empty() {
                            song.tags.push(t);
                        }
                    }
                    "lines" => {
                        // Chord and tag children don't contribute lyric text; keep the line text.
                        verse_lines.push(text.trim_matches([' ', '\n']).lines().map(|l| l.trim()).collect::<Vec<_>>().join("\n"));
                        text.clear();
                    }
                    "verse" => {
                        let key = if verse_name.is_empty() { format!("v{}", song.sections.len() + 1) } else { verse_name.clone() };
                        // A verse repeated for another language shares a name; keep the first.
                        if !seen_verse_names.contains(&key) {
                            seen_verse_names.push(key.clone());
                            song.sections.push(SongSection {
                                label: label_from_key(&key),
                                key,
                                lyrics: verse_lines.join("\n").trim().to_string(),
                            });
                        }
                    }
                    _ => {}
                }
                if !matches!(name.as_str(), "lines" | "verse") {
                    text.clear();
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }

    song.author = authors.into_iter().filter(|a| !a.is_empty()).collect::<Vec<_>>().join(", ");
    song.arrangement = verse_order
        .split_whitespace()
        .filter(|k| song.sections.iter().any(|s| s.key == *k))
        .map(String::from)
        .collect();
    if song.title.is_empty() {
        return Err(AppError::Other("OpenLyrics file has no title".into()));
    }
    Ok(song)
}

fn in_path(path: &[String], name: &str) -> bool {
    path.iter().any(|p| p == name)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SONGSELECT: &str = "Amazing Grace (My Chains Are Gone)

Verse 1
Amazing grace how sweet the sound
That saved a wretch like me

Chorus
My chains are gone
I've been set free

Verse 2
The Lord has promised good to me

Chorus

CCLI Song # 4768151
Chris Tomlin | Louie Giglio
© 2006 sixsteps Music
For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com
CCLI License # 12345
";

    #[test]
    fn songselect_text() {
        let s = parse_plain_text(SONGSELECT, "file");
        assert_eq!(s.title, "Amazing Grace (My Chains Are Gone)");
        assert_eq!(s.ccli_number, "4768151");
        assert_eq!(s.author, "Chris Tomlin, Louie Giglio");
        assert!(s.copyright.starts_with("© 2006"));
        assert_eq!(s.sections.iter().map(|x| x.key.as_str()).collect::<Vec<_>>(), ["v1", "c", "v2"]);
        assert_eq!(s.arrangement, ["v1", "c", "v2", "c"]);
    }

    #[test]
    fn unlabelled_blocks_and_repeats() {
        let s = parse_plain_text("Line a\nLine b\n\nLine c\n\nLine a\nline B\n", "My Song");
        assert_eq!(s.title, "My Song");
        assert_eq!(s.sections.len(), 2);
        assert_eq!(s.arrangement, ["v1", "v2", "v1"]);
    }

    #[test]
    fn numbered_verses_with_refrain() {
        let s = parse_plain_text(
            "1 On Jordan's stormy banks I stand,\nand cast a wishful eye\nto Canaan's fair and happy land,\nwhere my possessions lie.\nRefrain:\nI am bound for the promised land,\nI am bound for the promised land;\noh, who will come and go with me?\nI am bound for the promised land.\n2 O'er all those wide extended plains\nshines one eternal day;\nthere God the Son forever reigns,\nand scatters night away. [Refrain]\n",
            "",
        );
        let keys: Vec<_> = s.sections.iter().map(|x| (x.key.as_str(), x.label.as_str())).collect();
        assert_eq!(keys, [("v1", "Verse 1"), ("c", "Chorus"), ("v2", "Verse 2")]);
        assert_eq!(s.sections[0].lyrics.lines().next().unwrap(), "On Jordan's stormy banks I stand,");
        assert!(s.sections[1].lyrics.starts_with("I am bound"));
        assert!(!s.sections[2].lyrics.contains('['));
        assert_eq!(s.arrangement, ["v1", "c", "v2", "c"]);
        assert_eq!(s.title, "");
    }

    #[test]
    fn numbers_inside_lyrics_are_left_alone() {
        let s = parse_plain_text("Ten thousand reasons\n10,000 years\nstill singing", "T");
        assert_eq!(s.sections.len(), 1);
        assert_eq!(s.sections[0].lyrics.lines().count(), 3);
    }

    #[test]
    fn single_letters_need_numbers_or_brackets() {
        assert!(parse_label("I").is_none());
        assert!(parse_label("V1").is_some());
        assert_eq!(parse_label("[C]").unwrap().0, "c");
        assert_eq!(parse_label("Pre-Chorus 2:").unwrap().1, "Pre-Chorus 2");
    }

    #[test]
    fn openlyrics() {
        let xml = r#"<?xml version="1.0"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8">
 <properties>
  <titles><title>How Great Thou Art</title></titles>
  <authors><author>Stuart Hine</author></authors>
  <copyright>Public Domain</copyright><ccliNo>14181</ccliNo>
  <verseOrder>v1 c v1</verseOrder>
 </properties>
 <lyrics>
  <verse name="v1"><lines>O Lord my God<br/>When I in awesome <chord name="G"/>wonder</lines></verse>
  <verse name="c"><lines>Then sings my soul</lines></verse>
 </lyrics>
</song>"#;
        let s = parse_openlyrics(xml).unwrap();
        assert_eq!(s.title, "How Great Thou Art");
        assert_eq!(s.ccli_number, "14181");
        assert_eq!(s.sections[0].lyrics, "O Lord my God\nWhen I in awesome wonder");
        assert_eq!(s.sections[1].label, "Chorus");
        assert_eq!(s.arrangement, ["v1", "c", "v1"]);
    }

    #[test]
    fn dispatch_and_errors() {
        assert!(parse_song_file("x.txt", "   ").is_err());
        assert!(parse_song_file("x.xml", "<song><oops").is_err());
        assert_eq!(parse_song_file("Holy Holy.txt", "Holy holy holy").unwrap()[0].title, "Holy Holy");
    }
}
