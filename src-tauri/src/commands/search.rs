use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::sword::{conf::ModuleType, file_cache::FileCache, BibleReader};
use crate::types::*;
use crate::versification::BOOK_NAMES;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

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
///
/// Shared by rebuild_search_index (below) and modules::run_install, which is why
/// this is pub(crate) rather than private to this file.
pub(crate) fn build_fts_index(
    module_id: &str,
    registry: &ModuleRegistry,
    db: &Database,
    base_pct: u32,
    emit: impl Fn(u32, &str),
) -> Result<()> {
    let conf = registry
        .conf_for(module_id)
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

    let owned: Vec<(&str, u32, u32, String)> = rows
        .iter()
        .map(|(b, ch, v, t)| (*b, *ch, *v, t.clone()))
        .collect();
    db.replace_module_index(module_id, &owned)?;

    // Flatten strongs_map and persist in one transaction
    let strongs_rows: Vec<(String, String, u32)> = strongs_map
        .into_iter()
        .flat_map(|(strongs, books)| {
            books
                .into_iter()
                .map(move |(book, count)| (strongs.clone(), book, count))
        })
        .collect();
    db.replace_strongs_counts(module_id, &strongs_rows)?;

    db.mark_index_built(module_id)?;

    Ok(())
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
            let _ = app_clone.emit(
                "index-progress",
                serde_json::json!({
                    "module_id": module_id_clone,
                    "progress": pct,
                    "message": msg,
                }),
            );
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    let _ = app.emit(
        "index-progress",
        serde_json::json!({
            "module_id": module_id,
            "progress": 100u32,
            "message": "Index ready",
        }),
    );

    Ok(())
}
