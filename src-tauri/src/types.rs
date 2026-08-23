use serde::{Deserialize, Serialize};
use thiserror::Error;

// ── Error type ───────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("SWORD module error: {0}")]
    Sword(String),
    #[error("Markup parse error: {0}")]
    #[allow(dead_code)]
    Markup(String),
    #[error("Network error: {0}")]
    Network(String),
    #[error("Module not found: {0}")]
    ModuleNotFound(String),
    #[error("Cipher key required")]
    CipherKeyRequired,
    #[error("{0}")]
    Other(String),
}

// Tauri commands must return serializable errors
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

// ── Shared data types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextSpan {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strongs: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub morph: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_added: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_footnote: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_red_letter: Option<bool>,
}

impl TextSpan {
    pub fn plain(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            strongs: None,
            morph: None,
            is_added: None,
            is_footnote: None,
            is_red_letter: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_strongs(text: impl Into<String>, strongs: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            strongs: Some(strongs.into()),
            morph: None,
            is_added: None,
            is_footnote: None,
            is_red_letter: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerseText {
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub spans: Vec<TextSpan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterText {
    pub module_id: String,
    pub book: String,
    pub chapter: u32,
    pub verses: Vec<VerseText>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookUsage {
    pub book: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrongsEntry {
    pub number: String,
    pub lemma: String,
    pub transliteration: String,
    pub part_of_speech: String,
    pub short_def: String,
    pub long_def: String,
    pub usage_count: u32,
    pub usage_by_book: Vec<BookUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub module_id: String,
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub text: String,
    pub highlights: Vec<(usize, usize)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    pub modules: Vec<String>,
    pub testament: Option<String>,
    pub book_filter: Option<Vec<String>>,
    pub strongs_filter: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ModuleCategory {
    Bible,
    Commentary,
    Lexicon,
    Dictionary,
    Devotional,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub language: String,
    pub version: String,
    pub category: ModuleCategory,
    pub installed: bool,
    pub requires_key: bool,
    pub has_strongs: bool,
    pub size_bytes: Option<u64>,
    /// Which module repository this listing came from (e.g. "CrossWire", "eBible.org").
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledModule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub language: String,
    pub version: String,
    pub category: ModuleCategory,
    pub installed: bool,
    pub requires_key: bool,
    pub has_strongs: bool,
    pub size_bytes: Option<u64>,
    pub install_path: String,
    pub index_built: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: i64,
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub module_id: String,
    pub created_at: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub book: String,
    pub chapter: u32,
    pub verse: Option<u32>,
    pub module_id: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    pub theme: String,
    pub font_size_reading: u32,
    pub show_strongs: bool,
    pub show_morph: bool,
    pub verse_display: String,
    pub default_commentary: Option<String>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            theme: "light".into(),
            font_size_reading: 18,
            show_strongs: true,
            show_morph: false,
            verse_display: "verse-per-line".into(),
            default_commentary: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingPosition {
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub module_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossReference {
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub end_verse: Option<u32>,
}
