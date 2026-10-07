use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::sword::{stepbible, LexiconReader};
use crate::types::*;
use std::sync::Arc;
use tauri::State;

/// STEPBible-Data's lexicons (TBESG, TBESH, TFLSJ) aren't SWORD modules —
/// plain tab-separated files fetched straight from GitHub and cached
/// alongside the installed modules directory, not through it.
fn stepbible_cache_dir(
    registry: &ModuleRegistry,
) -> std::result::Result<std::path::PathBuf, AppError> {
    let dir = registry
        .modules_dir()
        .parent()
        .ok_or_else(|| AppError::Sword("cannot resolve data directory".into()))?
        .join("stepbible");
    Ok(dir)
}

/// The marker flag for `strongs_number` as judged from the bundled Strong's
/// lexicon (StrongsGreek / StrongsHebrew); None if that module isn't installed
/// or has no such entry.
fn bundled_marker_flag(registry: &ModuleRegistry, strongs_number: &str) -> Option<bool> {
    let module_id = if strongs_number.starts_with('G') {
        "StrongsGreek"
    } else {
        "StrongsHebrew"
    };
    let conf = registry.conf_for(module_id)?;
    let reader = LexiconReader::open(&registry.module_path(module_id), &conf).ok()?;
    reader
        .get_strongs_entry(strongs_number)
        .ok()
        .map(|e| e.is_untranslated_marker)
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
        let mut entry = stepbible::get_entry(&cache_dir, source, &strongs_number)?;
        // Whether a number is a grammatical marker (the Greek article G3588,
        // the Hebrew direct-object marker H0853…) is a fact about the word,
        // not about which dictionary is on screen. Only Strong's own wording
        // is matched by the detector, so judge it from the bundled Strong's
        // entry — otherwise the article reads as a normal word under
        // Abbott-Smith/LSJ and wins over the real word in a phrase.
        if bundled_marker_flag(&registry, &strongs_number).unwrap_or(false) {
            entry.is_untranslated_marker = true;
        }
        entry
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
