use crate::modules::ModuleRegistry;
use crate::sword::{file_cache::FileCache, BibleReader};
use crate::types::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

// ── Chapter cache ─────────────────────────────────────────────────────────────

/// In-process LRU-ish chapter cache.  Keyed by (module_id, book, chapter).
/// Capped at MAX_ENTRIES; when full we evict a random entry (simple, allocation-free).
pub struct ChapterCache {
    map: Mutex<HashMap<(String, String, u32), ChapterText>>,
}

const MAX_CACHE_ENTRIES: usize = 60;

impl ChapterCache {
    pub fn new() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self, module_id: &str, book: &str, chapter: u32) -> Option<ChapterText> {
        let map = self.map.lock().unwrap();
        map.get(&(module_id.to_string(), book.to_string(), chapter))
            .cloned()
    }

    pub fn insert(&self, module_id: &str, book: &str, chapter: u32, value: ChapterText) {
        let mut map = self.map.lock().unwrap();
        if map.len() >= MAX_CACHE_ENTRIES {
            // Evict one arbitrary entry to keep memory bounded
            if let Some(key) = map.keys().next().cloned() {
                map.remove(&key);
            }
        }
        map.insert((module_id.to_string(), book.to_string(), chapter), value);
    }
}

// ── Bible reading ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_chapter(
    module_id: String,
    book: String,
    chapter: u32,
    registry: State<Arc<ModuleRegistry>>,
    chapter_cache: State<ChapterCache>,
    file_cache: State<FileCache>,
) -> std::result::Result<ChapterText, AppError> {
    if let Some(cached) = chapter_cache.get(&module_id, &book, chapter) {
        return Ok(cached);
    }
    let conf = registry
        .conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let module_path = registry.module_path(&module_id);
    let reader = BibleReader::open(&module_path, &conf, &file_cache)?;
    let result = reader.get_chapter(&book, chapter)?;
    chapter_cache.insert(&module_id, &book, chapter, result.clone());
    Ok(result)
}

#[tauri::command]
pub fn get_verse(
    module_id: String,
    book: String,
    chapter: u32,
    verse: u32,
    registry: State<Arc<ModuleRegistry>>,
    file_cache: State<FileCache>,
) -> std::result::Result<VerseText, AppError> {
    let conf = registry
        .conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let module_path = registry.module_path(&module_id);
    let reader = BibleReader::open(&module_path, &conf, &file_cache)?;
    reader.get_verse(&book, chapter, verse)
}

// ── Commentary ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_commentary(
    module_id: String,
    book: String,
    chapter: u32,
    verse: u32,
    registry: State<Arc<ModuleRegistry>>,
    file_cache: State<FileCache>,
) -> std::result::Result<String, AppError> {
    let conf = registry
        .conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let module_path = registry.module_path(&module_id);
    let reader = BibleReader::open(&module_path, &conf, &file_cache)?;
    let verse_text = reader.get_verse(&book, chapter, verse)?;
    Ok(verse_text
        .spans
        .iter()
        .map(|s| s.text.as_str())
        .collect::<Vec<_>>()
        .join(""))
}

// ── Cross references ──────────────────────────────────────────────────────────

/// Returns cross-references for the given verse by reading the TSK SWORD module.
/// Returns an empty list (not an error) if TSK isn't installed.
#[tauri::command]
pub fn get_cross_references(
    book: String,
    chapter: u32,
    verse: u32,
    registry: State<Arc<ModuleRegistry>>,
    file_cache: State<FileCache>,
) -> std::result::Result<Vec<CrossReference>, AppError> {
    let Some(conf) = registry.conf_for("TSK") else {
        return Ok(vec![]);
    };
    let module_path = registry.module_path("TSK");
    let reader = BibleReader::open(&module_path, &conf, &file_cache)?;

    // TSK stores its actual references within ThML <scripRef> elements. The
    // normal display parser suppresses those elements, so read the raw module
    // data before passing it to the TSK-specific parser.
    let Ok(raw) = reader.get_raw_verse(&book, chapter, verse) else {
        return Ok(vec![]);
    };
    Ok(crate::sword::crossref::parse_tsk_text(&raw, 120))
}
