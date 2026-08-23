use crate::markup;
use crate::sword::block::{decompress_zlib, read_u16_le, read_u32_le};
use crate::sword::conf::{BlockType, Compression, ModuleConf};
use crate::sword::file_cache::FileCache;
use crate::types::{AppError, ChapterText, Result, VerseText};
use crate::versification::{chapter_verse_count, ot_nt_split};
/// SWORD Bible module reader.
///
/// Supports both:
/// - RawText (uncompressed): .vss index + .bdt data files per testament
/// - zText (zlib-compressed): .bzs/.bzv/.bzz index files + .bdt compressed blocks
///
/// Performance design
/// ------------------
/// `BibleReader` is created per-request (lightweight — it just holds a PathBuf
/// and an Arc to the FileCache).  The FileCache loads each testament data file
/// from disk exactly once per session and shares the bytes via Arc, so all
/// subsequent chapter reads are pure memory operations.
///
/// `get_chapter` reads all verses in a single pass over the already-cached
/// bytes — no per-verse file I/O.  For zText modules it also deduplicates
/// block decompression: verses that share a compressed block (the common case)
/// decompress it exactly once.
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub struct BibleReader<'a> {
    conf: ModuleConf,
    data_dir: PathBuf,
    cache: &'a FileCache,
}

impl<'a> BibleReader<'a> {
    pub fn open(module_path: &Path, conf: &ModuleConf, cache: &'a FileCache) -> Result<Self> {
        let data_dir = module_path
            .join("modules")
            .join("texts")
            .join(conf.data_path.trim_start_matches("./"));
        if !data_dir.exists() {
            let alt = module_path.join(conf.data_path.trim_start_matches("./"));
            if alt.exists() {
                return Ok(Self {
                    conf: conf.clone(),
                    data_dir: alt,
                    cache,
                });
            }
            return Err(AppError::Sword(format!(
                "data dir not found: {}",
                data_dir.display()
            )));
        }
        Ok(Self {
            conf: conf.clone(),
            data_dir,
            cache,
        })
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /// Read all verses of a chapter in a single pass over cached bytes.
    pub fn get_chapter(&self, book: &str, chapter: u32) -> Result<ChapterText> {
        let verse_count = chapter_verse_count(book, chapter)
            .ok_or_else(|| AppError::Sword(format!("unknown book/chapter: {book} {chapter}")))?;

        let (testament, book_ord) =
            ot_nt_split(book).ok_or_else(|| AppError::Sword(format!("unknown book: {book}")))?;

        let prefix = if testament == 0 { "ot" } else { "nt" };

        let raw_verses = match &self.conf.compression {
            Compression::None => {
                self.rawtext_chapter(prefix, testament, book_ord, chapter, verse_count)
            }
            Compression::Zip => {
                self.ztext_chapter(prefix, testament, book_ord, chapter, verse_count)
            }
        }?;

        let mut verses = Vec::with_capacity(raw_verses.len());
        for (i, raw) in raw_verses.into_iter().enumerate() {
            if raw.is_empty() {
                continue;
            }
            match markup::parse(&raw, &self.conf.markup) {
                Ok(spans) => verses.push(VerseText {
                    book: book.to_string(),
                    chapter,
                    verse: i as u32 + 1,
                    spans,
                }),
                Err(e) => log::warn!("markup error {book} {chapter}:{}: {e}", i + 1),
            }
        }

        Ok(ChapterText {
            module_id: self.conf.module_id.clone(),
            book: book.to_string(),
            chapter,
            verses,
        })
    }

    /// Single-verse lookup (used by cross-reference resolution and the FTS indexer).
    pub fn get_verse(&self, book: &str, chapter: u32, verse: u32) -> Result<VerseText> {
        let raw = self.raw_verse(book, chapter, verse)?;
        let spans = markup::parse(&raw, &self.conf.markup)?;
        Ok(VerseText {
            book: book.to_string(),
            chapter,
            verse,
            spans,
        })
    }

    /// Return unparsed verse data for consumers that need module-specific markup.
    ///
    /// The TSK cross-reference module stores its references inside ThML
    /// `<scripRef>` elements. The regular markup parser intentionally hides those
    /// from display text, so cross-reference extraction must use this raw form.
    pub fn get_raw_verse(&self, book: &str, chapter: u32, verse: u32) -> Result<String> {
        self.raw_verse(book, chapter, verse)
    }

    // ── Bulk chapter readers ──────────────────────────────────────────────────

    fn rawtext_chapter(
        &self,
        prefix: &str,
        testament: u32,
        book_ord: u32,
        chapter: u32,
        verse_count: u32,
    ) -> Result<Vec<String>> {
        // Each file is loaded from disk once per session; all subsequent calls
        // get an Arc clone pointing to the same allocation.
        let vss = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.vss")))?;
        let bdt = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.bdt")))?;

        let mut out = Vec::with_capacity(verse_count as usize);
        for verse in 1..=verse_count {
            let ordinal = match kjv_ord(self, testament, book_ord, chapter, verse) {
                Some(v) => v,
                None => {
                    out.push(String::new());
                    continue;
                }
            };
            let entry = ordinal * 6;
            let data_off = match read_u32_le(&vss, entry) {
                Some(v) => v as usize,
                None => {
                    out.push(String::new());
                    continue;
                }
            };
            let size = match read_u16_le(&vss, entry + 4) {
                Some(v) => v as usize,
                None => {
                    out.push(String::new());
                    continue;
                }
            };
            if size == 0 {
                out.push(String::new());
                continue;
            }
            out.push(match bdt.get(data_off..data_off + size) {
                Some(b) => self.decode(b).unwrap_or_default(),
                None => String::new(),
            });
        }
        Ok(out)
    }

    fn ztext_chapter(
        &self,
        prefix: &str,
        testament: u32,
        book_ord: u32,
        chapter: u32,
        verse_count: u32,
    ) -> Result<Vec<String>> {
        let ext = match &self.conf.block_type {
            BlockType::Book => "bzz",
            BlockType::Chapter => "bzc",
            BlockType::Verse => "bzt",
        };
        // Three files, all cached after first access
        let bzv = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.bzv")))?;
        let bzs = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.bzs")))?;
        let bdt = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.{ext}")))?;

        // Decompressed block cache: block_num → decompressed bytes.
        // Multiple verses usually share the same compressed block (chapter or book granularity),
        // so this avoids redundant zlib work within one chapter read.
        let mut block_cache: HashMap<usize, Vec<u8>> = HashMap::new();

        let mut out = Vec::with_capacity(verse_count as usize);
        for verse in 1..=verse_count {
            let ordinal = match kjv_ord(self, testament, book_ord, chapter, verse) {
                Some(v) => v,
                None => {
                    out.push(String::new());
                    continue;
                }
            };
            let bze = ordinal * 10;
            let block_num = match read_u32_le(&bzv, bze) {
                Some(v) => v as usize,
                None => {
                    out.push(String::new());
                    continue;
                }
            };
            let verse_start = match read_u32_le(&bzv, bze + 4) {
                Some(v) => v as usize,
                None => {
                    out.push(String::new());
                    continue;
                }
            };
            let verse_size = match read_u16_le(&bzv, bze + 8) {
                Some(v) => v as usize,
                None => {
                    out.push(String::new());
                    continue;
                }
            };
            if verse_size == 0 {
                out.push(String::new());
                continue;
            }

            let decompressed = if let Some(d) = block_cache.get(&block_num) {
                d
            } else {
                let bse = block_num * 12;
                let boff = match read_u32_le(&bzs, bse) {
                    Some(v) => v as usize,
                    None => {
                        out.push(String::new());
                        continue;
                    }
                };
                let blen = match read_u32_le(&bzs, bse + 4) {
                    Some(v) => v as usize,
                    None => {
                        out.push(String::new());
                        continue;
                    }
                };
                let compressed = match bdt.get(boff..boff + blen) {
                    Some(b) => b,
                    None => {
                        out.push(String::new());
                        continue;
                    }
                };
                match decompress_zlib(compressed) {
                    Ok(d) => {
                        block_cache.insert(block_num, d);
                        block_cache.get(&block_num).unwrap()
                    }
                    Err(_) => {
                        out.push(String::new());
                        continue;
                    }
                }
            };

            out.push(
                match decompressed.get(verse_start..verse_start + verse_size) {
                    Some(b) => self.decode(b).unwrap_or_default(),
                    None => String::new(),
                },
            );
        }
        Ok(out)
    }

    // ── Single-verse helpers ──────────────────────────────────────────────────

    fn raw_verse(&self, book: &str, chapter: u32, verse: u32) -> Result<String> {
        let (testament, book_ord) =
            ot_nt_split(book).ok_or_else(|| AppError::Sword(format!("unknown book: {book}")))?;
        let prefix = if testament == 0 { "ot" } else { "nt" };
        match &self.conf.compression {
            Compression::None => self.rawtext_verse(prefix, testament, book_ord, chapter, verse),
            Compression::Zip => self.ztext_verse(prefix, testament, book_ord, chapter, verse),
        }
    }

    fn rawtext_verse(
        &self,
        prefix: &str,
        testament: u32,
        book_ord: u32,
        chapter: u32,
        verse: u32,
    ) -> Result<String> {
        let vss = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.vss")))?;
        let bdt = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.bdt")))?;
        let ordinal = self.kjv_ordinal(testament, book_ord, chapter, verse)? as usize;
        let entry = ordinal * 6;
        let off = read_u32_le(&vss, entry)
            .ok_or_else(|| AppError::Sword("vss out of range".into()))? as usize;
        let size = read_u16_le(&vss, entry + 4)
            .ok_or_else(|| AppError::Sword("vss out of range".into()))? as usize;
        if size == 0 {
            return Ok(String::new());
        }
        self.decode(
            bdt.get(off..off + size)
                .ok_or_else(|| AppError::Sword("bdt out of range".into()))?,
        )
    }

    fn ztext_verse(
        &self,
        prefix: &str,
        testament: u32,
        book_ord: u32,
        chapter: u32,
        verse: u32,
    ) -> Result<String> {
        let ext = match &self.conf.block_type {
            BlockType::Book => "bzz",
            BlockType::Chapter => "bzc",
            BlockType::Verse => "bzt",
        };
        let bzv = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.bzv")))?;
        let bzs = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.bzs")))?;
        let bdt = self
            .cache
            .read(&self.data_dir.join(format!("{prefix}.{ext}")))?;
        let ordinal = self.kjv_ordinal(testament, book_ord, chapter, verse)? as usize;
        let bze = ordinal * 10;
        let block_num = read_u32_le(&bzv, bze)
            .ok_or_else(|| AppError::Sword("bzv: block_num".into()))?
            as usize;
        let verse_start = read_u32_le(&bzv, bze + 4)
            .ok_or_else(|| AppError::Sword("bzv: verse_start".into()))?
            as usize;
        let verse_size = read_u16_le(&bzv, bze + 8)
            .ok_or_else(|| AppError::Sword("bzv: verse_size".into()))?
            as usize;
        if verse_size == 0 {
            return Ok(String::new());
        }
        let bse = block_num * 12;
        let boff =
            read_u32_le(&bzs, bse).ok_or_else(|| AppError::Sword("bzs: offset".into()))? as usize;
        let blen =
            read_u32_le(&bzs, bse + 4).ok_or_else(|| AppError::Sword("bzs: size".into()))? as usize;
        let compressed = bdt
            .get(boff..boff + blen)
            .ok_or_else(|| AppError::Sword("bdt: slice".into()))?;
        let decompressed = decompress_zlib(compressed)?;
        self.decode(
            decompressed
                .get(verse_start..verse_start + verse_size)
                .ok_or_else(|| AppError::Sword("decomp: slice".into()))?,
        )
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    fn decode(&self, bytes: &[u8]) -> Result<String> {
        use crate::sword::conf::Encoding;
        match &self.conf.encoding {
            Encoding::Utf8 => {
                String::from_utf8(bytes.to_vec()).map_err(|e| AppError::Sword(format!("utf8: {e}")))
            }
            Encoding::Latin1 => Ok(bytes.iter().map(|&b| b as char).collect()),
        }
    }

    fn kjv_ordinal(&self, testament: u32, book_ord: u32, chapter: u32, verse: u32) -> Result<u32> {
        use crate::versification::kjv_verse_ordinal;
        kjv_verse_ordinal(testament, book_ord, chapter, verse).ok_or_else(|| {
            AppError::Sword(format!(
                "out-of-range: t={testament} b={book_ord} ch={chapter} v={verse}"
            ))
        })
    }
}

/// Helper to avoid a `self.` borrow conflict inside iterator closures.
#[inline]
fn kjv_ord(
    _reader: &BibleReader<'_>,
    testament: u32,
    book_ord: u32,
    chapter: u32,
    verse: u32,
) -> Option<usize> {
    use crate::versification::kjv_verse_ordinal;
    kjv_verse_ordinal(testament, book_ord, chapter, verse).map(|v| v as usize)
}

impl super::ModuleReader for BibleReader<'_> {
    fn module_id(&self) -> &str {
        &self.conf.module_id
    }
}
