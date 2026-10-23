use crate::songs::{import, ImportSummary, Song, SongStore, SongSummary};
use crate::types::AppError;
use tauri::State;

type Result<T> = std::result::Result<T, AppError>;

#[tauri::command]
pub fn list_songs(query: Option<String>, store: State<SongStore>) -> Result<Vec<SongSummary>> {
    store.db()?.list(query.as_deref())
}

#[tauri::command]
pub fn get_song(id: i64, store: State<SongStore>) -> Result<Song> {
    store.db()?.get(id)
}

#[tauri::command]
pub fn save_song(song: Song, store: State<SongStore>) -> Result<Song> {
    store.db()?.save(&song)
}

#[tauri::command]
pub fn delete_song(id: i64, store: State<SongStore>) -> Result<()> {
    store.db()?.delete(id)
}

/// Parse a file's text into songs without saving, so the UI can preview it.
#[tauri::command]
pub fn parse_song_import(file_name: String, content: String) -> Result<Vec<Song>> {
    import::parse_song_file(&file_name, &content)
}

#[tauri::command]
pub fn import_songs(songs: Vec<Song>, store: State<SongStore>) -> Result<ImportSummary> {
    store.db()?.import(&songs)
}
