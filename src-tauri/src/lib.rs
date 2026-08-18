mod commands;
mod db;
mod markup;
mod modules;
mod sword;
mod types;
mod versification;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data dir");
            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("scriptura.db");
            let db = db::Database::open(&db_path).expect("failed to open database");
            app.manage(db);

            let modules_dir = data_dir.join("modules");
            std::fs::create_dir_all(&modules_dir)?;
            app.manage(modules::ModuleRegistry::new(modules_dir));
            app.manage(commands::ChapterCache::new());
            app.manage(sword::file_cache::FileCache::new());

            // Background startup thread: rebuild stale FTS indexes, then pre-warm
            // the chapter cache with the saved reading position so first render is instant.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let db       = handle.state::<db::Database>();
                let registry = handle.state::<modules::ModuleRegistry>();
                let chapter_cache = handle.state::<commands::ChapterCache>();
                let file_cache    = handle.state::<sword::file_cache::FileCache>();

                registry.load_installed();

                let records = match db.list_installed_module_records() {
                    Ok(r) => r,
                    Err(e) => { log::error!("[startup] list modules: {e}"); return; }
                };

                // 1. Rebuild any module whose FTS index is missing or stale.
                for (id, _name, _path, _version, _cat, index_built) in &records {
                    if !index_built {
                        log::info!("[startup] rebuilding FTS for {id}");
                        if let Err(e) = commands::build_fts_index(id, &registry, &db, 0, |_, _| {}) {
                            log::error!("[startup] FTS rebuild {id}: {e}");
                        }
                    }
                }

                // 2. Pre-warm the chapter cache from the saved reading position.
                //    This loads the current chapter + the two adjacent ones so forward/back
                //    navigation after launch is instant.
                let pos = db.get_reading_position().ok().flatten();
                if let Some(pos) = pos {
                    let bible_id = records.iter()
                        .find(|(_, _, _, _, cat, _)| cat == "Bible")
                        .map(|(id, _, _, _, _, _)| id.clone())
                        .or_else(|| records.first().map(|(id, _, _, _, _, _)| id.clone()));

                    if let Some(module_id) = bible_id {
                        let conf = registry.conf_for(&module_id);
                        if let Some(conf) = conf {
                            let module_path = registry.module_path(&module_id);
                            let max_chapter = versification::CHAPTER_COUNTS
                                .get(versification::BOOK_NAMES.iter().position(|&b| b == pos.book.as_str()).unwrap_or(0))
                                .copied()
                                .unwrap_or(1);

                            // current, prev, next
                            let chapters_to_warm = [
                                pos.chapter,
                                pos.chapter.saturating_sub(1).max(1),
                                (pos.chapter + 1).min(max_chapter),
                            ];

                            for ch in chapters_to_warm {
                                if chapter_cache.get(&module_id, &pos.book, ch).is_some() {
                                    continue;
                                }
                                if let Ok(reader) = sword::BibleReader::open(&module_path, &conf, &file_cache) {
                                    if let Ok(chapter_text) = reader.get_chapter(&pos.book, ch) {
                                        chapter_cache.insert(&module_id, &pos.book, ch, chapter_text);
                                    }
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_chapter,
            commands::get_verse,
            commands::get_strongs_entry,
            commands::search,
            commands::get_commentary,
            commands::get_cross_references,
            commands::list_installed_modules,
            commands::list_available_modules,
            commands::install_module,
            commands::install_module_with_key,
            commands::add_bookmark,
            commands::remove_bookmark,
            commands::list_bookmarks,
            commands::add_note,
            commands::update_note,
            commands::delete_note,
            commands::list_notes,
            commands::get_reading_position,
            commands::set_reading_position,
            commands::get_preferences,
            commands::set_preferences,
            commands::rebuild_search_index,
            commands::open_presentation_window,
            commands::close_presentation_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
