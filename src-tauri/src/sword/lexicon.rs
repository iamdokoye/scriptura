use crate::sword::block::{decompress_zlib, read_u32_le};
use crate::sword::conf::{Compression, ModuleConf};
use crate::types::{AppError, Result, StrongsEntry};
/// SWORD Lexicon/Dictionary reader.
///
/// Supports RawLD (uncompressed) and zLD (zlib-compressed).
///
/// File layout:
///   DataPath in .conf is a *filename stem*, not a directory.
///   e.g.  DataPath = ./modules/lexdict/zld/strongsgreek/dict
///   →  directory: modules/lexdict/zld/strongsgreek/
///   →  stem:      dict
///   →  files:     dict.idx  dict.dat  [dict.zdx  dict.zdt  for zLD]
///
/// zLD format (CrossWire StrongsGreek/Hebrew):
///   .zdx — 8 bytes/block: [block_offset: u32 LE][compressed_size: u32 LE]
///   .zdt — concatenated zlib-compressed blocks
///   Each decompressed block starts with:
///     [num_entries: u32 LE]
///     [num_entries × (entry_offset: u32 LE, entry_size: u32 LE)]
///     [entry data…]
///   Blocks contain ~30 Strong's entries each in ascending number order.
use std::fs;
use std::path::{Path, PathBuf};

pub struct LexiconReader {
    conf: ModuleConf,
    data_dir: PathBuf,
    file_stem: String,
}

impl LexiconReader {
    pub fn open(module_path: &Path, conf: &ModuleConf) -> Result<Self> {
        let stripped = conf.data_path.trim_start_matches("./");

        // Try module_path/<DataPath> first (most CrossWire modules)
        let stem_path = module_path.join(stripped);
        if let Some(parent) = stem_path.parent() {
            if parent.exists() {
                let stem = stem_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "lexicon".to_string());
                return Ok(Self {
                    conf: conf.clone(),
                    data_dir: parent.to_path_buf(),
                    file_stem: stem,
                });
            }
        }

        // Fallback: module_path/modules/lexdict/<DataPath>
        let alt_stem = module_path.join("modules").join("lexdict").join(stripped);
        if let Some(parent) = alt_stem.parent() {
            if parent.exists() {
                let stem = alt_stem
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "lexicon".to_string());
                return Ok(Self {
                    conf: conf.clone(),
                    data_dir: parent.to_path_buf(),
                    file_stem: stem,
                });
            }
        }

        // Last resort: DataPath itself as directory
        if stem_path.is_dir() {
            return Ok(Self {
                conf: conf.clone(),
                data_dir: stem_path,
                file_stem: "lexicon".to_string(),
            });
        }

        Err(AppError::Sword(format!(
            "lexicon data not found for {}: {}",
            conf.module_id,
            stem_path.display()
        )))
    }

    /// Look up a Strong's number (e.g. "G25" or "H430") and return a parsed entry.
    pub fn get_strongs_entry(&self, number: &str) -> Result<StrongsEntry> {
        let raw = match &self.conf.compression {
            Compression::Zip => self.lookup_strongs_zld(number)?,
            Compression::None => self.lookup_strongs_rawld(number)?,
        };
        parse_strongs_entry(number, &raw)
    }

    /// Look up any string key; returns the raw entry text (for non-Strong's lookups).
    #[allow(dead_code)]
    pub fn lookup_key(&self, key: &str) -> Result<String> {
        match &self.conf.compression {
            Compression::None => self.lookup_rawld(key),
            Compression::Zip => self.lookup_zld_by_key(key),
        }
    }

    // ── Strong's number lookup (zLD) ──────────────────────────────────────────
    //
    // CrossWire zLD Strong's modules organise entries in blocks of ~30 consecutive
    // Strong's numbers.  Block N contains roughly G(N*30) through G(N*30+29).
    // Some blocks may be offset by a few entries due to lettered variants (G3538a etc).
    // We search ±SEARCH_WINDOW blocks around the expected block and scan every entry
    // in each block for the n="NNN" attribute that matches the requested number.

    fn lookup_strongs_zld(&self, number: &str) -> Result<String> {
        let n = parse_strongs_number(number)?;

        let zdx = self.read_file("zdx")?;
        let zdt = self.read_file("zdt")?;
        let num_blocks = zdx.len() / 8; // 8 bytes per zdx entry

        // Search window around the estimated block
        const WINDOW: usize = 12;
        let estimated = (n as usize) / 30;
        let start = estimated.saturating_sub(WINDOW);
        let end = (estimated + WINDOW + 1).min(num_blocks);

        let target_attr = format!("n=\"{n}\"");

        for bnum in start..end {
            let blk_off = read_u32_le(&zdx, bnum * 8).unwrap_or(0) as usize;
            let blk_csz = read_u32_le(&zdx, bnum * 8 + 4).unwrap_or(0) as usize;
            if blk_off + blk_csz > zdt.len() || blk_csz == 0 {
                continue;
            }

            let blk = match decompress_zlib(&zdt[blk_off..blk_off + blk_csz]) {
                Ok(b) => b,
                Err(_) => continue,
            };

            let num_entries = match read_u32_le(&blk, 0) {
                Some(n) => n as usize,
                None => continue,
            };

            for eidx in 0..num_entries {
                let entry_off = match read_u32_le(&blk, 4 + eidx * 8) {
                    Some(o) => o as usize,
                    None => break,
                };
                let entry_sz = match read_u32_le(&blk, 4 + eidx * 8 + 4) {
                    Some(s) => s as usize,
                    None => break,
                };
                if entry_sz == 0 || entry_off + entry_sz > blk.len() {
                    continue;
                }

                let content = &blk[entry_off..entry_off + entry_sz];
                let txt = String::from_utf8_lossy(content);
                if txt.contains(&target_attr) {
                    return self.decode(content);
                }
            }
        }

        Err(AppError::Sword(format!(
            "Strong's number {} not found",
            number
        )))
    }

    fn lookup_strongs_rawld(&self, number: &str) -> Result<String> {
        let n = parse_strongs_number(number)?;
        // RawLD stores keys as zero-padded 5-digit numbers without letter prefix
        let key = format!("{n:05}");
        self.lookup_rawld(&key)
    }

    // ── RawLD ────────────────────────────────────────────────────────────────

    fn lookup_rawld(&self, key: &str) -> Result<String> {
        let idx = self.read_file("idx")?;
        let dat = self.read_file("dat")?;
        self.binary_search_rawld(key, &idx, &dat)
    }

    fn binary_search_rawld(&self, key: &str, idx: &[u8], dat: &[u8]) -> Result<String> {
        let entry_sz = self.conf.idx_entry_size; // 6 for RawLD, 8 for RawLD4
        let entry_count = idx.len() / entry_sz;
        let mut lo = 0usize;
        let mut hi = entry_count;
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            let base = mid * entry_sz;
            let offset = read_u32_le(idx, base).unwrap_or(0) as usize;
            let size = if entry_sz == 6 {
                // RawLD: u16 size at offset+4
                idx.get(base + 4..base + 6)
                    .map(|b| u16::from_le_bytes(b.try_into().unwrap()) as usize)
                    .unwrap_or(0)
            } else {
                read_u32_le(idx, base + 4).unwrap_or(0) as usize
            };
            let entry_key = Self::rawld_read_key(dat, offset);
            match entry_key.to_lowercase().cmp(&key.to_lowercase()) {
                std::cmp::Ordering::Equal => {
                    let content = Self::rawld_read_content(dat, offset, size);
                    return self.decode(content);
                }
                std::cmp::Ordering::Less => lo = mid + 1,
                std::cmp::Ordering::Greater => {
                    if mid == 0 {
                        break;
                    }
                    hi = mid;
                }
            }
        }
        Err(AppError::Sword(format!("key not found: {key}")))
    }

    /// Extract the key from a RawLD dat entry.
    /// Both null-terminated (RawLD4 / zLD) and backslash-terminated (RawLD) formats.
    fn rawld_read_key(dat: &[u8], offset: usize) -> String {
        let slice = &dat[offset.min(dat.len())..];
        let end = slice
            .iter()
            .position(|&b| b == 0 || b == b'\\')
            .unwrap_or(slice.len());
        String::from_utf8_lossy(&slice[..end])
            .trim_end()
            .to_string()
    }

    /// Extract the content (everything after the key separator) from a RawLD dat entry.
    fn rawld_read_content(dat: &[u8], offset: usize, size: usize) -> &[u8] {
        let offset = offset.min(dat.len());
        let end = offset.saturating_add(size).min(dat.len());
        let slice = &dat[offset..end];
        // Skip past key + separator byte (null or backslash + optional newline)
        let sep = slice
            .iter()
            .position(|&b| b == 0 || b == b'\\')
            .unwrap_or(0);
        let content_start = (sep + 1).min(slice.len());
        // Skip an optional leading newline after the backslash
        let content = &slice[content_start..];
        let skip = content
            .iter()
            .position(|&b| b != b'\r' && b != b'\n')
            .unwrap_or(0);
        &content[skip..]
    }

    // ── zLD key-based lookup (for non-Strong's dictionaries) ─────────────────
    //
    // zLD .dat key layout at each idx entry:
    //   [key bytes (may embed \r\n)][null byte]
    //   [block_num: u32 BE][entry_idx: u32 BE]   ← big-endian
    //   [separator byte]
    // .zdx: 8 bytes/block [block_offset: u32 LE][compressed_size: u32 LE]

    fn lookup_zld_by_key(&self, key: &str) -> Result<String> {
        let idx = self.read_file("idx")?;
        let dat = self.read_file("dat")?;
        let zdx = self.read_file("zdx")?;
        let zdt = self.read_file("zdt")?;

        let entry_count = idx.len() / 8;
        let mut lo = 0usize;
        let mut hi = entry_count;
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            let dat_off = read_u32_le(&idx, mid * 8).unwrap_or(0) as usize;
            if dat_off >= dat.len() {
                break;
            }
            let null_pos = dat[dat_off..]
                .iter()
                .position(|&b| b == 0)
                .ok_or_else(|| AppError::Sword("zLD: no null terminator in dat key".into()))?;
            let entry_key = Self::read_cstr(&dat, dat_off);
            match entry_key.to_lowercase().cmp(&key.to_lowercase()) {
                std::cmp::Ordering::Equal => {
                    let ref_start = dat_off + null_pos + 1;
                    // block_num and entry_idx stored big-endian in dat
                    let block_num = u32::from_be_bytes(
                        dat.get(ref_start..ref_start + 4)
                            .and_then(|b| b.try_into().ok())
                            .ok_or_else(|| AppError::Sword("zLD: block_num".into()))?,
                    ) as usize;
                    let entry_idx = u32::from_be_bytes(
                        dat.get(ref_start + 4..ref_start + 8)
                            .and_then(|b| b.try_into().ok())
                            .ok_or_else(|| AppError::Sword("zLD: entry_idx".into()))?,
                    ) as usize;

                    let blk_off = read_u32_le(&zdx, block_num * 8)
                        .ok_or_else(|| AppError::Sword("zLD: zdx offset".into()))?
                        as usize;
                    let blk_csz = read_u32_le(&zdx, block_num * 8 + 4)
                        .ok_or_else(|| AppError::Sword("zLD: zdx csize".into()))?
                        as usize;

                    let compressed = zdt
                        .get(blk_off..blk_off + blk_csz)
                        .ok_or_else(|| AppError::Sword("zLD: zdt out of range".into()))?;
                    let blk = decompress_zlib(compressed)?;

                    let num_entries = read_u32_le(&blk, 0).unwrap_or(0) as usize;
                    if entry_idx >= num_entries {
                        return Err(AppError::Sword(format!(
                            "zLD: entry_idx {entry_idx} >= {num_entries}"
                        )));
                    }
                    let entry_off = read_u32_le(&blk, 4 + entry_idx * 8)
                        .ok_or_else(|| AppError::Sword("zLD: entry offset".into()))?
                        as usize;
                    let entry_sz = read_u32_le(&blk, 4 + entry_idx * 8 + 4)
                        .ok_or_else(|| AppError::Sword("zLD: entry size".into()))?
                        as usize;

                    let content = blk
                        .get(entry_off..entry_off + entry_sz)
                        .ok_or_else(|| AppError::Sword("zLD: entry out of block".into()))?;
                    return self.decode(content);
                }
                std::cmp::Ordering::Less => lo = mid + 1,
                std::cmp::Ordering::Greater => {
                    if mid == 0 {
                        break;
                    }
                    hi = mid;
                }
            }
        }
        Err(AppError::Sword(format!("key not found in zLD: {key}")))
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn read_file(&self, ext: &str) -> Result<Vec<u8>> {
        let path = self.data_dir.join(format!("{}.{ext}", self.file_stem));
        fs::read(&path).map_err(|e| AppError::Sword(format!("cannot read {}: {e}", path.display())))
    }

    fn read_cstr(data: &[u8], offset: usize) -> String {
        let slice = &data[offset.min(data.len())..];
        let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
        // Some modules (e.g. StrongsGreek) include \r\n before the null byte
        String::from_utf8_lossy(&slice[..end])
            .trim_end()
            .to_string()
    }

    fn decode(&self, bytes: &[u8]) -> Result<String> {
        use crate::sword::conf::Encoding;
        match &self.conf.encoding {
            Encoding::Utf8 => {
                String::from_utf8(bytes.to_vec()).map_err(|e| AppError::Sword(format!("utf8: {e}")))
            }
            Encoding::Latin1 => Ok(bytes.iter().map(|&b| b as char).collect()),
        }
    }
}

impl super::ModuleReader for LexiconReader {
    fn module_id(&self) -> &str {
        &self.conf.module_id
    }
}

/// Extract the numeric part of a Strong's number like "G25" or "H430".
fn parse_strongs_number(number: &str) -> Result<u32> {
    // Skip leading alphabetic character (G/H prefix), respecting UTF-8 char boundaries
    let digits = match number.chars().next() {
        Some(c) if c.is_alphabetic() => &number[c.len_utf8()..],
        _ => number,
    };
    // Accept trailing letters like "3538a" — strip them before parsing
    let digits = digits.trim_end_matches(|c: char| c.is_alphabetic());
    digits
        .parse::<u32>()
        .map_err(|_| AppError::Sword(format!("invalid Strong's number: {number}")))
}

/// Parse a raw Strong's entry (TEI XML or RawLD plain text) into a StrongsEntry.
fn parse_strongs_entry(number: &str, raw: &str) -> Result<StrongsEntry> {
    let raw = raw.trim();

    // Detect format: TEI XML has matching <tag>...</tag> pairs. A bare '<'
    // isn't a safe signal on its own — found via a full-lexicon audit: H6848's
    // plain-text transliteration ("tsiph<oniy") contains a literal '<' with no
    // closing tag anywhere in the entry, which used to misroute it into the
    // XML parser and silently produce an empty definition.
    if raw.contains("</") {
        parse_strongs_tei(number, raw)
    } else {
        parse_strongs_plain(number, raw)
    }
}

/// Parse CrossWire TEI XML format (used by StrongsGreek zLD).
/// Structure: <orth>WORD</orth> ... <orth rend="bold" type="trans">TRANS</orth>
///            <pron>PRONUNCIATION</pron> ... <def>DEFINITION</def>
fn parse_strongs_tei(number: &str, raw: &str) -> Result<StrongsEntry> {
    // Extract first <orth> (the Greek/Hebrew word itself, no type attribute)
    let lemma = extract_first_tag_text(raw, "orth", Some(("type", "")))
        .or_else(|| extract_tag_text(raw, "orth"))
        .unwrap_or_else(|| number.to_string());

    // Extract <orth rend="bold" type="trans"> for romanized transliteration
    let transliteration = strip_cjk(&extract_tag_by_attr(raw, "orth", "type", "trans").unwrap_or_default());

    // Extract <pron> for pronunciation hint (in braces like {ag-ap-ah'-o}).
    // A subset of entries in this specific StrongsGreek module (found via a
    // full-lexicon scan — ~1% of entries, e.g. G3756) have Chinese usage
    // notes ("在母音前用" = "used before a vowel") mixed directly into this
    // field in the source data itself — not an encoding bug on our end, but
    // out of place for an English-language study tool, so strip it.
    let pronunciation = strip_cjk(&extract_tag_text(raw, "pron").unwrap_or_default());

    // Extract <def> block for the actual definition
    let definition = extract_tag_text(raw, "def")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    // Build short_def: transliteration + pronunciation + core definition
    let header = [transliteration.as_str(), pronunciation.as_str()]
        .iter()
        .filter(|s| !s.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");

    let def_clean = definition.split_whitespace().collect::<Vec<_>>().join(" ");

    // Split definition at first sentence end for short vs long
    let (short_def, long_def) = split_at_sentence(&def_clean);
    let is_untranslated_marker = is_untranslated_marker_text(&def_clean);

    Ok(StrongsEntry {
        number: number.to_string(),
        lemma,
        transliteration: header,
        part_of_speech: String::new(),
        short_def: if short_def.is_empty() {
            def_clean.chars().take(200).collect()
        } else {
            short_def
        },
        long_def,
        usage_count: 0,
        usage_by_book: vec![],
        is_untranslated_marker,
    })
}

/// Parse RawLD plain-text format (used by StrongsHebrew).
/// Line 1: " NUMBER  TRANSLIT  PRONUNCIATION"
/// Blank line, then definition paragraphs.
fn parse_strongs_plain(number: &str, raw: &str) -> Result<StrongsEntry> {
    let mut lines = raw.lines();

    // First line: " 1  'ab  awb" or similar
    let first = lines.next().unwrap_or("").trim().to_string();
    // The lemma is just the Strong's number's word — use transliteration from line 1
    // format: "NUM  TRANSLIT  PRONUNCIATION"
    let parts: Vec<&str> = first.splitn(3, "  ").collect();
    let transliteration = parts.get(1).copied().unwrap_or("").trim().to_string();
    let pronunciation = parts.get(2).copied().unwrap_or("").trim().to_string();

    // Remaining non-empty lines are the definition
    let definition: String = lines
        .skip_while(|l| l.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    let header = [transliteration.as_str(), pronunciation.as_str()]
        .iter()
        .filter(|s| !s.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("  ");

    let (short_def, long_def) = split_at_sentence(&definition);
    let is_untranslated_marker = is_untranslated_marker_text(&definition);

    Ok(StrongsEntry {
        number: number.to_string(),
        lemma: format!("H{}", parse_strongs_number(number).unwrap_or(0)),
        transliteration: header,
        part_of_speech: String::new(),
        short_def: if short_def.is_empty() {
            definition.chars().take(200).collect()
        } else {
            short_def
        },
        long_def,
        usage_count: 0,
        usage_by_book: vec![],
        is_untranslated_marker,
    })
}

/// Strong's own 1890 definitions use a consistent form of words for particles
/// that have no fixed, independent English rendering. Hebrew examples like
/// H0853 (the direct-object marker) say "...unrepresented in English)."; the
/// Greek article G3588 says "...(sometimes to be supplied, at others
/// omitted, in English idiom)" — same underlying fact (translators add or
/// drop this word based on English idiom, it doesn't map to one fixed English
/// word), different dictionary's wording for it. Detecting both forms lets
/// the UI tell a real content word from grammatical scaffolding that just
/// happened to get attached to the nearest visible word during tagging,
/// without maintaining a hand-picked list of Strong's numbers.
fn is_untranslated_marker_text(definition: &str) -> bool {
    let lower = definition.to_lowercase();
    lower.contains("unrepresented in english")
        || lower.contains("not translated in")
        || lower.contains("is untranslated")
        || lower.contains("to be supplied")
        || (lower.contains("omitted") && lower.contains("english idiom"))
        // "usually not expressed" (e.g. G3385's interrogative particle) means
        // omission is the DEFAULT — deliberately narrower than "often/frequently
        // not expressed" (e.g. H376 "man", a real, heavily-translated word that
        // only occasionally drops out of idiom), which must NOT match here.
        || lower.contains("usually not expressed")
}

/// Strong's definitions conventionally read as
/// "[etymology clause]; [core meaning]:--[KJV renderings]." — e.g. G2226:
/// "neuter of a derivative of 2198; a live thing, i.e. an animal:--beast."
/// The etymology clause comes *first*, so splitting at the first `;`/`.`/`:`
/// (as this used to) surfaces "neuter of a derivative of 2198" as the
/// headline definition and buries the actual meaning ("a live thing, i.e. an
/// animal") in the full entry below. The core meaning is reliably the LAST
/// `;`-delimited clause before the `:--` KJV-word-list marker, so extract
/// that for the headline instead, while keeping the complete original text
/// (etymology included) as the full lexicon entry — nothing is discarded,
/// just reordered for what's shown prominently.
/// Etymology clauses conventionally open with one of these — used both to
/// fall back to the KJV word list below when the whole "definition body" is
/// nothing but etymology (see `split_at_sentence`), and by the full-lexicon
/// audit test to find entries where that's still true after the fallback.
/// Removes CJK characters (and the whitespace/punctuation left behind) from
/// `s`. See the comment at its call site in `parse_strongs_tei` for why.
fn strip_cjk(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .filter(|&c| {
            let cp = c as u32;
            !((0x4E00..=0x9FFF).contains(&cp) // CJK Unified Ideographs
                || (0x3000..=0x303F).contains(&cp) // CJK punctuation (incl. ideographic space/comma)
                || (0xFF00..=0xFFEF).contains(&cp)) // Fullwidth forms
        })
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn looks_like_etymology(s: &str) -> bool {
    let lower = s.to_lowercase();
    const OPENERS: &[&str] = &[
        "from ", "a primitive", "of uncertain", "probably from", "apparently a",
        "apparently from", "see ", "prolongation", "contracted from",
        "feminine of", "masculine of", "neuter of",
    ];
    OPENERS.iter().any(|o| lower.starts_with(o))
}

// A trailing clause opening with one of these reads as a usage footnote
// tacked on after the real meaning (e.g. G1519: "...to or into (indicating
// the point reached or entered)...; also in adverbial phrases:--..." — the
// core meaning is the middle clause, not this trailing one) rather than the
// meaning itself — found via a full-Bible audit that spot-checked every
// Strong's number actually cited in the KJV text, not just the two-clause
// common case.
const TRAILING_FOOTNOTE_OPENERS: &[&str] = &[
    "also ", "often ", "sometimes ", "chiefly ", "generally ", "usually ", "frequently ",
];

fn split_at_sentence(s: &str) -> (String, String) {
    let body = match s.find(":--") {
        Some(idx) => &s[..idx],
        None => s,
    };
    let clauses: Vec<&str> = body
        .split(';')
        .map(|c| c.trim().trim_end_matches(['.', ':', ',']).trim())
        .filter(|c| !c.is_empty())
        .collect();

    // Walk back from the last clause, skipping any that are just trailing
    // usage footnotes, to find the actual core-meaning clause.
    let core = clauses
        .iter()
        .rev()
        .find(|c| {
            let lower = c.to_lowercase();
            !TRAILING_FOOTNOTE_OPENERS.iter().any(|o| lower.starts_with(o))
        })
        .copied()
        .unwrap_or("");

    // Some entries have no semicolon-delimited "meaning" clause at all — just
    // an etymology clause, then the KJV word list (e.g. H81: "feminine of
    // 80:--powder."). When that's all `core` found, the actual gloss is only
    // in the KJV list after `:--`, so pull the first word from there instead
    // of surfacing pure etymology as the headline definition.
    let short_def = if core.is_empty() {
        s.chars().take(200).collect()
    } else if looks_like_etymology(core) {
        s.find(":--")
            .and_then(|idx| s[idx + 3..].split([',', ';']).next())
            .map(|w| w.trim().trim_end_matches('.').to_string())
            .filter(|w| !w.is_empty())
            .unwrap_or_else(|| core.to_string())
    } else {
        core.to_string()
    };

    (short_def, s.trim().to_string())
}

/// Extract text content of the first matching tag (ignoring attributes).
fn extract_tag_text(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{tag}>");
    let start = xml.find(&open)?;
    let content_start = xml[start..].find('>')? + start + 1;
    let end = xml[content_start..].find(&close)? + content_start;
    Some(strip_xml_tags(&xml[content_start..end]).trim().to_string())
}

/// Extract text of the first <TAG> that has NO "type" attribute (i.e., plain orth).
fn extract_first_tag_text(
    xml: &str,
    tag: &str,
    exclude_attr: Option<(&str, &str)>,
) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{tag}>");
    let mut pos = 0;
    while let Some(rel) = xml[pos..].find(&open) {
        let abs = pos + rel;
        let tag_end = xml[abs..].find('>')?;
        let tag_str = &xml[abs..abs + tag_end + 1];
        // Skip if it has the excluded attribute
        let skip = if let Some((attr, val)) = exclude_attr {
            if val.is_empty() {
                tag_str.contains(&format!("{attr}="))
            } else {
                tag_str.contains(&format!("{attr}=\"{val}\""))
            }
        } else {
            false
        };
        if !skip {
            let content_start = abs + tag_end + 1;
            if let Some(end_rel) = xml[content_start..].find(&close) {
                let text = strip_xml_tags(&xml[content_start..content_start + end_rel]);
                let text = text.trim().to_string();
                if !text.is_empty() {
                    return Some(text);
                }
            }
        }
        pos = abs + 1;
    }
    None
}

/// Extract text of a tag that has a specific attribute value.
fn extract_tag_by_attr(xml: &str, tag: &str, attr: &str, val: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{tag}>");
    let mut pos = 0;
    while let Some(rel) = xml[pos..].find(&open) {
        let abs = pos + rel;
        let tag_end = xml[abs..].find('>')?;
        let tag_str = &xml[abs..abs + tag_end + 1];
        if tag_str.contains(&format!("{attr}=\"{val}\"")) {
            let content_start = abs + tag_end + 1;
            if let Some(end_rel) = xml[content_start..].find(&close) {
                let text = strip_xml_tags(&xml[content_start..content_start + end_rel]);
                return Some(text.trim().to_string());
            }
        }
        pos = abs + 1;
    }
    None
}

/// Strip XML/HTML tags from a string for plain-text display.
fn strip_xml_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod marker_tests {
    use super::is_untranslated_marker_text;

    #[test]
    fn flags_h0853_style_direct_object_marker() {
        let def = "apparent contracted from 226 in the demonstrative sense of \
                    entity; properly, self (but generally used to point out more \
                    definitely the object of a verb or preposition, even or \
                    namely):--(as such unrepresented in English).";
        assert!(is_untranslated_marker_text(def));
    }

    #[test]
    fn does_not_flag_a_normal_content_word() {
        let def = "a primitive root; to shine; (transitively) to illuminate.";
        assert!(!is_untranslated_marker_text(def));
    }

    #[test]
    fn flags_g3588_style_greek_article() {
        // Real StrongsGreek text for G3588, the Greek definite article — the
        // Hebrew and Greek dictionaries use different wording for the same
        // underlying fact (this word doesn't map to one fixed English word).
        let def = "he hay, and the neuter to to in all their inflections; the \
                    definite article; the (sometimes to be supplied, at others \
                    omitted, in English idiom):--the, this, that, one, he, she, \
                    it, etc.";
        assert!(is_untranslated_marker_text(def));
    }

    #[test]
    fn flags_g3385_style_interrogative_particle() {
        // Real StrongsGreek text for G3385 — an interrogative particle
        // expressed only through question word order, never its own English
        // word. Found via a full-lexicon audit alongside G3588.
        let def = "from 3361 and the neuter of 5100; whether at all:--not (the \
                    particle usually not expressed, except by the form of the \
                    question).";
        assert!(is_untranslated_marker_text(def));
    }

    #[test]
    fn does_not_flag_a_word_that_only_sometimes_drops_from_idiom() {
        // Real StrongsHebrew text for H376 ("man") — a real, heavily
        // translated content word that only *sometimes* acts as an
        // untranslated adjunct. "frequently not expressed" must not trip the
        // same detector as "usually not expressed" (G3385) or "unrepresented
        // in English" (H0853) — this word has dozens of real KJV renderings.
        let def = "a man as an individual or a male person; often used as an \
                    adjunct to a more definite term (and in such cases \
                    frequently not expressed in translation):--man, husband, person.";
        assert!(!is_untranslated_marker_text(def));
    }
}

#[cfg(test)]
mod short_def_tests {
    use super::split_at_sentence;

    #[test]
    fn extracts_the_core_meaning_not_the_etymology_clause() {
        // Real StrongsGreek text for G2226 ("beast" in Rev 4:7). The
        // etymology clause ("neuter of a derivative of 2198") used to win as
        // the headline definition because it comes first and ends at the
        // first semicolon — the actual gloss ("a live thing, i.e. an
        // animal") was buried in the full entry instead.
        let def = "neuter of a derivative of 2198; a live thing, i.e. an animal:--beast.";
        let (short_def, long_def) = split_at_sentence(def);
        assert_eq!(short_def, "a live thing, i.e. an animal");
        assert_eq!(long_def, def);
    }

    #[test]
    fn falls_back_to_the_whole_text_with_no_semicolon() {
        let def = "to shine:--shine.";
        let (short_def, _) = split_at_sentence(def);
        assert_eq!(short_def, "to shine");
    }

    #[test]
    fn falls_back_to_kjv_word_list_when_body_is_pure_etymology() {
        // Real StrongsHebrew text for H81 — no semicolon at all, so the whole
        // "definition body" before `:--` is just the etymology clause. The
        // real gloss ("powder") only exists in the KJV word list after it.
        let def = "feminine of 80:--powder.";
        let (short_def, _) = split_at_sentence(def);
        assert_eq!(short_def, "powder");
    }
}

#[cfg(test)]
mod format_detection_tests {
    use super::parse_strongs_entry;

    #[test]
    fn a_bare_angle_bracket_does_not_misroute_plain_text_into_the_xml_parser() {
        // Real StrongsHebrew RawLD text for H6848 — found via a full-lexicon
        // audit. Its transliteration ("tsiph<oniy") contains a literal '<'
        // with no closing tag anywhere in the entry. Detecting XML by a bare
        // '<' used to route this into parse_strongs_tei, which found no
        // <orth>/<def> tags and silently produced an entirely empty entry.
        let raw = " 6848  tsepha`  tseh'-fah; or tsiph<oniy {tsif-o-nee'\r\n\r\n from an unused root meaning to extrude; a viper (as thrusting\r\n out the tongue, i.e. hissing):--adder, cockatrice.\r";
        let entry = parse_strongs_entry("H6848", raw).unwrap();
        assert!(!entry.short_def.is_empty());
        assert!(!entry.long_def.is_empty());
        assert!(entry.long_def.contains("viper"));
    }
}

#[cfg(test)]
mod cjk_stripping_tests {
    use super::parse_strongs_entry;

    #[test]
    fn strips_chinese_usage_notes_mixed_into_the_pronunciation_field() {
        // Real StrongsGreek TEI text for G3756. Found via a full-lexicon scan:
        // ~1% of entries in this specific module have Chinese annotations
        // ("在母音前用" = "used before a vowel") mixed directly into <pron> in
        // the source data itself — not an encoding bug, but out of place for
        // an English-language study tool and, worse, this is exactly the text
        // shown prominently in the sheet's header.
        let raw = r#"<entryFree n="3756">
<orth>ὐ</orth><lb/>
<orth type="writing">ouj</orth> <orth rend="bold" type="trans">ou</orth> <pron rend="italic">{oo} ，　在母音前用 ouk {ook} ; 在有气号之前用ouch {ookh}</pron>
<def>
 a primary word; the absolute negative adverb; no or not:--not.
</def>
</entryFree>"#;
        let entry = parse_strongs_entry("G3756", raw).unwrap();
        assert!(!entry.transliteration.chars().any(|c| (c as u32) >= 0x3000));
        assert!(entry.transliteration.contains("ou"));
        assert!(entry.transliteration.contains("ook"));
    }
}
