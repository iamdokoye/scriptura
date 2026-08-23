use crate::db::Database;
use crate::types::*;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn list_service_order(
    db: State<Arc<Database>>,
) -> std::result::Result<Vec<ServiceOrderItem>, AppError> {
    db.list_service_order()
}

/// Replaces the whole ordered list — matches how the frontend already treats
/// the service order as one unit (add/remove/reorder are local array edits,
/// persisted as a whole afterward), same as it did against localStorage.
#[tauri::command]
pub fn set_service_order(
    items: Vec<ServiceOrderItem>,
    db: State<Arc<Database>>,
) -> std::result::Result<(), AppError> {
    db.set_service_order(&items)
}
