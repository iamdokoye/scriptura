use crate::types::*;
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

pub struct Database(Mutex<Connection>);

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            PRAGMA cache_size=-65536;
            PRAGMA mmap_size=134217728;
            PRAGMA synchronous=NORMAL;
            PRAGMA temp_store=MEMORY;
        ",
        )?;
        let db = Self(Mutex::new(conn));
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.0.lock().unwrap();
        // Create all permanent tables first (idempotent)
        conn.execute_batch(SCHEMA_TABLES)?;
        // Upgrade FTS table to unicode61 tokenizer if this is an old DB
        // (porter ascii has unreliable prefix-query behaviour)
        let ver: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap_or(0);
        if ver < 2 {
            conn.execute_batch(SCHEMA_FTS_V2)?;
        }
        if ver < 3 {
            // v3: strongs_counts were built with old OSIS parser that stored raw Greek
            // words instead of G-prefixed Strong's numbers. Clear and re-index.
            conn.execute_batch(SCHEMA_V3_STRONGS_RESET)?;
        }
        Ok(())
    }

    pub fn get_preferences(&self) -> Result<Preferences> {
        let conn = self.0.lock().unwrap();
        let result = conn.query_row(
            "SELECT theme, font_size_reading, show_strongs, show_morph, verse_display, default_commentary FROM preferences LIMIT 1",
            [],
            |row| {
                Ok(Preferences {
                    theme: row.get(0)?,
                    font_size_reading: row.get::<_, u32>(1)?,
                    show_strongs: row.get::<_, bool>(2)?,
                    show_morph: row.get::<_, bool>(3)?,
                    verse_display: row.get(4)?,
                    default_commentary: row.get(5)?,
                })
            },
        );
        match result {
            Ok(p) => Ok(p),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Preferences::default()),
            Err(e) => Err(e.into()),
        }
    }

    pub fn set_preferences(&self, prefs: &Preferences) -> Result<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO preferences (id, theme, font_size_reading, show_strongs, show_morph, verse_display, default_commentary)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               theme=excluded.theme,
               font_size_reading=excluded.font_size_reading,
               show_strongs=excluded.show_strongs,
               show_morph=excluded.show_morph,
               verse_display=excluded.verse_display,
               default_commentary=excluded.default_commentary",
            params![
                prefs.theme, prefs.font_size_reading, prefs.show_strongs,
                prefs.show_morph, prefs.verse_display, prefs.default_commentary
            ],
        )?;
        Ok(())
    }

    pub fn get_reading_position(&self) -> Result<Option<ReadingPosition>> {
        let conn = self.0.lock().unwrap();
        let result = conn.query_row(
            "SELECT book, chapter, verse, module_id FROM reading_position LIMIT 1",
            [],
            |row| {
                Ok(ReadingPosition {
                    book: row.get(0)?,
                    chapter: row.get(1)?,
                    verse: row.get(2)?,
                    module_id: row.get(3)?,
                })
            },
        );
        match result {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn set_reading_position(&self, pos: &ReadingPosition) -> Result<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO reading_position (id, book, chapter, verse, module_id) VALUES (1, ?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET book=excluded.book, chapter=excluded.chapter, verse=excluded.verse, module_id=excluded.module_id",
            params![pos.book, pos.chapter, pos.verse, pos.module_id],
        )?;
        Ok(())
    }

    pub fn add_bookmark(
        &self,
        book: &str,
        chapter: u32,
        verse: u32,
        module_id: &str,
    ) -> Result<Bookmark> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO bookmarks (book, chapter, verse, module_id) VALUES (?1, ?2, ?3, ?4)",
            params![book, chapter, verse, module_id],
        )?;
        let id = conn.last_insert_rowid();
        let bm = conn.query_row(
            "SELECT id, book, chapter, verse, module_id, created_at, note FROM bookmarks WHERE id=?1",
            params![id],
            |row| Ok(Bookmark {
                id: row.get(0)?, book: row.get(1)?, chapter: row.get(2)?,
                verse: row.get(3)?, module_id: row.get(4)?,
                created_at: row.get(5)?, note: row.get(6)?,
            }),
        )?;
        Ok(bm)
    }

    pub fn remove_bookmark(&self, id: i64) -> Result<()> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM bookmarks WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_bookmarks(&self) -> Result<Vec<Bookmark>> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, book, chapter, verse, module_id, created_at, note FROM bookmarks ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Bookmark {
                id: row.get(0)?,
                book: row.get(1)?,
                chapter: row.get(2)?,
                verse: row.get(3)?,
                module_id: row.get(4)?,
                created_at: row.get(5)?,
                note: row.get(6)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn add_note(
        &self,
        book: &str,
        chapter: u32,
        verse: Option<u32>,
        module_id: &str,
        content: &str,
    ) -> Result<Note> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO notes (book, chapter, verse, module_id, content) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![book, chapter, verse, module_id, content],
        )?;
        let id = conn.last_insert_rowid();
        let note = conn.query_row(
            "SELECT id, book, chapter, verse, module_id, content, created_at, updated_at FROM notes WHERE id=?1",
            params![id],
            row_to_note,
        )?;
        Ok(note)
    }

    pub fn update_note(&self, id: i64, content: &str) -> Result<Note> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE notes SET content=?1, updated_at=datetime('now') WHERE id=?2",
            params![content, id],
        )?;
        let note = conn.query_row(
            "SELECT id, book, chapter, verse, module_id, content, created_at, updated_at FROM notes WHERE id=?1",
            params![id],
            row_to_note,
        )?;
        Ok(note)
    }

    pub fn delete_note(&self, id: i64) -> Result<()> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM notes WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_notes(&self) -> Result<Vec<Note>> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, book, chapter, verse, module_id, content, created_at, updated_at FROM notes ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map([], row_to_note)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Full-text search across indexed verse content
    pub fn search_fts(
        &self,
        query: &str,
        options: &SearchOptions,
    ) -> Result<Vec<crate::types::SearchResult>> {
        let fts_query = build_fts_query(query);
        if fts_query.is_empty() {
            return Ok(vec![]);
        }

        let conn = self.0.lock().unwrap();
        let page = options.page.unwrap_or(0).min(10_000);
        let page_size = options.page_size.unwrap_or(100).clamp(1, 500);
        let offset = page.saturating_mul(page_size);

        // Build module filter
        let module_placeholders: String = options
            .modules
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 2))
            .collect::<Vec<_>>()
            .join(",");

        let sql = format!(
            "SELECT module_id, book, chapter, verse, snippet(verse_fts, 4, '<mark>', '</mark>', '…', 64) as text
             FROM verse_fts
             WHERE verse_fts MATCH ?1
               AND module_id IN ({module_placeholders})
             ORDER BY rank
             LIMIT {page_size} OFFSET {offset}"
        );

        let mut stmt = conn.prepare(&sql)?;
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(fts_query)];
        for m in &options.modules {
            params_vec.push(Box::new(m.clone()));
        }

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(crate::types::SearchResult {
                module_id: row.get(0)?,
                book: row.get(1)?,
                chapter: row.get(2)?,
                verse: row.get(3)?,
                text: row.get(4)?,
                highlights: vec![],
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Delete all FTS rows for a module then insert `verses` in a single transaction.
    /// `verses` is `(book, chapter, verse, plain_text)`.
    /// Much faster than calling `index_verse` in a loop — one fsync instead of N.
    pub fn replace_module_index(
        &self,
        module_id: &str,
        verses: &[(&str, u32, u32, String)],
    ) -> Result<()> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM verse_fts WHERE module_id=?1",
            params![module_id],
        )?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO verse_fts (module_id, book, chapter, verse, content) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (book, chapter, verse, text) in verses {
                stmt.execute(params![module_id, book, chapter, verse, text])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn record_installed_module(
        &self,
        id: &str,
        name: &str,
        path: &str,
        version: &str,
        category: &str,
    ) -> Result<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO installed_modules (id, name, install_path, version, category) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, install_path=excluded.install_path, version=excluded.version",
            params![id, name, path, version, category],
        )?;
        Ok(())
    }

    pub fn list_installed_module_records(
        &self,
    ) -> Result<Vec<(String, String, String, String, String, bool)>> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, install_path, version, category, index_built FROM installed_modules",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, bool>(5)?,
            ))
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Replace all strongs occurrence counts for a module in one transaction.
    /// `counts` is `(strongs_number, book, count)`.
    pub fn replace_strongs_counts(
        &self,
        module_id: &str,
        counts: &[(String, String, u32)],
    ) -> Result<()> {
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM strongs_counts WHERE module_id=?1",
            params![module_id],
        )?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO strongs_counts (module_id, strongs, book, count) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (strongs, book, count) in counts {
                stmt.execute(params![module_id, strongs, book, count])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Query total occurrences and per-book breakdown for one Strong's number.
    /// Returns `(total, Vec<BookUsage>)` sorted by count descending.
    pub fn get_strongs_counts(
        &self,
        module_id: &str,
        strongs: &str,
    ) -> Result<(u32, Vec<crate::types::BookUsage>)> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT book, count FROM strongs_counts
             WHERE module_id=?1 AND strongs=?2
             ORDER BY count DESC",
        )?;
        let rows = stmt.query_map(params![module_id, strongs], |row| {
            Ok(crate::types::BookUsage {
                book: row.get(0)?,
                count: row.get::<_, u32>(1)?,
            })
        })?;
        let by_book: Vec<crate::types::BookUsage> = rows.collect::<rusqlite::Result<_>>()?;
        let total: u32 = by_book.iter().map(|b| b.count).sum();
        Ok((total, by_book))
    }

    pub fn mark_index_built(&self, module_id: &str) -> Result<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE installed_modules SET index_built=1 WHERE id=?1",
            params![module_id],
        )?;
        Ok(())
    }
}

/// Transform a raw user query into an FTS5 MATCH expression.
///
/// Every token gets a `*` prefix wildcard so the search works letter-by-letter:
///   "god so lov"  →  "god* so* lov*"
/// With the unicode61 tokenizer this reliably matches "For God so loved …"
/// because "lov*" matches the stored token "loved", "so*" matches "so", etc.
/// The FTS5 BM25 ranking naturally surfaces the most specific matches first,
/// so complete-word queries still return better results than noisy partial ones.
fn build_fts_query(raw: &str) -> String {
    // Strip FTS5 syntax characters to avoid parse errors.
    let sanitized: String = raw
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '\'' || c.is_whitespace())
        .collect();

    let tokens: Vec<&str> = sanitized.split_whitespace().collect();
    if tokens.is_empty() {
        return String::new();
    }

    // Every token is a prefix query — works letter-by-letter at any position
    tokens
        .iter()
        .map(|t| format!("{}*", t))
        .collect::<Vec<_>>()
        .join(" ")
}

fn row_to_note(row: &rusqlite::Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        book: row.get(1)?,
        chapter: row.get(2)?,
        verse: row.get(3)?,
        module_id: row.get(4)?,
        content: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

/// All permanent (non-FTS) tables. Safe to run on every startup.
const SCHEMA_TABLES: &str = r#"
CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'light',
    font_size_reading INTEGER NOT NULL DEFAULT 18,
    show_strongs INTEGER NOT NULL DEFAULT 1,
    show_morph INTEGER NOT NULL DEFAULT 0,
    verse_display TEXT NOT NULL DEFAULT 'verse-per-line',
    default_commentary TEXT
);

CREATE TABLE IF NOT EXISTS reading_position (
    id INTEGER PRIMARY KEY DEFAULT 1,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    module_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    module_id TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER,
    module_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installed_modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    install_path TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0',
    category TEXT NOT NULL DEFAULT 'Bible',
    index_built INTEGER NOT NULL DEFAULT 0
);

-- Strong's number occurrence counts per module + book
CREATE TABLE IF NOT EXISTS strongs_counts (
    module_id TEXT NOT NULL,
    strongs   TEXT NOT NULL,
    book      TEXT NOT NULL,
    count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (module_id, strongs, book)
);
"#;

/// v3: strongs_counts were built with old OSIS parser (raw Greek word keys).
/// Clear the table and force all modules to re-index so counts get rebuilt
/// with correct G-/H-prefixed Strong's number keys.
const SCHEMA_V3_STRONGS_RESET: &str = r#"
DELETE FROM strongs_counts;
UPDATE installed_modules SET index_built = 0;
PRAGMA user_version = 3;
"#;

/// FTS migration v2: switch from 'porter ascii' to 'unicode61' so that prefix
/// queries (e.g. "lov*") work predictably — unicode61 just case-folds tokens,
/// no stemming, so "lov*" reliably matches "loved", "loves", "loveth", etc.
/// Drops the old table, recreates it, and resets index_built so every module
/// gets re-indexed on the next startup.
const SCHEMA_FTS_V2: &str = r#"
DROP TABLE IF EXISTS verse_fts;
CREATE VIRTUAL TABLE verse_fts USING fts5(
    module_id UNINDEXED,
    book UNINDEXED,
    chapter UNINDEXED,
    verse UNINDEXED,
    content,
    tokenize = 'unicode61'
);
UPDATE installed_modules SET index_built = 0;
PRAGMA user_version = 2;
"#;
