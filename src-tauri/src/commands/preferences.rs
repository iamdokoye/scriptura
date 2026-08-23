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
) -> std::result::Result<(), AppError> {
    // Merge partial prefs into current preferences
    let mut current = db.get_preferences()?;
    if let Some(obj) = prefs.as_object() {
        if let Some(v) = obj.get("theme").and_then(|v| v.as_str()) {
            current.theme = v.to_string();
        }
        if let Some(v) = obj.get("font_size_reading").and_then(|v| v.as_u64()) {
            current.font_size_reading = v as u32;
        }
        if let Some(v) = obj.get("show_strongs").and_then(|v| v.as_bool()) {
            current.show_strongs = v;
        }
        if let Some(v) = obj.get("show_morph").and_then(|v| v.as_bool()) {
            current.show_morph = v;
        }
        if let Some(v) = obj.get("verse_display").and_then(|v| v.as_str()) {
            current.verse_display = v.to_string();
        }
    }
    db.set_preferences(&current)
}
