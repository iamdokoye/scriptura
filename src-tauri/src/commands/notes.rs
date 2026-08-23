use crate::db::Database;
use crate::types::*;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn add_note(
    book: String,
    chapter: u32,
    verse: Option<u32>,
    module_id: String,
    content: String,
    db: State<Arc<Database>>,
) -> std::result::Result<Note, AppError> {
    db.add_note(&book, chapter, verse, &module_id, &content)
}

#[tauri::command]
pub fn update_note(
    id: i64,
    content: String,
    db: State<Arc<Database>>,
) -> std::result::Result<Note, AppError> {
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
