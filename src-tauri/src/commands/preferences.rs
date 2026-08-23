use crate::db::Database;
use crate::types::*;
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_reading_position(
    db: State<Arc<Database>>,
) -> std::result::Result<Option<ReadingPosition>, AppError> {
    db.get_reading_position()
}

#[tauri::command]
pub fn set_reading_position(
    book: String,
    chapter: u32,
    verse: u32,
    module_id: String,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.set_reading_position(&ReadingPosition {
        book,
        chapter,
        verse,
        module_id,
    })
}

#[tauri::command]
pub fn get_preferences(db: State<Arc<Database>>) -> std::result::Result<Preferences, AppError> {
    db.get_preferences()
}

#[tauri::command]
pub fn set_preferences(
    prefs: Value,
    db: State<Arc<Database>>,
) -> std::result::Result<Preferences, AppError> {
    db.update_preferences(&prefs)
}
