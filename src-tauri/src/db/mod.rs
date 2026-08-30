use crate::types::*;
use crate::versification::BOOK_NAMES;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

pub struct Database(Mutex<Connection>);

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

    /// Every query in this module goes through here instead of locking self.0
    /// directly. A plain `.lock().unwrap()` panics forever on every future call
    /// once poisoned — a panic in *any* one query (even one triggered by unrelated,
    /// buggy caller input) would permanently break notes, bookmarks, search,
    /// preferences, reading position, and installed-module records all at once,
    /// since they all share this one connection/mutex. Recovering the guard from
    /// a poisoned lock instead means one bad query degrades to "that query failed,"
    /// not "the entire persistence layer is dead until the app restarts." This is
    /// safe here specifically because a panic on the Rust side (e.g. an unwrap on a
    /// row conversion) doesn't leave the underlying SQLite connection itself in a
    /// corrupt state — the connection is fine, only the guard was poisoned.
    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Numbered migrations, applied in order, each in its own transaction so a
    /// failure partway through one migration can't leave the schema half-upgraded
    /// with user_version already bumped (or not bumped but tables half-created).
    /// Each entry's SQL must NOT set PRAGMA user_version itself — the runner does
    /// that after a successful commit, once, consistently.
    fn migrations() -> &'static [(i32, &'static str)] {
        &[
            (2, SCHEMA_FTS_V2),
            (3, SCHEMA_V3_STRONGS_RESET),
            (4, SCHEMA_V4_CONSOLIDATE_STORAGE),
            (5, SCHEMA_V5_STRONGS_MULTIPLE_KEYS_RESET),
            (6, SCHEMA_V6_PRESENTATION_THEMES),
            (7, SCHEMA_V7_PRESENTATION_THEME_TYPOGRAPHY),
            (8, SCHEMA_V8_PRESENTATION_THEME_REFERENCE_POSITION),
            (9, SCHEMA_V9_PRESENTATION_THEME_LAYOUT),
            (10, SCHEMA_V10_SERVICE_ITEM_PRESENTATION_OVERRIDES),
            (11, SCHEMA_V11_DEFAULT_LEXICON_SOURCE),
            (12, SCHEMA_V12_PRESENTATION_THEME_BUILTIN_FLAG),
            (13, SCHEMA_V13_WORKSPACE),
            (14, SCHEMA_V14_SPLIT_LONG_VERSES),
            (15, SCHEMA_V15_SCROLL_V_PADDING),
        ]
    }

    fn migrate(&self) -> Result<()> {
        let mut conn = self.conn();
        // Create all permanent tables first (idempotent)
        conn.execute_batch(SCHEMA_TABLES)?;

        let ver: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap_or(0);

        for (target_version, sql) in Self::migrations() {
            if ver < *target_version {
                let tx = conn.transaction()?;
                tx.execute_batch(sql)?;
                tx.execute_batch(&format!("PRAGMA user_version = {target_version};"))?;
                tx.commit()?;
            }
        }
        Ok(())
    }

    const PREFS_COLUMNS: &'static str = "theme, font_size_reading, show_strongs, show_morph, \
        verse_display, default_commentary, show_commentary, show_notes, show_cross_refs, \
        show_red_letter, font_family, text_align, margins, line_spacing, letter_spacing, \
        strongs_sheet_height, presentation_context, default_lexicon_source, workspace, \
        split_long_verses";

    fn read_preferences(conn: &Connection) -> rusqlite::Result<Option<Preferences>> {
        let result = conn.query_row(
            &format!("SELECT {} FROM preferences LIMIT 1", Self::PREFS_COLUMNS),
            [],
            |row| {
                Ok(Preferences {
                    theme: row.get(0)?,
                    font_size_reading: row.get(1)?,
                    show_strongs: row.get(2)?,
                    show_morph: row.get(3)?,
                    verse_display: row.get(4)?,
                    default_commentary: row.get(5)?,
                    show_commentary: row.get(6)?,
                    show_notes: row.get(7)?,
                    show_cross_refs: row.get(8)?,
                    show_red_letter: row.get(9)?,
                    font_family: row.get(10)?,
                    text_align: row.get(11)?,
                    margins: row.get(12)?,
                    line_spacing: row.get(13)?,
                    letter_spacing: row.get(14)?,
                    strongs_sheet_height: row.get(15)?,
                    presentation_context: row.get(16)?,
                    default_lexicon_source: row.get(17)?,
                    workspace: row.get(18)?,
                    split_long_verses: row.get::<_, i32>(19).map(|v| v != 0).unwrap_or(false),
                })
            },
        );
        match result {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    fn write_preferences(conn: &Connection, prefs: &Preferences) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO preferences (id, theme, font_size_reading, show_strongs, show_morph,
                verse_display, default_commentary, show_commentary, show_notes, show_cross_refs,
                show_red_letter, font_family, text_align, margins, line_spacing, letter_spacing,
                strongs_sheet_height, presentation_context, default_lexicon_source, workspace,
                split_long_verses)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
             ON CONFLICT(id) DO UPDATE SET
               theme=excluded.theme,
               font_size_reading=excluded.font_size_reading,
               show_strongs=excluded.show_strongs,
               show_morph=excluded.show_morph,
               verse_display=excluded.verse_display,
               default_commentary=excluded.default_commentary,
               show_commentary=excluded.show_commentary,
               show_notes=excluded.show_notes,
               show_cross_refs=excluded.show_cross_refs,
               show_red_letter=excluded.show_red_letter,
               font_family=excluded.font_family,
               text_align=excluded.text_align,
               margins=excluded.margins,
               line_spacing=excluded.line_spacing,
               letter_spacing=excluded.letter_spacing,
               strongs_sheet_height=excluded.strongs_sheet_height,
               presentation_context=excluded.presentation_context,
               default_lexicon_source=excluded.default_lexicon_source,
               workspace=excluded.workspace,
               split_long_verses=excluded.split_long_verses",
            params![
                prefs.theme,
                prefs.font_size_reading,
                prefs.show_strongs,
                prefs.show_morph,
                prefs.verse_display,
                prefs.default_commentary,
                prefs.show_commentary,
                prefs.show_notes,
                prefs.show_cross_refs,
                prefs.show_red_letter,
                prefs.font_family,
                prefs.text_align,
                prefs.margins,
                prefs.line_spacing,
                prefs.letter_spacing,
                prefs.strongs_sheet_height,
                prefs.presentation_context,
                prefs.default_lexicon_source,
                prefs.workspace,
                prefs.split_long_verses as i32,
            ],
        )?;
        Ok(())
    }

    pub fn get_preferences(&self) -> Result<Preferences> {
        let conn = self.conn();
        Ok(Self::read_preferences(&conn)?.unwrap_or_default())
    }

    /// Merges a partial JSON patch into the current preferences and writes the
    /// result back, all under one lock acquisition. This used to be two separate
    /// calls (get_preferences, then a full-replace set_preferences) made from the
    /// command layer, which meant two independent lock/unlock cycles — if two
    /// set_preferences invocations happened to interleave (Tauri can run separate
    /// sync command calls concurrently on its thread pool), the second call's
    /// read could miss the first call's write, and the first call's update would
    /// be silently lost. Holding the lock across the whole read-modify-write
    /// closes that window: the two calls now fully serialize instead of
    /// interleaving.
    pub fn update_preferences(&self, patch: &serde_json::Value) -> Result<Preferences> {
        let conn = self.conn();
        let mut current = Self::read_preferences(&conn)?.unwrap_or_default();

        if let Some(obj) = patch.as_object() {
            if let Some(v) = obj.get("theme").and_then(|v| v.as_str()) {
                current.theme = v.to_string();
            }
            if let Some(v) = obj.get("font_size_reading").and_then(|v| v.as_u64()) {
                current.font_size_reading = v as u32;
            }
            if let Some(v) = obj.get("show_strongs").and_then(|v| v.as_bool()) {
                current.show_strongs = v;
            }
            if let Some(v) = obj.get("show_morph").and_then(|v| v.as_bool()) {
                current.show_morph = v;
            }
            if let Some(v) = obj.get("verse_display").and_then(|v| v.as_str()) {
                current.verse_display = v.to_string();
            }
            if let Some(v) = obj.get("default_commentary").and_then(|v| v.as_str()) {
                current.default_commentary = Some(v.to_string());
            }
            if let Some(v) = obj.get("show_commentary").and_then(|v| v.as_bool()) {
                current.show_commentary = v;
            }
            if let Some(v) = obj.get("show_notes").and_then(|v| v.as_bool()) {
                current.show_notes = v;
            }
            if let Some(v) = obj.get("show_cross_refs").and_then(|v| v.as_bool()) {
                current.show_cross_refs = v;
            }
            if let Some(v) = obj.get("show_red_letter").and_then(|v| v.as_bool()) {
                current.show_red_letter = v;
            }
            if let Some(v) = obj.get("font_family").and_then(|v| v.as_str()) {
                current.font_family = v.to_string();
            }
            if let Some(v) = obj.get("text_align").and_then(|v| v.as_str()) {
                current.text_align = v.to_string();
            }
            if let Some(v) = obj.get("margins").and_then(|v| v.as_u64()) {
                current.margins = v as u32;
            }
            if let Some(v) = obj.get("line_spacing").and_then(|v| v.as_f64()) {
                current.line_spacing = v;
            }
            if let Some(v) = obj.get("letter_spacing").and_then(|v| v.as_f64()) {
                current.letter_spacing = v;
            }
            if let Some(v) = obj.get("strongs_sheet_height").and_then(|v| v.as_u64()) {
                current.strongs_sheet_height = v as u32;
            }
            if let Some(v) = obj.get("presentation_context").and_then(|v| v.as_u64()) {
                current.presentation_context = v as u32;
            }
            if let Some(v) = obj.get("default_lexicon_source").and_then(|v| v.as_str()) {
                current.default_lexicon_source = v.to_string();
            }
            if let Some(v) = obj.get("workspace").and_then(|v| v.as_str()) {
                current.workspace = v.to_string();
            }
            if let Some(v) = obj.get("split_long_verses").and_then(|v| v.as_bool()) {
                current.split_long_verses = v;
            }
        }

        Self::write_preferences(&conn, &current)?;
        Ok(current)
    }

    pub fn get_reading_position(&self) -> Result<Option<ReadingPosition>> {
        let conn = self.conn();
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
        let conn = self.conn();
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
        let conn = self.conn();
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
        let conn = self.conn();
        conn.execute("DELETE FROM bookmarks WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_bookmarks(&self) -> Result<Vec<Bookmark>> {
        let conn = self.conn();
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
        let conn = self.conn();
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
        let conn = self.conn();
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
        let conn = self.conn();
        conn.execute("DELETE FROM notes WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_notes(&self) -> Result<Vec<Note>> {
        let conn = self.conn();
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

        let conn = self.conn();
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

        // Resolve which books to restrict to, if any.
        // Explicit book_filter takes priority; testament is a shorthand for the full list.
        let effective_books: Option<Vec<String>> =
            if let Some(ref bf) = options.book_filter {
                if bf.is_empty() { None } else { Some(bf.clone()) }
            } else {
                match options.testament.as_deref() {
                    Some("OT") => Some(BOOK_NAMES[..39].iter().map(|s| s.to_string()).collect()),
                    Some("NT") => Some(BOOK_NAMES[39..].iter().map(|s| s.to_string()).collect()),
                    _ => None,
                }
            };

        let book_clause = if let Some(ref books) = effective_books {
            let base = options.modules.len() + 2; // ?1=query, ?2..?{n+1}=modules
            let placeholders: String = (0..books.len())
                .map(|i| format!("?{}", base + i))
                .collect::<Vec<_>>()
                .join(",");
            format!("AND book IN ({placeholders})")
        } else {
            String::new()
        };

        let sql = format!(
            "SELECT module_id, book, chapter, verse, snippet(verse_fts, 4, '<mark>', '</mark>', '…', 64) as text
             FROM verse_fts
             WHERE verse_fts MATCH ?1
               AND module_id IN ({module_placeholders})
               {book_clause}
             ORDER BY rank
             LIMIT {page_size} OFFSET {offset}"
        );

        let mut stmt = conn.prepare(&sql)?;
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(fts_query)];
        for m in &options.modules {
            params_vec.push(Box::new(m.clone()));
        }
        if let Some(ref books) = effective_books {
            for b in books {
                params_vec.push(Box::new(b.clone()));
            }
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
        let mut conn = self.conn();
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
        let conn = self.conn();
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
        let conn = self.conn();
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
        let mut conn = self.conn();
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
        let conn = self.conn();
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
        let conn = self.conn();
        conn.execute(
            "UPDATE installed_modules SET index_built=1 WHERE id=?1",
            params![module_id],
        )?;
        Ok(())
    }

    // ── Presentation themes ────────────────────────────────────────────────

    pub fn list_presentation_themes(&self) -> Result<Vec<PresentationTheme>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, background_color, background_gradient, text_color, reference_color,
                    font_family, text_align, font_scale, text_font_weight, reference_font_scale,
                    reference_font_weight, safe_margin, text_shadow, reference_position,
                    verse_box_x, verse_box_y, verse_box_width, verse_box_height,
                    reference_box_x, reference_box_y, reference_box_width, reference_box_height,
                    auto_layout, min_font_scale, transition_type, transition_duration,
                    scroll_v_padding, is_default, is_builtin, created_at, updated_at
             FROM presentation_themes
             ORDER BY is_default DESC, name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], presentation_theme_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn create_presentation_theme(
        &self,
        input: &PresentationThemeInput,
    ) -> Result<PresentationTheme> {
        let conn = self.conn();
        let id = format!("theme-{}", now_millis());
        conn.execute(
            "INSERT INTO presentation_themes (
                id, name, background_color, background_gradient, text_color, reference_color,
                font_family, text_align, font_scale, text_font_weight, reference_font_scale,
                reference_font_weight, safe_margin, text_shadow, reference_position,
                verse_box_x, verse_box_y, verse_box_width, verse_box_height,
                reference_box_x, reference_box_y, reference_box_width, reference_box_height,
                auto_layout, min_font_scale, transition_type, transition_duration,
                scroll_v_padding
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28)",
            params![
                id, input.name, input.background_color, input.background_gradient,
                input.text_color, input.reference_color, input.font_family, input.text_align,
                input.font_scale.clamp(0.5, 2.0), input.text_font_weight.clamp(100, 900),
                input.reference_font_scale.clamp(0.5, 2.0), input.reference_font_weight.clamp(100, 900),
                input.safe_margin.min(25), input.text_shadow, input.reference_position,
                input.verse_box_x.clamp(0.0, 90.0), input.verse_box_y.clamp(0.0, 90.0),
                input.verse_box_width.clamp(10.0, 100.0), input.verse_box_height.clamp(8.0, 100.0),
                input.reference_box_x.clamp(0.0, 90.0), input.reference_box_y.clamp(0.0, 90.0),
                input.reference_box_width.clamp(10.0, 100.0), input.reference_box_height.clamp(5.0, 100.0),
                input.auto_layout, input.min_font_scale.clamp(0.5, 1.0),
                input.transition_type, input.transition_duration.clamp(0, 2_000),
                input.scroll_v_padding.min(50),
            ],
        )?;
        self.presentation_theme_by_id(&conn, &id)
    }

    pub fn update_presentation_theme(
        &self,
        id: &str,
        input: &PresentationThemeInput,
    ) -> Result<PresentationTheme> {
        let conn = self.conn();
        let changed = conn.execute(
            "UPDATE presentation_themes SET
                name=?2, background_color=?3, background_gradient=?4, text_color=?5,
                reference_color=?6, font_family=?7, text_align=?8, font_scale=?9,
                text_font_weight=?10, reference_font_scale=?11, reference_font_weight=?12,
                safe_margin=?13, text_shadow=?14, reference_position=?15,
                verse_box_x=?16, verse_box_y=?17, verse_box_width=?18, verse_box_height=?19,
                reference_box_x=?20, reference_box_y=?21, reference_box_width=?22, reference_box_height=?23,
                auto_layout=?24, min_font_scale=?25, transition_type=?26, transition_duration=?27,
                scroll_v_padding=?28, updated_at=datetime('now')
             WHERE id=?1",
            params![
                id, input.name, input.background_color, input.background_gradient,
                input.text_color, input.reference_color, input.font_family, input.text_align,
                input.font_scale.clamp(0.5, 2.0), input.text_font_weight.clamp(100, 900),
                input.reference_font_scale.clamp(0.5, 2.0), input.reference_font_weight.clamp(100, 900),
                input.safe_margin.min(25), input.text_shadow, input.reference_position,
                input.verse_box_x.clamp(0.0, 90.0), input.verse_box_y.clamp(0.0, 90.0),
                input.verse_box_width.clamp(10.0, 100.0), input.verse_box_height.clamp(8.0, 100.0),
                input.reference_box_x.clamp(0.0, 90.0), input.reference_box_y.clamp(0.0, 90.0),
                input.reference_box_width.clamp(10.0, 100.0), input.reference_box_height.clamp(5.0, 100.0),
                input.auto_layout, input.min_font_scale.clamp(0.5, 1.0),
                input.transition_type, input.transition_duration.clamp(0, 2_000),
                input.scroll_v_padding.min(50),
            ],
        )?;
        if changed == 0 {
            return Err(AppError::Other(format!(
                "presentation theme not found: {id}"
            )));
        }
        self.presentation_theme_by_id(&conn, id)
    }

    /// Only the seeded Midnight theme (`is_builtin`) is protected from
    /// deletion — every user-created theme stays personal and deletable no
    /// matter what, including one that's currently the active/default
    /// theme (previously `is_default` alone blocked deletion, so picking
    /// "Make default" for your own theme made it act like a global,
    /// permanent one instead of staying yours to remove).
    pub fn delete_presentation_theme(&self, id: &str) -> Result<()> {
        let mut conn = self.conn();
        let is_builtin: Option<bool> = conn
            .query_row(
                "SELECT is_builtin FROM presentation_themes WHERE id=?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?;
        match is_builtin {
            None => {
                return Err(AppError::Other(format!(
                    "presentation theme not found: {id}"
                )));
            }
            Some(true) => {
                return Err(AppError::Other(
                    "the built-in Midnight theme cannot be deleted".into(),
                ));
            }
            Some(false) => {}
        }

        let tx = conn.transaction()?;
        tx.execute("DELETE FROM presentation_themes WHERE id=?1", params![id])?;
        // Deleting the currently-active theme would otherwise leave no row
        // with is_default=1 — every other reader (list_presentation_themes'
        // ordering, the frontend's activePresentationTheme hydration)
        // assumes there's always exactly one, so fall back to the one
        // theme guaranteed to still exist: the built-in.
        tx.execute(
            "UPDATE presentation_themes SET is_default=1
             WHERE is_builtin=1
               AND NOT EXISTS (SELECT 1 FROM presentation_themes WHERE is_default=1)",
            [],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn set_default_presentation_theme(&self, id: &str) -> Result<PresentationTheme> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute("UPDATE presentation_themes SET is_default=0", [])?;
        if tx.execute(
            "UPDATE presentation_themes SET is_default=1, updated_at=datetime('now') WHERE id=?1",
            params![id],
        )? == 0
        {
            return Err(AppError::Other(format!(
                "presentation theme not found: {id}"
            )));
        }
        tx.commit()?;
        self.presentation_theme_by_id(&conn, id)
    }

    fn presentation_theme_by_id(&self, conn: &Connection, id: &str) -> Result<PresentationTheme> {
        conn.query_row(
            "SELECT id, name, background_color, background_gradient, text_color, reference_color,
                    font_family, text_align, font_scale, text_font_weight, reference_font_scale,
                    reference_font_weight, safe_margin, text_shadow, reference_position,
                    verse_box_x, verse_box_y, verse_box_width, verse_box_height,
                    reference_box_x, reference_box_y, reference_box_width, reference_box_height,
                    auto_layout, min_font_scale, transition_type, transition_duration,
                    scroll_v_padding, is_default, is_builtin, created_at, updated_at
             FROM presentation_themes WHERE id=?1",
            params![id],
            presentation_theme_from_row,
        )
        .map_err(Into::into)
    }

    // ── Search history ───────────────────────────────────────────────────────

    pub fn list_search_history(&self) -> Result<Vec<SearchHistoryEntry>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, query, timestamp, ref_book, ref_chapter, ref_verse
             FROM search_history ORDER BY timestamp DESC, id DESC LIMIT 100",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SearchHistoryEntry {
                id: row.get(0)?,
                query: row.get(1)?,
                timestamp: row.get(2)?,
                ref_book: row.get(3)?,
                ref_chapter: row.get(4)?,
                ref_verse: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Adds an entry, de-duplicating by query text (matching the old localStorage
    /// behavior: re-searching something already in history moves it to the top
    /// instead of creating a second row) and capping total history at 100 rows.
    pub fn add_search_history_entry(&self, query: &str) -> Result<()> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM search_history WHERE query = ?1",
            params![trimmed],
        )?;
        tx.execute(
            "INSERT INTO search_history (query, timestamp) VALUES (?1, ?2)",
            params![trimmed, now_millis()],
        )?;
        // Trim anything beyond the most recent 100 — same cap the old
        // localStorage implementation enforced.
        tx.execute(
            "DELETE FROM search_history WHERE id NOT IN (
                SELECT id FROM search_history ORDER BY timestamp DESC, id DESC LIMIT 100
             )",
            [],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Attaches the verse the user navigated to onto the most recent search
    /// history entry (mirrors setLastHistoryRef's old localStorage behavior).
    pub fn set_last_search_history_ref(&self, book: &str, chapter: u32, verse: u32) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "UPDATE search_history SET ref_book = ?1, ref_chapter = ?2, ref_verse = ?3
             WHERE id = (SELECT id FROM search_history ORDER BY timestamp DESC, id DESC LIMIT 1)",
            params![book, chapter, verse],
        )?;
        Ok(())
    }

    pub fn clear_search_history(&self) -> Result<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM search_history", [])?;
        Ok(())
    }

    // ── Service order ────────────────────────────────────────────────────────

    pub fn list_service_order(&self) -> Result<Vec<ServiceOrderItem>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, book, chapter, verse, text, module, presentation_override
             FROM service_order_items ORDER BY position ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            let override_json: Option<String> = row.get(6)?;
            let presentation_override = override_json
                .map(|json| serde_json::from_str(&json))
                .transpose()
                .map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        6,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
            Ok(ServiceOrderItem {
                id: row.get(0)?,
                book: row.get(1)?,
                chapter: row.get(2)?,
                verse: row.get(3)?,
                text: row.get(4)?,
                module: row.get(5)?,
                presentation_override,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Replaces the entire ordered list in one transaction. The frontend already
    /// treats the service order as one unit it reads/reorders/writes back as a
    /// whole (add/remove/reorder are all local array operations before persisting),
    /// so this matches that shape rather than exposing narrower per-row commands.
    pub fn set_service_order(&self, items: &[ServiceOrderItem]) -> Result<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM service_order_items", [])?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO service_order_items (id, book, chapter, verse, text, module, presentation_override, position)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            for (position, item) in items.iter().enumerate() {
                stmt.execute(params![
                    item.id,
                    item.book,
                    item.chapter,
                    item.verse,
                    item.text,
                    item.module,
                    item.presentation_override
                        .as_ref()
                        .map(serde_json::to_string)
                        .transpose()
                        .map_err(|error| AppError::Other(error.to_string()))?,
                    position as i64,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    // ── app_meta / one-time legacy localStorage import ─────────────────────────

    fn meta_get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
        conn.query_row(
            "SELECT value FROM app_meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
    }

    const LEGACY_IMPORT_MARKER: &'static str = "legacy_localstorage_imported";

    pub fn legacy_import_done(&self) -> Result<bool> {
        let conn = self.conn();
        Ok(Self::meta_get(&conn, Self::LEGACY_IMPORT_MARKER)?.is_some())
    }

    /// One-time import of the four payloads that used to live in browser
    /// localStorage (search history, service order, display prefs, study-panel
    /// visibility). Idempotent: if the marker is already set, this is a no-op
    /// that returns Ok immediately without touching any data, so the frontend
    /// can call it unconditionally on startup without checking first itself —
    /// and, more importantly, so a retry after a partial failure (app killed
    /// mid-import) can't double-import or clobber data written since. Everything
    /// — the search history rows, the service order rows, the merged
    /// preferences, and the marker itself — commits in one transaction: either
    /// the whole import lands, or none of it does.
    pub fn import_legacy_local_storage(&self, payload: &LegacyLocalStorageImport) -> Result<()> {
        let mut conn = self.conn();

        if Self::meta_get(&conn, Self::LEGACY_IMPORT_MARKER)?.is_some() {
            return Ok(());
        }

        let tx = conn.transaction()?;

        for entry in &payload.search_history {
            let (ref_book, ref_chapter, ref_verse) = match &entry.selected_ref {
                Some(r) => (Some(r.book.clone()), Some(r.chapter), Some(r.verse)),
                None => (None, None, None),
            };
            tx.execute(
                "INSERT INTO search_history (query, timestamp, ref_book, ref_chapter, ref_verse)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    entry.query,
                    entry.timestamp,
                    ref_book,
                    ref_chapter,
                    ref_verse
                ],
            )?;
        }

        for (position, item) in payload.service_order.iter().enumerate() {
            tx.execute(
                "INSERT OR IGNORE INTO service_order_items
                    (id, book, chapter, verse, text, module, position)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    item.id,
                    item.book,
                    item.chapter,
                    item.verse,
                    item.text,
                    item.module,
                    position as i64,
                ],
            )?;
        }

        if payload.display_prefs.is_some() || payload.study_ui.is_some() {
            let mut current = Self::read_preferences(&tx)?.unwrap_or_default();
            if let Some(dp) = &payload.display_prefs {
                current.font_family = dp.font_family.clone();
                current.text_align = dp.text_align.clone();
                current.margins = dp.margins;
                current.line_spacing = dp.line_spacing;
                current.letter_spacing = dp.letter_spacing;
                current.strongs_sheet_height = dp.strongs_sheet_height;
                current.presentation_context = dp.presentation_context;
            }
            if let Some(su) = &payload.study_ui {
                current.show_commentary = su.show_commentary;
                current.show_notes = su.show_notes;
                current.show_cross_refs = su.show_cross_refs;
                current.show_red_letter = su.show_red_letter;
            }
            Self::write_preferences(&tx, &current)?;
        }

        tx.execute(
            "INSERT INTO app_meta (key, value) VALUES (?1, '1')",
            params![Self::LEGACY_IMPORT_MARKER],
        )?;

        tx.commit()?;
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

CREATE TABLE IF NOT EXISTS presentation_themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    background_color TEXT NOT NULL DEFAULT '#000000',
    background_gradient TEXT,
    text_color TEXT NOT NULL DEFAULT '#ffffff',
    reference_color TEXT NOT NULL DEFAULT '#b8c4d8',
    font_family TEXT NOT NULL DEFAULT 'system',
    text_align TEXT NOT NULL DEFAULT 'center',
    font_scale REAL NOT NULL DEFAULT 1,
    safe_margin INTEGER NOT NULL DEFAULT 5,
    text_shadow INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

/// v3: strongs_counts were built with old OSIS parser (raw Greek word keys).
/// Clear the table and force all modules to re-index so counts get rebuilt
/// with correct G-/H-prefixed Strong's number keys.
const SCHEMA_V3_STRONGS_RESET: &str = r#"
DELETE FROM strongs_counts;
UPDATE installed_modules SET index_built = 0;
"#;

/// v5: KJV OSIS phrases can contain more than one Strong's number. Earlier
/// indexes kept only the first, which both hid valid concordance entries and
/// made their per-book usage counts incomplete. Rebuild all module indexes.
const SCHEMA_V5_STRONGS_MULTIPLE_KEYS_RESET: &str = r#"
DELETE FROM strongs_counts;
UPDATE installed_modules SET index_built = 0;
"#;

/// v6: reusable presentation themes replace one-off presentation styling.
const SCHEMA_V6_PRESENTATION_THEMES: &str = r#"
CREATE TABLE IF NOT EXISTS presentation_themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    background_color TEXT NOT NULL DEFAULT '#000000',
    background_gradient TEXT,
    text_color TEXT NOT NULL DEFAULT '#ffffff',
    reference_color TEXT NOT NULL DEFAULT '#b8c4d8',
    font_family TEXT NOT NULL DEFAULT 'system',
    text_align TEXT NOT NULL DEFAULT 'center',
    font_scale REAL NOT NULL DEFAULT 1,
    safe_margin INTEGER NOT NULL DEFAULT 5,
    text_shadow INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO presentation_themes (
    id, name, background_color, background_gradient, text_color, reference_color,
    font_family, text_align, font_scale, safe_margin, text_shadow, is_default
) VALUES (
    'builtin-midnight', 'Midnight Scripture', '#000000',
    'linear-gradient(145deg, #07111e 0%, #000000 55%, #102a25 100%)',
    '#ffffff', '#b8c4d8', 'system', 'center', 1, 5, 1, 1
);
"#;

/// v7: verse and reference labels have independently editable typography.
const SCHEMA_V7_PRESENTATION_THEME_TYPOGRAPHY: &str = r#"
ALTER TABLE presentation_themes ADD COLUMN text_font_weight INTEGER NOT NULL DEFAULT 600;
ALTER TABLE presentation_themes ADD COLUMN reference_font_scale REAL NOT NULL DEFAULT 1;
ALTER TABLE presentation_themes ADD COLUMN reference_font_weight INTEGER NOT NULL DEFAULT 500;
"#;

/// v8: reference labels can be positioned around the verse block.
const SCHEMA_V8_PRESENTATION_THEME_REFERENCE_POSITION: &str = r#"
ALTER TABLE presentation_themes ADD COLUMN reference_position TEXT NOT NULL DEFAULT 'bottom-center';
"#;

/// v9: flexible output boxes, automatic fitting, and change transitions.
const SCHEMA_V9_PRESENTATION_THEME_LAYOUT: &str = r#"
ALTER TABLE presentation_themes ADD COLUMN verse_box_x REAL NOT NULL DEFAULT 10;
ALTER TABLE presentation_themes ADD COLUMN verse_box_y REAL NOT NULL DEFAULT 24;
ALTER TABLE presentation_themes ADD COLUMN verse_box_width REAL NOT NULL DEFAULT 80;
ALTER TABLE presentation_themes ADD COLUMN verse_box_height REAL NOT NULL DEFAULT 48;
ALTER TABLE presentation_themes ADD COLUMN reference_box_x REAL NOT NULL DEFAULT 10;
ALTER TABLE presentation_themes ADD COLUMN reference_box_y REAL NOT NULL DEFAULT 76;
ALTER TABLE presentation_themes ADD COLUMN reference_box_width REAL NOT NULL DEFAULT 80;
ALTER TABLE presentation_themes ADD COLUMN reference_box_height REAL NOT NULL DEFAULT 10;
ALTER TABLE presentation_themes ADD COLUMN auto_layout INTEGER NOT NULL DEFAULT 1;
ALTER TABLE presentation_themes ADD COLUMN min_font_scale REAL NOT NULL DEFAULT 0.65;
ALTER TABLE presentation_themes ADD COLUMN transition_type TEXT NOT NULL DEFAULT 'fade';
ALTER TABLE presentation_themes ADD COLUMN transition_duration INTEGER NOT NULL DEFAULT 300;
"#;

/// v10: individual service items can inherit a theme and override only the
/// properties they need (stored as sparse JSON for forward compatibility).
const SCHEMA_V10_SERVICE_ITEM_PRESENTATION_OVERRIDES: &str = r#"
ALTER TABLE service_order_items ADD COLUMN presentation_override TEXT;
"#;

/// v11: which lexicon source the Strong's sheet opens to by default — "ours"
/// (bundled bare Strong's), "rich" (BDB/Abbott-Smith), or "lsj" (full LSJ,
/// Greek only — falls back to "rich" for Hebrew words). The sheet's pill
/// switcher can still override per-lookup regardless of this default.
const SCHEMA_V11_DEFAULT_LEXICON_SOURCE: &str = r#"
ALTER TABLE preferences ADD COLUMN default_lexicon_source TEXT NOT NULL DEFAULT 'ours';
"#;

/// v12: separates "is this theme currently applied?" from "is this theme
/// the app's permanent built-in one?" — previously `is_default` alone
/// gated delete-protection, so a personal theme temporarily became
/// undeletable the moment a user picked "Make default" for it, which read
/// as their own theme going "global" instead of staying personal. Only
/// the seeded Midnight theme should ever be un-deletable.
const SCHEMA_V12_PRESENTATION_THEME_BUILTIN_FLAG: &str = r#"
ALTER TABLE presentation_themes ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0;
UPDATE presentation_themes SET is_builtin = 1 WHERE id = 'builtin-midnight';
"#;

/// v13: which persona the app is set up for — "study" is the e-Sword-style
/// Bible study experience alone (reading, lexicons, commentary, notes);
/// "presentation" adds the EasyWorship-style live-show tools on top
/// (service queue, Live Show console, presentation themes). Study mode
/// genuinely doesn't expose presentation features, not just deprioritizes
/// them — see the frontend's workspace-gated UI (SideNav, ReadingView,
/// TopBar, useReadingShortcuts) for where that's enforced.
const SCHEMA_V13_WORKSPACE: &str = r#"
ALTER TABLE preferences ADD COLUMN workspace TEXT NOT NULL DEFAULT 'study';
"#;

/// v14: operator-side verse splitting — long verses can be broken into
/// labelled parts (a, b, c…) so each part fits the presentation screen
/// at the configured font size without excessive auto-shrinking.
const SCHEMA_V14_SPLIT_LONG_VERSES: &str = r#"
ALTER TABLE preferences ADD COLUMN split_long_verses INTEGER NOT NULL DEFAULT 0;
"#;

const SCHEMA_V15_SCROLL_V_PADDING: &str = r#"
ALTER TABLE presentation_themes ADD COLUMN scroll_v_padding INTEGER NOT NULL DEFAULT 32;
"#;

fn presentation_theme_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PresentationTheme> {
    Ok(PresentationTheme {
        id: row.get(0)?,
        name: row.get(1)?,
        background_color: row.get(2)?,
        background_gradient: row.get(3)?,
        text_color: row.get(4)?,
        reference_color: row.get(5)?,
        font_family: row.get(6)?,
        text_align: row.get(7)?,
        font_scale: row.get(8)?,
        text_font_weight: row.get(9)?,
        reference_font_scale: row.get(10)?,
        reference_font_weight: row.get(11)?,
        safe_margin: row.get(12)?,
        text_shadow: row.get(13)?,
        reference_position: row.get(14)?,
        verse_box_x: row.get(15)?,
        verse_box_y: row.get(16)?,
        verse_box_width: row.get(17)?,
        verse_box_height: row.get(18)?,
        reference_box_x: row.get(19)?,
        reference_box_y: row.get(20)?,
        reference_box_width: row.get(21)?,
        reference_box_height: row.get(22)?,
        auto_layout: row.get(23)?,
        min_font_scale: row.get(24)?,
        transition_type: row.get(25)?,
        transition_duration: row.get(26)?,
        scroll_v_padding: row.get::<_, Option<u32>>(27)?.unwrap_or(32),
        is_default: row.get(28)?,
        is_builtin: row.get(29)?,
        created_at: row.get(30)?,
        updated_at: row.get(31)?,
    })
}

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
"#;

/// v4: consolidates browser localStorage into SQLite so the app has one
/// persistence contract instead of two. Adds the study-panel-visibility and
/// display/typography columns preferences was missing, plus tables for search
/// history and the service order — both used to live only in localStorage,
/// with no migrations, validation, or transactional writes, and silently
/// swallowed errors on quota/write failure. app_meta is a general-purpose
/// key/value table; its first use is the one-time-import marker (see
/// Database::import_legacy_local_storage) — that marker is data, not a schema
/// version, so it doesn't belong in PRAGMA user_version.
const SCHEMA_V4_CONSOLIDATE_STORAGE: &str = r#"
ALTER TABLE preferences ADD COLUMN show_commentary INTEGER NOT NULL DEFAULT 1;
ALTER TABLE preferences ADD COLUMN show_notes INTEGER NOT NULL DEFAULT 1;
ALTER TABLE preferences ADD COLUMN show_cross_refs INTEGER NOT NULL DEFAULT 1;
ALTER TABLE preferences ADD COLUMN show_red_letter INTEGER NOT NULL DEFAULT 1;
ALTER TABLE preferences ADD COLUMN font_family TEXT NOT NULL DEFAULT 'system';
ALTER TABLE preferences ADD COLUMN text_align TEXT NOT NULL DEFAULT 'left';
ALTER TABLE preferences ADD COLUMN margins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE preferences ADD COLUMN line_spacing REAL NOT NULL DEFAULT 0.6;
ALTER TABLE preferences ADD COLUMN letter_spacing REAL NOT NULL DEFAULT 0;
ALTER TABLE preferences ADD COLUMN strongs_sheet_height INTEGER NOT NULL DEFAULT 360;
ALTER TABLE preferences ADD COLUMN presentation_context INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    ref_book TEXT,
    ref_chapter INTEGER,
    ref_verse INTEGER
);

CREATE TABLE IF NOT EXISTS service_order_items (
    id TEXT PRIMARY KEY,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    text TEXT NOT NULL,
    module TEXT NOT NULL,
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        LegacyDisplayPrefs, LegacyLocalStorageImport, LegacySearchHistoryEntry, LegacyStudyUi,
        LegacyVerseRef, Preferences, ReadingPosition, ServiceOrderItem,
    };

    /// Each test gets its own on-disk file — WAL mode needs a real file, not
    /// `:memory:`, and a unique name per test avoids cross-test interference
    /// when tests run in parallel (the default for `cargo test`).
    fn temp_db(name: &str) -> (Database, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!(
            "scriptura-test-db-{name}-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("open temp db");
        (db, path)
    }

    fn cleanup(path: &std::path::Path) {
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(path.with_extension("db-wal"));
        let _ = std::fs::remove_file(path.with_extension("db-shm"));
    }

    #[test]
    fn preferences_round_trip_and_defaults() {
        let (db, path) = temp_db("prefs");

        // No row yet — falls back to Preferences::default() rather than erroring.
        let defaults = db.get_preferences().unwrap();
        assert_eq!(defaults.theme, Preferences::default().theme);

        db.update_preferences(&serde_json::json!({
            "theme": "dark",
            "font_size_reading": 22,
            "show_strongs": false,
        }))
        .unwrap();

        let loaded = db.get_preferences().unwrap();
        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.font_size_reading, 22);
        assert!(!loaded.show_strongs);

        // A second, disjoint patch shouldn't clobber fields the first patch set —
        // this is exactly the read-modify-write correctness update_preferences
        // replaced the old two-call get/set_preferences pattern to guarantee.
        db.update_preferences(&serde_json::json!({ "show_morph": true }))
            .unwrap();
        let loaded2 = db.get_preferences().unwrap();
        assert_eq!(loaded2.theme, "dark");
        assert_eq!(loaded2.font_size_reading, 22);
        assert!(loaded2.show_morph);

        cleanup(&path);
    }

    #[test]
    fn presentation_themes_have_a_default_and_support_crud() {
        let (db, path) = temp_db("presentation-themes");
        let initial = db.list_presentation_themes().unwrap();
        assert_eq!(initial.iter().filter(|theme| theme.is_default).count(), 1);

        let input = PresentationThemeInput {
            name: "Lower third".into(),
            background_color: "#102030".into(),
            background_gradient: None,
            text_color: "#ffffff".into(),
            reference_color: "#aabbcc".into(),
            font_family: "serif".into(),
            text_align: "left".into(),
            font_scale: 1.15,
            text_font_weight: 700,
            reference_font_scale: 1.1,
            reference_font_weight: 600,
            safe_margin: 8,
            text_shadow: true,
            reference_position: "bottom-left".into(),
            verse_box_x: 12.0,
            verse_box_y: 20.0,
            verse_box_width: 76.0,
            verse_box_height: 50.0,
            reference_box_x: 12.0,
            reference_box_y: 74.0,
            reference_box_width: 76.0,
            reference_box_height: 10.0,
            auto_layout: true,
            min_font_scale: 0.7,
            transition_type: "slide".into(),
            transition_duration: 450,
            scroll_v_padding: 32,
        };
        let created = db.create_presentation_theme(&input).unwrap();
        assert_eq!(created.name, "Lower third");
        assert_eq!(created.transition_type, "slide");
        assert_eq!(created.verse_box_width, 76.0);

        let defaulted = db.set_default_presentation_theme(&created.id).unwrap();
        assert!(defaulted.is_default);
        assert!(!defaulted.is_builtin);

        let updated = db
            .update_presentation_theme(
                &created.id,
                &PresentationThemeInput {
                    name: "Sermon lower third".into(),
                    ..input
                },
            )
            .unwrap();
        assert_eq!(updated.name, "Sermon lower third");

        // Being the currently-active theme does not protect it from
        // deletion — only the built-in Midnight theme is permanent. A
        // personal theme stays personal (deletable) even while active.
        assert!(db.delete_presentation_theme(&created.id).is_ok());

        cleanup(&path);
    }

    #[test]
    fn deleting_the_active_personal_theme_falls_back_default_to_midnight() {
        let (db, path) = temp_db("presentation-theme-active-delete");
        let input = PresentationThemeInput {
            name: "On-screen".into(),
            background_color: "#102030".into(),
            background_gradient: None,
            text_color: "#ffffff".into(),
            reference_color: "#aabbcc".into(),
            font_family: "serif".into(),
            text_align: "left".into(),
            font_scale: 1.0,
            text_font_weight: 700,
            reference_font_scale: 1.0,
            reference_font_weight: 600,
            safe_margin: 8,
            text_shadow: true,
            reference_position: "bottom-left".into(),
            verse_box_x: 12.0,
            verse_box_y: 20.0,
            verse_box_width: 76.0,
            verse_box_height: 50.0,
            reference_box_x: 12.0,
            reference_box_y: 74.0,
            reference_box_width: 76.0,
            reference_box_height: 10.0,
            auto_layout: true,
            min_font_scale: 0.7,
            transition_type: "slide".into(),
            transition_duration: 450,
            scroll_v_padding: 32,
        };
        let created = db.create_presentation_theme(&input).unwrap();
        db.set_default_presentation_theme(&created.id).unwrap();

        db.delete_presentation_theme(&created.id).unwrap();

        // Midnight (the only theme left, and the only is_builtin one) must
        // have picked up is_default again — every reader (this list's own
        // ordering, the frontend's activePresentationTheme hydration)
        // assumes there's always exactly one default theme.
        let remaining = db.list_presentation_themes().unwrap();
        assert_eq!(remaining.len(), 1);
        assert!(remaining[0].is_builtin);
        assert!(remaining[0].is_default);

        // The built-in theme itself is still permanent.
        assert!(db.delete_presentation_theme(&remaining[0].id).is_err());

        cleanup(&path);
    }

    #[test]
    fn deleting_a_non_default_presentation_theme_actually_removes_it() {
        // The CRUD test above only ever exercises delete against the DEFAULT
        // theme (expected to fail) — it never confirms the success path
        // actually removes a row. This is that missing coverage, reported by
        // a user as "I can't delete created themes."
        let (db, path) = temp_db("presentation-theme-delete");
        let before = db.list_presentation_themes().unwrap();
        assert_eq!(before.len(), 1); // just the seeded default

        let input = PresentationThemeInput {
            name: "Custom theme".into(),
            background_color: "#102030".into(),
            background_gradient: None,
            text_color: "#ffffff".into(),
            reference_color: "#aabbcc".into(),
            font_family: "serif".into(),
            text_align: "left".into(),
            font_scale: 1.0,
            text_font_weight: 700,
            reference_font_scale: 1.0,
            reference_font_weight: 600,
            safe_margin: 8,
            text_shadow: true,
            reference_position: "bottom-left".into(),
            verse_box_x: 12.0,
            verse_box_y: 20.0,
            verse_box_width: 76.0,
            verse_box_height: 50.0,
            reference_box_x: 12.0,
            reference_box_y: 74.0,
            reference_box_width: 76.0,
            reference_box_height: 10.0,
            auto_layout: true,
            min_font_scale: 0.7,
            transition_type: "slide".into(),
            transition_duration: 450,
            scroll_v_padding: 32,
        };
        let created = db.create_presentation_theme(&input).unwrap();
        assert!(!created.is_default);

        db.delete_presentation_theme(&created.id).unwrap();

        let after = db.list_presentation_themes().unwrap();
        assert_eq!(after.len(), 1, "the created theme should be gone");
        assert!(after.iter().all(|t| t.id != created.id));

        // Deleting an id that no longer exists (already gone, or never
        // existed) must be a real error, not a silent success — otherwise
        // the frontend's catch-and-report-errors path never fires and a
        // failed delete looks indistinguishable from a successful one.
        assert!(db.delete_presentation_theme(&created.id).is_err());
        assert!(db
            .delete_presentation_theme("theme-does-not-exist")
            .is_err());

        cleanup(&path);
    }

    /// Simulates a real device upgrading from a pre-v4 install: builds a database
    /// by hand at exactly the v3 schema (the old preferences columns only, no
    /// search_history/service_order_items/app_meta, user_version=3), writes a
    /// preferences row through that old schema, then opens it through the real
    /// Database::open — the same path a genuine upgrade takes — and confirms the
    /// v4 migration both adds the new columns/tables AND preserves the existing
    /// row's data rather than wiping it via a naive drop-and-recreate.
    #[test]
    fn v4_migration_preserves_existing_data_on_upgrade() {
        let path = std::env::temp_dir().join(format!(
            "scriptura-test-db-v3-upgrade-{}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);

        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(SCHEMA_TABLES).unwrap();
            conn.execute_batch(SCHEMA_FTS_V2).unwrap();
            conn.execute_batch(SCHEMA_V3_STRONGS_RESET).unwrap();
            conn.execute(
                "INSERT INTO preferences (id, theme, font_size_reading, show_strongs, show_morph, verse_display)
                 VALUES (1, 'dark', 24, 1, 0, 'paragraph')",
                [],
            )
            .unwrap();
            conn.execute_batch("PRAGMA user_version = 3;").unwrap();
        }

        // Opening through the real constructor runs the real migrate().
        let db = Database::open(&path).expect("should migrate v3 -> v4 cleanly");

        let prefs = db.get_preferences().unwrap();
        // Pre-existing data survived the migration...
        assert_eq!(prefs.theme, "dark");
        assert_eq!(prefs.font_size_reading, 24);
        assert_eq!(prefs.verse_display, "paragraph");
        // ...and the new v4 columns are present with their defaults, not NULL/error.
        assert!(prefs.show_commentary);
        assert_eq!(prefs.font_family, "system");
        assert_eq!(prefs.strongs_sheet_height, 360);

        // New tables exist and are queryable (would error if the CREATE TABLE
        // portion of the migration hadn't run).
        assert_eq!(db.list_search_history().unwrap().len(), 0);
        assert_eq!(db.list_service_order().unwrap().len(), 0);

        let conn = db.conn();
        let ver: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        // Migrating from v3 should land on whatever the latest migration is,
        // not a version hardcoded at the time this test was written — that's
        // what actually broke here when v5 was added later.
        let latest = Database::migrations().last().unwrap().0;
        assert_eq!(ver, latest);
        drop(conn);

        cleanup(&path);
    }

    #[test]
    fn search_history_dedupes_and_caps_at_100() {
        let (db, path) = temp_db("search-history");

        db.add_search_history_entry("love").unwrap();
        db.add_search_history_entry("grace").unwrap();
        // Re-adding an existing query moves it to the top rather than duplicating.
        db.add_search_history_entry("love").unwrap();

        let history = db.list_search_history().unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].query, "love");

        db.set_last_search_history_ref("John", 3, 16).unwrap();
        let history = db.list_search_history().unwrap();
        assert_eq!(history[0].ref_book.as_deref(), Some("John"));

        for i in 0..110 {
            db.add_search_history_entry(&format!("query-{i}")).unwrap();
        }
        assert_eq!(db.list_search_history().unwrap().len(), 100);

        db.clear_search_history().unwrap();
        assert_eq!(db.list_search_history().unwrap().len(), 0);

        cleanup(&path);
    }

    #[test]
    fn service_order_round_trip_preserves_order() {
        let (db, path) = temp_db("service-order");

        let items = vec![
            ServiceOrderItem {
                id: "a".into(),
                book: "John".into(),
                chapter: 3,
                verse: 16,
                text: "For God so loved...".into(),
                module: "KJV".into(),
                presentation_override: Some(PresentationItemOverride {
                    font_scale: Some(1.2),
                    transition_type: Some("slide".into()),
                    ..Default::default()
                }),
            },
            ServiceOrderItem {
                id: "b".into(),
                book: "Genesis".into(),
                chapter: 1,
                verse: 1,
                text: "In the beginning...".into(),
                module: "KJV".into(),
                presentation_override: None,
            },
        ];
        db.set_service_order(&items).unwrap();

        let loaded = db.list_service_order().unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "a");
        assert_eq!(loaded[1].id, "b");
        assert_eq!(
            loaded[0]
                .presentation_override
                .as_ref()
                .and_then(|item| item.font_scale),
            Some(1.2)
        );

        // Replacing with a reordered list should persist the new order, not append.
        let reordered = vec![items[1].clone(), items[0].clone()];
        db.set_service_order(&reordered).unwrap();
        let loaded = db.list_service_order().unwrap();
        assert_eq!(loaded[0].id, "b");
        assert_eq!(loaded[1].id, "a");

        cleanup(&path);
    }

    #[test]
    fn legacy_import_is_idempotent_and_transactional() {
        let (db, path) = temp_db("legacy-import");

        assert!(!db.legacy_import_done().unwrap());

        let payload = LegacyLocalStorageImport {
            search_history: vec![LegacySearchHistoryEntry {
                query: "faith".into(),
                timestamp: 1000,
                selected_ref: Some(LegacyVerseRef {
                    book: "Hebrews".into(),
                    chapter: 11,
                    verse: 1,
                }),
            }],
            service_order: vec![ServiceOrderItem {
                id: "legacy-1".into(),
                book: "Psalms".into(),
                chapter: 23,
                verse: 1,
                text: "The LORD is my shepherd".into(),
                module: "KJV".into(),
                presentation_override: None,
            }],
            display_prefs: Some(LegacyDisplayPrefs {
                font_family: "serif".into(),
                text_align: "left".into(),
                margins: 10,
                line_spacing: 0.8,
                letter_spacing: 0.1,
                strongs_sheet_height: 400,
                presentation_context: 2,
            }),
            study_ui: Some(LegacyStudyUi {
                show_commentary: false,
                show_notes: true,
                show_cross_refs: false,
                show_red_letter: true,
            }),
        };

        db.import_legacy_local_storage(&payload).unwrap();
        assert!(db.legacy_import_done().unwrap());
        assert_eq!(db.list_search_history().unwrap().len(), 1);
        assert_eq!(db.list_service_order().unwrap().len(), 1);
        let prefs = db.get_preferences().unwrap();
        assert_eq!(prefs.font_family, "serif");
        assert!(!prefs.show_commentary);

        // Calling again with different data must be a no-op — the marker already
        // exists, so nothing should change (this is what makes it safe for the
        // frontend to call unconditionally on every startup).
        let second_payload = LegacyLocalStorageImport {
            search_history: vec![LegacySearchHistoryEntry {
                query: "should not be imported".into(),
                timestamp: 2000,
                selected_ref: None,
            }],
            ..Default::default()
        };
        db.import_legacy_local_storage(&second_payload).unwrap();
        assert_eq!(db.list_search_history().unwrap().len(), 1);
        assert_eq!(db.list_search_history().unwrap()[0].query, "faith");

        cleanup(&path);
    }

    #[test]
    fn reading_position_round_trip() {
        let (db, path) = temp_db("readpos");

        assert!(db.get_reading_position().unwrap().is_none());

        let pos = ReadingPosition {
            book: "Genesis".to_string(),
            chapter: 3,
            verse: 15,
            module_id: "KJV".to_string(),
        };
        db.set_reading_position(&pos).unwrap();

        let loaded = db.get_reading_position().unwrap().unwrap();
        assert_eq!(loaded.book, "Genesis");
        assert_eq!(loaded.chapter, 3);
        assert_eq!(loaded.verse, 15);

        // Setting again overwrites in place rather than accumulating rows.
        db.set_reading_position(&ReadingPosition {
            book: "Exodus".to_string(),
            chapter: 1,
            verse: 1,
            module_id: "KJV".to_string(),
        })
        .unwrap();
        assert_eq!(db.get_reading_position().unwrap().unwrap().book, "Exodus");

        cleanup(&path);
    }

    #[test]
    fn bookmark_crud() {
        let (db, path) = temp_db("bookmarks");

        let bm = db.add_bookmark("John", 3, 16, "KJV").unwrap();
        assert_eq!(bm.book, "John");

        let all = db.list_bookmarks().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, bm.id);

        db.remove_bookmark(bm.id).unwrap();
        assert!(db.list_bookmarks().unwrap().is_empty());

        cleanup(&path);
    }

    #[test]
    fn note_crud() {
        let (db, path) = temp_db("notes");

        let note = db
            .add_note("Psalms", 23, Some(1), "KJV", "The LORD is my shepherd")
            .unwrap();
        assert_eq!(note.content, "The LORD is my shepherd");

        let updated = db.update_note(note.id, "edited content").unwrap();
        assert_eq!(updated.content, "edited content");

        assert_eq!(db.list_notes().unwrap().len(), 1);
        db.delete_note(note.id).unwrap();
        assert!(db.list_notes().unwrap().is_empty());

        cleanup(&path);
    }

    #[test]
    fn installed_module_records_round_trip() {
        let (db, path) = temp_db("modules");

        db.record_installed_module("KJV", "King James Version", "/path/KJV", "2.0", "Bible")
            .unwrap();
        let records = db.list_installed_module_records().unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].0, "KJV");
        assert!(!records[0].5, "index_built should start false");

        db.mark_index_built("KJV").unwrap();
        let records = db.list_installed_module_records().unwrap();
        assert!(records[0].5, "index_built should be true after marking");

        // Re-recording the same id updates in place (ON CONFLICT), not duplicates.
        db.record_installed_module("KJV", "King James Version", "/path/KJV", "2.1", "Bible")
            .unwrap();
        assert_eq!(db.list_installed_module_records().unwrap().len(), 1);

        cleanup(&path);
    }

    #[test]
    fn fts_search_finds_indexed_verses() {
        let (db, path) = temp_db("search");

        db.replace_module_index(
            "KJV",
            &[
                ("John", 3, 16, "For God so loved the world".to_string()),
                ("Genesis", 1, 1, "In the beginning God created".to_string()),
            ],
        )
        .unwrap();

        let results = db
            .search_fts(
                "loved",
                &SearchOptions {
                    modules: vec!["KJV".to_string()],
                    testament: None,
                    book_filter: None,
                    strongs_filter: None,
                    page: None,
                    page_size: None,
                },
            )
            .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].book, "John");

        // Re-indexing the same module replaces rather than appends.
        db.replace_module_index(
            "KJV",
            &[("John", 3, 16, "For God so loved the world".to_string())],
        )
        .unwrap();
        let all_kjv = db
            .search_fts(
                "God",
                &SearchOptions {
                    modules: vec!["KJV".to_string()],
                    testament: None,
                    book_filter: None,
                    strongs_filter: None,
                    page: None,
                    page_size: None,
                },
            )
            .unwrap();
        assert_eq!(
            all_kjv.len(),
            1,
            "old Genesis row should be gone, not duplicated"
        );

        cleanup(&path);
    }

    #[test]
    fn strongs_counts_round_trip() {
        let (db, path) = temp_db("strongs");

        db.replace_strongs_counts(
            "KJV",
            &[
                ("G26".to_string(), "John".to_string(), 5),
                ("G26".to_string(), "Romans".to_string(), 3),
            ],
        )
        .unwrap();

        let (total, by_book) = db.get_strongs_counts("KJV", "G26").unwrap();
        assert_eq!(total, 8);
        assert_eq!(by_book.len(), 2);
        assert_eq!(by_book[0].book, "John"); // ordered by count DESC

        cleanup(&path);
    }

    #[test]
    fn survives_a_poisoned_mutex_from_an_unrelated_panic() {
        // Simulates the exact scenario this fix targets: some unrelated command
        // panics while holding the connection lock (a bug in search, module
        // install progress reporting, whatever — anything that locks self.0).
        // Before this fix, every future self.0.lock().unwrap() would panic
        // forever afterward, taking down notes/bookmarks/preferences/etc. with
        // it. After this fix, self.conn() recovers the guard instead.
        let (db, path) = temp_db("poison");
        let db = std::sync::Arc::new(db);

        let db_clone = db.clone();
        let result = std::thread::spawn(move || {
            let _guard = db_clone.0.lock().unwrap();
            panic!("simulated bug in an unrelated feature");
        })
        .join();
        assert!(result.is_err(), "the spawned thread should have panicked");

        // The mutex is now poisoned. A naive self.0.lock().unwrap() here would
        // panic; going through self.conn() must not.
        let bm = db.add_bookmark("John", 3, 16, "KJV");
        assert!(
            bm.is_ok(),
            "database should keep working after an unrelated panic poisoned the mutex"
        );
        assert_eq!(db.list_bookmarks().unwrap().len(), 1);

        cleanup(&path);
    }

    #[test]
    fn fts_query_sanitizes_syntax_characters_and_adds_prefix_wildcards() {
        assert_eq!(build_fts_query("love"), "love*");
        assert_eq!(build_fts_query("God's love"), "God's* love*");
        // FTS5 special characters (quotes, colons, parens) are stripped, not
        // passed through — an unsanitized MATCH query with these can error.
        assert_eq!(build_fts_query("\"love\" OR:test"), "love* ORtest*");
        assert_eq!(build_fts_query(""), "");
        assert_eq!(build_fts_query("   "), "");
    }
}
