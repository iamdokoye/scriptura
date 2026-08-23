use crate::db::Database;
use crate::modules::ModuleRegistry;
use crate::sword::conf::ModuleType;
use crate::types::*;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use super::search::build_fts_index;

#[tauri::command]
pub fn list_installed_modules(
    db: State<Arc<Database>>,
    registry: State<Arc<ModuleRegistry>>,
) -> std::result::Result<Vec<InstalledModule>, AppError> {
    // Reload from disk to catch any newly installed modules
    registry.load_installed();

    let records = db.list_installed_module_records()?;
    let modules = records
        .into_iter()
        .filter_map(|(id, name, path, version, _category, index_built)| {
            // The database is only an installation record. A module is usable only
            // when its extracted configuration can also be loaded from disk. This
            // lets the startup auto-install repair stale records left by an aborted
            // download instead of incorrectly treating them as installed forever.
            let conf = registry.conf_for(&id)?;
            let category = match conf.module_type {
                crate::sword::conf::ModuleType::Commentary => ModuleCategory::Commentary,
                crate::sword::conf::ModuleType::Lexicon => ModuleCategory::Lexicon,
                crate::sword::conf::ModuleType::Dictionary => ModuleCategory::Dictionary,
                crate::sword::conf::ModuleType::Bible => ModuleCategory::Bible,
            };
            Some(InstalledModule {
                id: id.clone(),
                name,
                description: String::new(),
                language: String::new(),
                version,
                category,
                installed: true,
                requires_key: false,
                has_strongs: false,
                size_bytes: None,
                install_path: path,
                index_built,
            })
        })
        .collect();
    Ok(modules)
}

#[tauri::command]
pub async fn list_available_modules(
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<Vec<ModuleInfo>, AppError> {
    let registry = registry.inner().clone();
    tokio::task::spawn_blocking(move || Ok(registry.fetch_available()))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// Shared implementation for install_module and install_module_with_key.
///
/// Phase 1 (0–60%): Download + extract via ModuleRegistry::install.
/// Phase 2 (60–95%): Build an FTS index when the module is searchable.
/// Phase 3 (100%): Done — emitted here so the UI progress bar completes.
async fn run_install(
    module_id: String,
    key: Option<String>,
    app: AppHandle,
    db: Arc<Database>,
    registry: Arc<ModuleRegistry>,
) -> std::result::Result<(), AppError> {
    let app_clone = app.clone();
    let module_id_clone = module_id.clone();
    let key_clone = key.clone();

    let registry_for_install = Arc::clone(&registry);
    let mid_for_closure = module_id_clone.clone();

    // Phase 1: download + extract (reports 5–59 via the closure)
    tokio::task::spawn_blocking(move || {
        registry_for_install.install(
            &module_id_clone,
            key_clone.as_deref(),
            move |progress, message| {
                let _ = app_clone.emit(
                    "module-install-progress",
                    serde_json::json!({
                        "module_id": mid_for_closure,
                        "progress": progress,
                        "message": message,
                    }),
                );
            },
        )
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    // Record the extracted module before optional indexing. In particular, TSK is
    // needed by cross-references immediately after download; making it wait for a
    // full-text index meant it could look downloaded but never installed.
    let module_path = registry.module_path(&module_id);
    let conf = registry
        .conf_for(&module_id)
        .ok_or_else(|| AppError::ModuleNotFound(module_id.clone()))?;
    let category_str = match conf.module_type {
        crate::sword::conf::ModuleType::Commentary => "Commentary",
        crate::sword::conf::ModuleType::Lexicon => "Lexicon",
        crate::sword::conf::ModuleType::Dictionary => "Dictionary",
        crate::sword::conf::ModuleType::Bible => "Bible",
    };
    let module_name = if conf.name.is_empty() {
        module_id.as_str()
    } else {
        &conf.name
    };
    let module_version = if conf.version.is_empty() {
        "1.0"
    } else {
        &conf.version
    };
    db.record_installed_module(
        &module_id,
        module_name,
        &module_path.to_string_lossy(),
        module_version,
        category_str,
    )?;

    // TSK is reference data, not a searchable text module. Its index was both
    // unnecessary and delayed the point at which cross-references became usable.
    // Mark it complete now so the caller can immediately read the extracted data.
    let should_index = matches!(conf.module_type, ModuleType::Bible | ModuleType::Commentary)
        && !module_id.eq_ignore_ascii_case("TSK");

    if should_index {
        // Phase 2: build FTS index (60–95%), blocking
        let _ = app.emit(
            "module-install-progress",
            serde_json::json!({
                "module_id": module_id,
                "progress": 60u32,
                "message": "Building search index…",
            }),
        );

        let app_clone2 = app.clone();
        let module_id_clone2 = module_id.clone();
        let registry_for_index = Arc::clone(&registry);
        let db_for_index = Arc::clone(&db);

        tokio::task::spawn_blocking(move || {
            build_fts_index(
                &module_id_clone2,
                &registry_for_index,
                &db_for_index,
                60,
                |pct, msg| {
                    let _ = app_clone2.emit(
                        "module-install-progress",
                        serde_json::json!({
                            "module_id": module_id_clone2,
                            "progress": pct,
                            "message": msg,
                        }),
                    );
                },
            )
        })
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    } else {
        // Non-searchable modules should not be re-indexed on every launch.
        db.mark_index_built(&module_id)?;
    }

    // Phase 3: done
    let _ = app.emit(
        "module-install-progress",
        serde_json::json!({
            "module_id": module_id,
            "progress": 100u32,
            "message": "Done",
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn install_module(
    module_id: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    run_install(
        module_id,
        None,
        app,
        db.inner().clone(),
        registry.inner().clone(),
    )
    .await
}

#[tauri::command]
pub async fn install_module_with_key(
    module_id: String,
    key: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    registry: State<'_, Arc<ModuleRegistry>>,
) -> std::result::Result<(), AppError> {
    run_install(
        module_id,
        Some(key),
        app,
        db.inner().clone(),
        registry.inner().clone(),
    )
    .await
}
