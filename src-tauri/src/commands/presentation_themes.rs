use crate::db::Database;
use crate::types::{AppError, PresentationTheme, PresentationThemeInput};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn list_presentation_themes(
    db: State<Arc<Database>>,
) -> std::result::Result<Vec<PresentationTheme>, AppError> {
    db.list_presentation_themes()
}

#[tauri::command]
pub fn create_presentation_theme(
    theme: PresentationThemeInput,
    db: State<Arc<Database>>,
) -> std::result::Result<PresentationTheme, AppError> {
    db.create_presentation_theme(&theme)
}

#[tauri::command]
pub fn update_presentation_theme(
    id: String,
    theme: PresentationThemeInput,
    db: State<Arc<Database>>,
) -> std::result::Result<PresentationTheme, AppError> {
    db.update_presentation_theme(&id, &theme)
}

#[tauri::command]
pub fn delete_presentation_theme(
    id: String,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.delete_presentation_theme(&id)
}

#[tauri::command]
pub fn set_default_presentation_theme(
    id: String,
    db: State<Arc<Database>>,
) -> std::result::Result<PresentationTheme, AppError> {
    db.set_default_presentation_theme(&id)
}
