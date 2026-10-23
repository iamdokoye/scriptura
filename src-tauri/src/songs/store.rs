use super::model::{ImportSummary, Song, SongSection, SongSummary};
use crate::types::{AppError, Result};
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

const MAX_SECTIONS: usize = 200;
const MAX_LYRICS_BYTES: usize = 200_000;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS songs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    author      TEXT NOT NULL DEFAULT '',
    copyright   TEXT NOT NULL DEFAULT '',
    ccli_number TEXT NOT NULL DEFAULT '',
    song_key    TEXT NOT NULL DEFAULT '',
    tempo       TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',
    notes       TEXT NOT NULL DEFAULT '',
    arrangement TEXT NOT NULL DEFAULT '[]',
    favourite   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS song_sections (
    song_id  INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    key      TEXT NOT NULL,
    label    TEXT NOT NULL,
    lyrics   TEXT NOT NULL,
    PRIMARY KEY (song_id, position)
);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title COLLATE NOCASE);
CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
    title, author, lyrics, tokenize = 'unicode61 remove_diacritics 2'
);
";

/// Holds the song database, or the reason it could not be opened. Commands return
/// that reason instead of panicking, so a broken `songs.db` shows up as an error
/// in the Songs view only.
pub struct SongStore(std::result::Result<SongDb, String>);

impl SongStore {
    pub fn open(path: &Path) -> Self {
        Self(SongDb::open(path).map_err(|e| e.to_string()))
    }

    pub fn db(&self) -> Result<&SongDb> {
        self.0
            .as_ref()
            .map_err(|e| AppError::Other(format!("Song library unavailable: {e}")))
    }
}

pub struct SongDb(Mutex<Connection>);

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Turn free text into a safe FTS5 prefix query: every word quoted, last-token
/// prefix-matched. Returns None when nothing searchable remains.
fn fts_query(input: &str) -> Option<String> {
    let words: Vec<String> = input
        .split(|c: char| !c.is_alphanumeric() && c != '\'')
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{}\"*", w.replace('"', "")))
        .collect();
    if words.is_empty() {
        None
    } else {
        Some(words.join(" "))
    }
}

impl SongDb {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self(Mutex::new(conn)))
    }

    /// Recover from a poisoned lock rather than bricking the library for the rest
    /// of the session; the SQLite connection itself is unaffected by a Rust panic.
    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.0.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn list(&self, query: Option<&str>) -> Result<Vec<SongSummary>> {
        let conn = self.conn();
        let map = |r: &rusqlite::Row| {
            Ok(SongSummary {
                id: r.get(0)?,
                title: r.get(1)?,
                author: r.get(2)?,
                ccli_number: r.get(3)?,
                favourite: r.get::<_, i64>(4)? != 0,
                updated_at: r.get(5)?,
                copyright: r.get(6)?,
                tags: serde_json::from_str(&r.get::<_, String>(7)?).unwrap_or_default(),
            })
        };
        let cols = "s.id, s.title, s.author, s.ccli_number, s.favourite, s.updated_at, s.copyright, s.tags";
        let rows = match query.and_then(fts_query) {
            Some(q) => {
                let mut stmt = conn.prepare(&format!(
                    "SELECT {cols} FROM songs_fts f JOIN songs s ON s.id = f.rowid
                     WHERE songs_fts MATCH ?1 ORDER BY bm25(songs_fts, 10.0, 3.0, 1.0) LIMIT 200"
                ))?;
                let it = stmt.query_map([q], map)?;
                it.collect::<rusqlite::Result<Vec<_>>>()?
            }
            None => {
                let mut stmt = conn.prepare(&format!(
                    "SELECT {cols} FROM songs s ORDER BY s.title COLLATE NOCASE LIMIT 5000"
                ))?;
                let it = stmt.query_map([], map)?;
                it.collect::<rusqlite::Result<Vec<_>>>()?
            }
        };
        Ok(rows)
    }

    pub fn get(&self, id: i64) -> Result<Song> {
        let conn = self.conn();
        Self::read_song(&conn, id)
    }

    fn read_song(conn: &Connection, id: i64) -> Result<Song> {
        let mut song = conn
            .query_row(
                "SELECT title, author, copyright, ccli_number, song_key, tempo, tags, notes,
                        arrangement, favourite, updated_at FROM songs WHERE id = ?1",
                [id],
                |r| {
                    let tags: String = r.get(6)?;
                    let arrangement: String = r.get(8)?;
                    Ok(Song {
                        id: Some(id),
                        title: r.get(0)?,
                        author: r.get(1)?,
                        copyright: r.get(2)?,
                        ccli_number: r.get(3)?,
                        key: r.get(4)?,
                        tempo: r.get(5)?,
                        tags: serde_json::from_str(&tags).unwrap_or_default(),
                        notes: r.get(7)?,
                        arrangement: serde_json::from_str(&arrangement).unwrap_or_default(),
                        favourite: r.get::<_, i64>(9)? != 0,
                        updated_at: r.get(10)?,
                        sections: Vec::new(),
                    })
                },
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::Other("Song not found".into()),
                other => other.into(),
            })?;
        let mut stmt = conn.prepare(
            "SELECT key, label, lyrics FROM song_sections WHERE song_id = ?1 ORDER BY position",
        )?;
        song.sections = stmt
            .query_map([id], |r| {
                Ok(SongSection { key: r.get(0)?, label: r.get(1)?, lyrics: r.get(2)? })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(song)
    }

    /// Insert or replace a whole song (metadata, sections, search index) atomically.
    pub fn save(&self, song: &Song) -> Result<Song> {
        let song = sanitize(song)?;
        let mut conn = self.conn();
        let id = Self::write_song(&mut conn, &song)?;
        Self::read_song(&conn, id)
    }

    fn write_song(conn: &mut Connection, song: &Song) -> Result<i64> {
        let now = now_millis();
        let tags = serde_json::to_string(&song.tags).unwrap_or_else(|_| "[]".into());
        let arrangement = serde_json::to_string(&song.arrangement).unwrap_or_else(|_| "[]".into());
        let tx = conn.transaction()?;
        let id = match song.id {
            Some(id) => {
                let n = tx.execute(
                    "UPDATE songs SET title=?2, author=?3, copyright=?4, ccli_number=?5, song_key=?6,
                        tempo=?7, tags=?8, notes=?9, arrangement=?10, favourite=?11, updated_at=?12
                     WHERE id=?1",
                    params![
                        id, song.title, song.author, song.copyright, song.ccli_number, song.key,
                        song.tempo, tags, song.notes, arrangement, song.favourite as i64, now
                    ],
                )?;
                if n == 0 {
                    return Err(AppError::Other("Song not found".into()));
                }
                id
            }
            None => {
                tx.execute(
                    "INSERT INTO songs (title, author, copyright, ccli_number, song_key, tempo, tags,
                        notes, arrangement, favourite, created_at, updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)",
                    params![
                        song.title, song.author, song.copyright, song.ccli_number, song.key,
                        song.tempo, tags, song.notes, arrangement, song.favourite as i64, now
                    ],
                )?;
                tx.last_insert_rowid()
            }
        };
        tx.execute("DELETE FROM song_sections WHERE song_id = ?1", [id])?;
        for (pos, s) in song.sections.iter().enumerate() {
            tx.execute(
                "INSERT INTO song_sections (song_id, position, key, label, lyrics) VALUES (?1,?2,?3,?4,?5)",
                params![id, pos as i64, s.key, s.label, s.lyrics],
            )?;
        }
        let lyrics = song
            .sections
            .iter()
            .map(|s| s.lyrics.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        tx.execute("DELETE FROM songs_fts WHERE rowid = ?1", [id])?;
        tx.execute(
            "INSERT INTO songs_fts (rowid, title, author, lyrics) VALUES (?1,?2,?3,?4)",
            params![id, song.title, song.author, lyrics],
        )?;
        tx.commit()?;
        Ok(id)
    }

    pub fn delete(&self, id: i64) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM songs_fts WHERE rowid = ?1", [id])?;
        tx.execute("DELETE FROM songs WHERE id = ?1", [id])?;
        tx.commit()?;
        Ok(())
    }

    /// Save parsed songs, skipping any the library already has (same CCLI number,
    /// or same title + author ignoring case).
    pub fn import(&self, songs: &[Song]) -> Result<ImportSummary> {
        let mut conn = self.conn();
        let mut imported = Vec::new();
        let mut skipped = Vec::new();
        for song in songs {
            let mut song = sanitize(song)?;
            song.id = None;
            let dup: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM songs WHERE
                    (?1 != '' AND ccli_number = ?1)
                    OR (title = ?2 COLLATE NOCASE AND author = ?3 COLLATE NOCASE))",
                params![song.ccli_number, song.title, song.author],
                |r| r.get(0),
            )?;
            if dup {
                skipped.push(song.title.clone());
                continue;
            }
            let id = Self::write_song(&mut conn, &song)?;
            imported.push(SongSummary {
                id,
                title: song.title.clone(),
                author: song.author.clone(),
                copyright: song.copyright.clone(),
                tags: song.tags.clone(),
                ccli_number: song.ccli_number.clone(),
                favourite: song.favourite,
                updated_at: now_millis(),
            });
        }
        Ok(ImportSummary { imported, skipped })
    }
}

/// Trim and bound user-supplied song data so a bad payload can't bloat the store
/// or leave the arrangement pointing at sections that don't exist.
fn sanitize(song: &Song) -> Result<Song> {
    let mut s = song.clone();
    s.title = s.title.trim().to_string();
    if s.title.is_empty() {
        return Err(AppError::Other("A song needs a title".into()));
    }
    if s.sections.len() > MAX_SECTIONS {
        return Err(AppError::Other("Too many sections".into()));
    }
    let total: usize = s.sections.iter().map(|x| x.lyrics.len()).sum();
    if total > MAX_LYRICS_BYTES {
        return Err(AppError::Other("Lyrics are too long".into()));
    }
    for sec in &mut s.sections {
        sec.lyrics = sec.lyrics.replace("\r\n", "\n").trim_end().to_string();
    }
    // Unique, non-empty section keys.
    let mut seen = std::collections::HashSet::new();
    for (i, sec) in s.sections.iter_mut().enumerate() {
        let mut key = sec.key.trim().to_string();
        if key.is_empty() {
            key = format!("s{}", i + 1);
        }
        let base = key.clone();
        let mut n = 2;
        while !seen.insert(key.clone()) {
            key = format!("{base}{n}");
            n += 1;
        }
        sec.key = key;
    }
    s.arrangement.retain(|k| s.sections.iter().any(|sec| &sec.key == k));
    s.tags.retain(|t| !t.trim().is_empty());
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> SongDb {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static N: AtomicUsize = AtomicUsize::new(0);
        let p = std::env::temp_dir().join(format!(
            "scriptura-songs-{}-{}.db",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_file(&p);
        SongDb::open(&p).unwrap()
    }

    fn song(title: &str, lyrics: &str) -> Song {
        Song {
            title: title.into(),
            sections: vec![SongSection { key: "v1".into(), label: "Verse 1".into(), lyrics: lyrics.into() }],
            ..Default::default()
        }
    }

    #[test]
    fn save_get_search_delete() {
        let db = temp_db();
        let saved = db.save(&song("Amazing Grace", "Amazing grace how sweet the sound")).unwrap();
        let id = saved.id.unwrap();
        assert_eq!(db.get(id).unwrap().sections.len(), 1);
        assert_eq!(db.list(Some("sweet sou")).unwrap().len(), 1);
        assert_eq!(db.list(Some("amaz")).unwrap().len(), 1);
        assert!(db.list(Some("zzz")).unwrap().is_empty());
        // Re-saving replaces the index entry rather than duplicating it.
        let mut again = saved.clone();
        again.sections[0].lyrics = "Totally different words".into();
        db.save(&again).unwrap();
        assert!(db.list(Some("sweet")).unwrap().is_empty());
        assert_eq!(db.list(Some("different")).unwrap().len(), 1);
        db.delete(id).unwrap();
        assert!(db.list(None).unwrap().is_empty());
    }

    #[test]
    fn import_skips_duplicates_and_search_is_injection_safe() {
        let db = temp_db();
        let a = song("Holy", "Holy holy holy");
        let first = db.import(&[a.clone()]).unwrap();
        assert_eq!(first.imported.len(), 1);
        let second = db.import(&[a]).unwrap();
        assert_eq!(second.skipped, vec!["Holy".to_string()]);
        assert!(db.list(Some("\" OR * NEAR(")).is_ok());
    }

    #[test]
    fn sanitize_fixes_keys_and_arrangement() {
        let mut s = song("T", "x");
        s.sections.push(SongSection { key: "v1".into(), label: "Verse 2".into(), lyrics: "y".into() });
        s.arrangement = vec!["v1".into(), "nope".into()];
        let out = sanitize(&s).unwrap();
        assert_eq!(out.sections[1].key, "v12");
        assert_eq!(out.arrangement, vec!["v1".to_string()]);
        assert!(sanitize(&song("  ", "x")).is_err());
    }
}
