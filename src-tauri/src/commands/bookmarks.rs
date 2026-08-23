use crate::db::Database;
use crate::types::*;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn add_bookmark(
    book: String,
    chapter: u32,
    verse: u32,
    module_id: String,
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
