//! Tauri command handlers, split by domain.
//!
//! This used to be one 777-line file mixing every domain's commands together —
//! Bible reading, search, module install, bookmarks, notes, preferences, and
//! presentation relay all in one place with no boundaries between them. Split so
//! each concern lives in its own file and can be read/changed independently.
//! This file is just the aggregator: it declares the submodules and re-exports
//! their public items so `commands::get_chapter`, `commands::ChapterCache`, etc.
//! keep working exactly as before from lib.rs's perspective — the split is purely
//! internal organization, not a change to the command names or wiring.

mod bible;
mod bookmarks;
mod legacy_import;
mod lexicon;
mod module_install;
mod notes;
mod preferences;
mod presentation;
mod presentation_themes;
mod search;
mod search_history;
mod service_order;

// Glob re-exports, not named ones: #[tauri::command] generates hidden sibling
// items alongside each function (__cmd__foo, __tauri_command_name_foo) that
// tauri::generate_handler![commands::foo, ...] in lib.rs also needs to resolve.
// A named `pub use module::{foo};` re-exports only `foo` itself and silently
// leaves those hidden items unreachable through `commands::`, which fails to
// compile with an opaque "could not find __cmd__foo in commands" error.
pub use bible::*;
pub use bookmarks::*;
pub use legacy_import::*;
pub use lexicon::*;
pub use module_install::*;
pub use notes::*;
pub use preferences::*;
pub use presentation::*;
pub use presentation_themes::*;
pub use search::*;
pub use search_history::*;
pub use service_order::*;

// Used by lib.rs's startup thread to rebuild any module whose FTS index is stale.
pub(crate) use search::build_fts_index;
