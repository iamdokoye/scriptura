use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::sword::{BibleReader, LexiconReader, conf::ModuleType, file_cache::FileCache};
use crate::types::*;
use crate::versification::BOOK_NAMES;
use serde_json::Value;

// ── Chapter cache ─────────────────────────────────────────────────────────────

/// In-process LRU-ish chapter cache.  Keyed by (module_id, book, chapter).
/// Capped at MAX_ENTRIES; when full we evict a random entry (simple, allocation-free).
pub struct ChapterCache {
    map: Mutex<HashMap<(String, String, u32), ChapterText>>,
}

const MAX_CACHE_ENTRIES: usize = 60;

impl ChapterCache {
    pub fn new() -> Self { Self { map: Mutex::new(HashMap::new()) } }

    pub fn get(&self, module_id: &str, book: &str, chapter: u32) -> Option<ChapterText> {
        let map = self.map.lock().unwrap();
        map.get(&(module_id.to_string(), book.to_string(), chapter)).cloned()
    }

    pub fn insert(&self, module_id: &str, book: &str, chapter: u32, value: ChapterText) {
        let mut map = self.map.lock().unwrap();
        if map.len() >= MAX_CACHE_ENTRIES {
            // Evict one arbitrary entry to keep memory bounded
            if let Some(key) = map.keys().next().cloned() { map.remove(&key); }
        }
        map.insert((module_id.to_string(), book.to_string(), chapter), value);
    }
}

// ── FTS index builder ─────────────────────────────────────────────────────────

/// Build the full-text search index for a Bible module.
///
/// Walks every book → chapter in KJV order, reads plain text via BibleReader,
/// and writes it to the FTS table in one transaction per module.
///
/// Progress is reported in the range [base_pct, 95] so the caller can place
/// this after the download phase (which already used 0–60%).
///
/// Chapters that fail to read are skipped with a log line rather than aborting
/// the whole index — real modules have occasional gaps (missing verses, locked
/// sections) and we shouldn't fail the install over them.
pub(crate) fn build_fts_index(
    module_id: &str,
    registry: &ModuleRegistry,
    db: &Database,
    base_pct: u32,
    emit: impl Fn(u32, &str),
) -> Result<()> {
    let conf = registry.conf_for(module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.to_string()))?;

    // Only Bible and Commentary modules have verse-keyed text to index
    if !matches!(conf.module_type, ModuleType::Bible | ModuleType::Commentary) {
        return Ok(());
    }

    let module_path = registry.module_path(module_id);
    // Use a local FileCache for the indexer — it runs once at startup and doesn't
    // need to share the session-level cache.
    let local_file_cache = FileCache::new();
    let reader = BibleReader::open(&module_path, &conf, &local_file_cache)?;

    let total_books = BOOK_NAMES.len() as u32;
    let pct_range = 95u32.saturating_sub(base_pct);

    let mut rows: Vec<(&'static str, u32, u32, String)> = Vec::with_capacity(31_102);
    // strongs_counts: strongs_number → (book → occurrence_count)
    let mut strongs_map: HashMap<String, HashMap<String, u32>> = HashMap::new();

    for (book_idx, &book) in BOOK_NAMES.iter().enumerate() {
        let book_pct = base_pct + (book_idx as u32 * pct_range / total_books);
        emit(book_pct, &format!("Indexing {book}…"));

        let chapter_count = crate::versification::CHAPTER_COUNTS
            .get(book_idx)
            .copied()
            .unwrap_or(0);

        for chapter in 1..=chapter_count {
            match reader.get_chapter(book, chapter) {
                Ok(ch) => {
                    for v in ch.verses {
                        let plain: String = v.spans.iter().map(|s| s.text.as_str()).collect();
                        let plain = plain.trim().to_string();
                        if !plain.is_empty() {
                            rows.push((book, chapter, v.verse, plain));
                        }
                        // Tally Strong's numbers while we have the parsed spans
                        for span in &v.spans {
                            if let Some(ref s) = span.strongs {
                                if !s.is_empty() {
                                    *strongs_map
                                        .entry(s.clone())
                                        .or_default()
                                        .entry(book.to_string())
                                        .or_insert(0) += 1;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    log::warn!("index skip {book} {chapter}: {e}");
                }
            }
        }
    }

    emit(95, "Writing search index…");

    let owned: Vec<(&str, u32, u32, String)> = rows.iter()
        .map(|(b, ch, v, t)| (*b, *ch, *v, t.clone()))
        .collect();
    db.replace_module_index(module_id, &owned)?;

    // Flatten strongs_map and persist in one transaction
    let strongs_rows: Vec<(String, String, u32)> = strongs_map
        .into_iter()
        .flat_map(|(strongs, books)| {
            books.into_iter().map(move |(book, count)| (strongs.clone(), book, count))
        })
        .collect();
    db.replace_strongs_counts(module_id, &strongs_rows)?;

    db.mark_index_built(module_id)?;

    Ok(())
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
    let conf = registry.conf_for(&module_id)
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
    let conf = registry.conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let module_path = registry.module_path(&module_id);
    let reader = BibleReader::open(&module_path, &conf, &file_cache)?;
    reader.get_verse(&book, chapter, verse)
}

// ── Lexicon ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_strongs_entry(
    module_id: String,         // lexicon module, e.g. "StrongsGreek"
    strongs_number: String,
    bible_module_id: String,   // active Bible module, used to query occurrence counts
    db: State<'_, Arc<Database>>,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<StrongsEntry, AppError> {
    let conf = registry.conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let module_path = registry.module_path(&module_id);
    let reader = LexiconReader::open(&module_path, &conf)?;
    let mut entry = reader.get_strongs_entry(&strongs_number)?;

    let (total, by_book) = db.get_strongs_counts(&bible_module_id, &strongs_number)?;
    entry.usage_count = total;
    entry.usage_by_book = by_book;

    Ok(entry)
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
    let conf = registry.conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let module_path = registry.module_path(&module_id);
    let reader = BibleReader::open(&module_path, &conf, &file_cache)?;
    let verse_text = reader.get_verse(&book, chapter, verse)?;
    Ok(verse_text.spans.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(""))
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

// ── Search ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn search(
    query: String,
    options: SearchOptions,
    db: State<Arc<Database>>,
) -> std::result::Result<Vec<SearchResult>, AppError> {
    db.search_fts(&query, &options)
}

/// Rebuild the full-text search index for a module.
/// Called automatically by the frontend when a module's index_built flag is false.
#[tauri::command]
pub async fn rebuild_search_index(
    module_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    let app_clone = app.clone();
    let module_id_clone = module_id.clone();
    let registry = registry.inner().clone();
    let db = db.inner().clone();

    tokio::task::spawn_blocking(move || {
        build_fts_index(&module_id_clone, &registry, &db, 0, |pct, msg| {
            let _ = app_clone.emit("index-progress", serde_json::json!({
                "module_id": module_id_clone,
                "progress": pct,
                "message": msg,
            }));
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    let _ = app.emit("index-progress", serde_json::json!({
        "module_id": module_id,
        "progress": 100u32,
        "message": "Index ready",
    }));

    Ok(())
}

// ── Module management ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_installed_modules(
    db: State<Arc<Database>>,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<Vec<InstalledModule>, AppError> {
    // Reload from disk to catch any newly installed modules
    registry.load_installed();

    let records = db.list_installed_module_records()?;
    let modules = records.into_iter().filter_map(|(id, name, path, version, _category, index_built)| {
        // The database is only an installation record. A module is usable only
        // when its extracted configuration can also be loaded from disk. This
        // lets the startup auto-install repair stale records left by an aborted
        // download instead of incorrectly treating them as installed forever.
        let conf = registry.conf_for(&id)?;
        let category = match conf.module_type {
            crate::sword::conf::ModuleType::Commentary => ModuleCategory::Commentary,
            crate::sword::conf::ModuleType::Lexicon    => ModuleCategory::Lexicon,
            crate::sword::conf::ModuleType::Dictionary => ModuleCategory::Dictionary,
            crate::sword::conf::ModuleType::Bible      => ModuleCategory::Bible,
        };
        Some(InstalledModule {
            id: id.clone(),
            name,
            description: String::new(),
            language: String::new(),
            version,
            category,
            installed: true,
            requires_key: false,
            has_strongs: false,
            size_bytes: None,
            install_path: path,
            index_built,
        })
    }).collect();
    Ok(modules)
}

#[tauri::command]
pub async fn list_available_modules(
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<Vec<ModuleInfo>, AppError> {
    let registry = registry.inner().clone();
    tokio::task::spawn_blocking(move || Ok(registry.fetch_available()))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// Shared implementation for install_module and install_module_with_key.
///
/// Phase 1 (0–60%): Download + extract via ModuleRegistry::install.
/// Phase 2 (60–95%): Build an FTS index when the module is searchable.
/// Phase 3 (100%): Done — emitted here so the UI progress bar completes.
async fn run_install(
    module_id: String,
    key: Option<String>,
    app: AppHandle,
    db: Arc<Database>,
    registry: Arc<ModuleRegistry>,
) -> std::result::Result<(), AppError> {
    let app_clone = app.clone();
    let module_id_clone = module_id.clone();
    let key_clone = key.clone();

    let registry_for_install = Arc::clone(&registry);
    let mid_for_closure = module_id_clone.clone();

    // Phase 1: download + extract (reports 5–59 via the closure)
    tokio::task::spawn_blocking(move || {
        registry_for_install.install(&module_id_clone, key_clone.as_deref(), move |progress, message| {
            let _ = app_clone.emit("module-install-progress", serde_json::json!({
                "module_id": mid_for_closure,
                "progress": progress,
                "message": message,
            }));
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    // Record the extracted module before optional indexing. In particular, TSK is
    // needed by cross-references immediately after download; making it wait for a
    // full-text index meant it could look downloaded but never installed.
    let module_path = registry.module_path(&module_id);
    let conf = registry.conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let category_str = match conf.module_type {
        crate::sword::conf::ModuleType::Commentary => "Commentary",
        crate::sword::conf::ModuleType::Lexicon    => "Lexicon",
        crate::sword::conf::ModuleType::Dictionary => "Dictionary",
        crate::sword::conf::ModuleType::Bible      => "Bible",
    };
    let module_name = if conf.name.is_empty() { module_id.as_str() } else { &conf.name };
    let module_version = if conf.version.is_empty() { "1.0" } else { &conf.version };
    db.record_installed_module(
        &module_id,
        module_name,
        &module_path.to_string_lossy(),
        module_version,
        category_str,
    )?;

    // TSK is reference data, not a searchable text module. Its index was both
    // unnecessary and delayed the point at which cross-references became usable.
    // Mark it complete now so the caller can immediately read the extracted data.
    let should_index = matches!(conf.module_type, ModuleType::Bible | ModuleType::Commentary)
        && !module_id.eq_ignore_ascii_case("TSK");

    if should_index {
        // Phase 2: build FTS index (60–95%), blocking
        let _ = app.emit("module-install-progress", serde_json::json!({
            "module_id": module_id,
            "progress": 60u32,
            "message": "Building search index…",
        }));

        let app_clone2 = app.clone();
        let module_id_clone2 = module_id.clone();
        let registry_for_index = Arc::clone(&registry);
        let db_for_index = Arc::clone(&db);

        tokio::task::spawn_blocking(move || {
            build_fts_index(&module_id_clone2, &registry_for_index, &db_for_index, 60, |pct, msg| {
                let _ = app_clone2.emit("module-install-progress", serde_json::json!({
                    "module_id": module_id_clone2,
                    "progress": pct,
                    "message": msg,
                }));
            })
        })
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    } else {
        // Non-searchable modules should not be re-indexed on every launch.
        db.mark_index_built(&module_id)?;
    }

    // Phase 3: done
    let _ = app.emit("module-install-progress", serde_json::json!({
        "module_id": module_id,
        "progress": 100u32,
        "message": "Done",
    }));

    Ok(())
}

#[tauri::command]
pub async fn install_module(
    module_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    run_install(module_id, None, app, db.inner().clone(), registry.inner().clone()).await
}

#[tauri::command]
pub async fn install_module_with_key(
    module_id: String,
    key: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    run_install(module_id, Some(key), app, db.inner().clone(), registry.inner().clone()).await
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_bookmark(
    book: String, chapter: u32, verse: u32, module_id: String,
    db: State<Arc<Database>>,
) -> std::result::Result<Bookmark, AppError> {
    db.add_bookmark(&book, chapter, verse, &module_id)
}

#[tauri::command]
pub fn remove_bookmark(id: i64, db: State<Arc<Database>>) -> std::result::Result<(), AppError> {
    db.remove_bookmark(id)
}

#[tauri::command]
pub fn list_bookmarks(db: State<Arc<Database>>) -> std::result::Result<Vec<Bookmark>, AppError> {
    db.list_bookmarks()
}

// ── Notes ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_note(
    book: String, chapter: u32, verse: Option<u32>, module_id: String, content: String,
    db: State<Arc<Database>>,
) -> std::result::Result<Note, AppError> {
    db.add_note(&book, chapter, verse, &module_id, &content)
}

#[tauri::command]
pub fn update_note(id: i64, content: String, db: State<Arc<Database>>) -> std::result::Result<Note, AppError> {
    db.update_note(id, &content)
}

#[tauri::command]
pub fn delete_note(id: i64, db: State<Arc<Database>>) -> std::result::Result<(), AppError> {
    db.delete_note(id)
}

#[tauri::command]
pub fn list_notes(db: State<Arc<Database>>) -> std::result::Result<Vec<Note>, AppError> {
    db.list_notes()
}

// ── Preferences & position ────────────────────────────────────────────────────

#[tauri::command]
pub fn get_reading_position(db: State<Arc<Database>>) -> std::result::Result<Option<ReadingPosition>, AppError> {
    db.get_reading_position()
}

#[tauri::command]
pub fn set_reading_position(
    book: String, chapter: u32, verse: u32, module_id: String,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.set_reading_position(&ReadingPosition { book, chapter, verse, module_id })
}

#[tauri::command]
pub fn get_preferences(db: State<Arc<Database>>) -> std::result::Result<Preferences, AppError> {
    db.get_preferences()
}

#[tauri::command]
pub fn set_preferences(prefs: Value, db: State<Arc<Database>>) -> std::result::Result<(), AppError> {
    // Merge partial prefs into current preferences
    let mut current = db.get_preferences()?;
    if let Some(obj) = prefs.as_object() {
        if let Some(v) = obj.get("theme").and_then(|v| v.as_str()) { current.theme = v.to_string(); }
        if let Some(v) = obj.get("font_size_reading").and_then(|v| v.as_u64()) { current.font_size_reading = v as u32; }
        if let Some(v) = obj.get("show_strongs").and_then(|v| v.as_bool()) { current.show_strongs = v; }
        if let Some(v) = obj.get("show_morph").and_then(|v| v.as_bool()) { current.show_morph = v; }
        if let Some(v) = obj.get("verse_display").and_then(|v| v.as_str()) { current.verse_display = v.to_string(); }
    }
    db.set_preferences(&current)
}

/// Persisted presentation state so the presentation window can fetch it immediately on load.
pub struct PresentationState(pub Mutex<Option<Value>>);

/// Relay presentation state from the main window to the presentation window.
/// Stores the latest state and pushes it via WebviewWindow::eval, which injects
/// JS directly into the target webview from the host process. This is used instead
/// of listen/emit or the window's own timers because macOS throttles JS execution
/// (including setTimeout and the event loop that would deliver a `listen` callback)
/// in WKWebViews that are not the key/focused window — eval() is driven externally
/// and isn't subject to that throttling.
#[tauri::command]
pub async fn relay_presentation(
    app: AppHandle,
    state: State<'_, PresentationState>,
    payload: Value,
) -> std::result::Result<(), String> {
    // Persist so the window can pull it immediately on mount
    *state.0.lock().unwrap() = Some(payload.clone());

    if let Some(window) = app.get_webview_window("presentation") {
        let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
        let script = format!(
            "window.__scripturaApplyPresentation && window.__scripturaApplyPresentation({json});"
        );
        window.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Called by the presentation window on mount to get the current state without
/// waiting for the next emit (avoids race between window load and first relay call).
#[tauri::command]
pub async fn get_presentation_state(
    state: State<'_, PresentationState>,
) -> std::result::Result<Option<Value>, String> {
    Ok(state.0.lock().unwrap().clone())
}

#[tauri::command]
pub async fn open_presentation_window(app: AppHandle) -> std::result::Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    // If already open, just focus it
    if let Some(w) = app.get_webview_window("presentation") {
        let _ = w.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "presentation", WebviewUrl::App("index.html".into()))
        .title("Scriptura Live")
        .fullscreen(true)
        .decorations(false)
        .initialization_script("window.__SCRIPTURA_PRESENTATION__ = true;")
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_presentation_window(app: AppHandle) -> std::result::Result<(), String> {
    if let Some(w) = app.get_webview_window("presentation") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
