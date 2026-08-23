use crate::db::Database;
use crate::types::*;
use std::sync::Arc;
use tauri::State;

/// Whether the one-time legacy-localStorage import has already run. The
/// frontend checks this before bothering to read its localStorage keys at all,
/// so a device with nothing to import (a fresh install, or one that's already
/// imported) doesn't do unnecessary work on every startup.
#[tauri::command]
pub fn legacy_import_done(db: State<Arc<Database>>) -> std::result::Result<bool, AppError> {
    db.legacy_import_done()
}

/// One-time import of the four payloads that used to live in browser
/// localStorage. Safe to call unconditionally — see
/// Database::import_legacy_local_storage for the idempotency guarantee.
#[tauri::command]
pub fn import_legacy_local_storage(
    payload: LegacyLocalStorageImport,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.import_legacy_local_storage(&payload)
}
