use crate::db::Database;
use crate::types::*;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn list_search_history(
    db: State<Arc<Database>>,
) -> std::result::Result<Vec<SearchHistoryEntry>, AppError> {
    db.list_search_history()
}

#[tauri::command]
pub fn add_search_history_entry(
    query: String,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.add_search_history_entry(&query)
}

#[tauri::command]
pub fn set_last_search_history_ref(
    book: String,
    chapter: u32,
    verse: u32,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.set_last_search_history_ref(&book, chapter, verse)
}

#[tauri::command]
pub fn clear_search_history(db: State<Arc<Database>>) -> std::result::Result<(), AppError> {
    db.clear_search_history()
}
