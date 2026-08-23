use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::sword::{stepbible, LexiconReader};
use crate::types::*;
use std::sync::Arc;
use tauri::State;

/// STEPBible-Data's lexicons (TBESG, TBESH, TFLSJ) aren't SWORD modules —
/// plain tab-separated files fetched straight from GitHub and cached
/// alongside the installed modules directory, not through it.
fn stepbible_cache_dir(registry: &ModuleRegistry) -> std::result::Result<std::path::PathBuf, AppError> {
    let dir = registry
        .modules_dir()
        .parent()
        .ok_or_else(|| AppError::Sword("cannot resolve data directory".into()))?
        .join("stepbible");
    Ok(dir)
}

#[tauri::command]
pub fn get_strongs_entry(
    module_id: String, // lexicon module, e.g. "StrongsGreek", or a STEPBible source id like "TBESG"
    strongs_number: String,
    bible_module_id: String, // active Bible module, used to query occurrence counts
    db: State<'_, Arc<Database>>,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<StrongsEntry, AppError> {
    let mut entry = if let Some(source) = stepbible::source_for_id(&module_id) {
        let cache_dir = stepbible_cache_dir(&registry)?;
        stepbible::ensure_downloaded(&cache_dir, source)?;
        stepbible::get_entry(&cache_dir, source, &strongs_number)?
    } else {
        let conf = registry
            .conf_for(&module_id)
            .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
        let module_path = registry.module_path(&module_id);
        let reader = LexiconReader::open(&module_path, &conf)?;
        reader.get_strongs_entry(&strongs_number)?
    };

    let (total, by_book) = db.get_strongs_counts(&bible_module_id, &strongs_number)?;
    entry.usage_count = total;
    entry.usage_by_book = by_book;

    Ok(entry)
}

/// Pre-fetches a STEPBible-Data lexicon so it's ready before the user's
/// first lookup — get_strongs_entry would download it lazily on demand
/// anyway, but calling this at launch avoids a multi-second wait on the
/// first pill click.
#[tauri::command]
pub fn ensure_stepbible_lexicon(
    source_id: String,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    let source = stepbible::source_for_id(&source_id)
        .ok_or_else(|| AppError::Sword(format!("unknown STEPBible source: {source_id}")))?;
    let cache_dir = stepbible_cache_dir(&registry)?;
    stepbible::ensure_downloaded(&cache_dir, source)
}
