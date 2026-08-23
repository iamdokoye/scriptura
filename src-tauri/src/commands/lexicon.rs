use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::sword::LexiconReader;
use crate::types::*;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_strongs_entry(
    module_id: String, // lexicon module, e.g. "StrongsGreek"
    strongs_number: String,
    bible_module_id: String, // active Bible module, used to query occurrence counts
    db: State<'_, Arc<Database>>,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<StrongsEntry, AppError> {
    let conf = registry
        .conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let module_path = registry.module_path(&module_id);
    let reader = LexiconReader::open(&module_path, &conf)?;
    let mut entry = reader.get_strongs_entry(&strongs_number)?;

    let (total, by_book) = db.get_strongs_counts(&bible_module_id, &strongs_number)?;
    entry.usage_count = total;
    entry.usage_by_book = by_book;

    Ok(entry)
}
