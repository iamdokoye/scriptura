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
    /// Every Strong's number attached to this source-language word/phrase.
    ///
    /// A single English phrase in the KJV may represent more than one original
    /// word (for example, "created" in Genesis 1:1 has H0853 and H01254), so
    /// this must not be collapsed to one number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strongs: Option<Vec<String>>,
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
            strongs: Some(vec![strongs.into()]),
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
    /// True when Strong's own definition marks this as a grammatical particle
    /// with no independent English rendering (e.g. H0853, the Hebrew
    /// direct-object marker) rather than a translated content word — see
    /// `is_untranslated_marker_text` in sword/lexicon.rs.
    pub is_untranslated_marker: bool,
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

    // Study panel section visibility — moved here from browser localStorage so
    // preferences have one persistence contract instead of two (SQLite + LS).
    pub show_commentary: bool,
    pub show_notes: bool,
    pub show_cross_refs: bool,
    pub show_red_letter: bool,

    // Display/typography preferences — same consolidation.
    pub font_family: String,
    pub text_align: String,
    pub margins: u32,
    pub line_spacing: f64,
    pub letter_spacing: f64,
    pub strongs_sheet_height: u32,
    pub presentation_context: u32,
    /// Which lexicon source the Strong's sheet opens to by default: "ours"
    /// (bundled bare Strong's), "rich" (BDB/Abbott-Smith), or "lsj" (full
    /// LSJ, Greek only — the sheet falls back to "rich" for Hebrew words
    /// since there's no Hebrew LSJ equivalent). The sheet's pill switcher
    /// can still override this per-lookup.
    pub default_lexicon_source: String,
}

/// A reusable presentation design for Scripture output. The data model is
/// deliberately content-oriented so the same library can later power songs,
/// announcements, and confidence displays.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationTheme {
    pub id: String,
    pub name: String,
    pub background_color: String,
    pub background_gradient: Option<String>,
    pub text_color: String,
    pub reference_color: String,
    pub font_family: String,
    pub text_align: String,
    pub font_scale: f64,
    pub text_font_weight: u32,
    pub reference_font_scale: f64,
    pub reference_font_weight: u32,
    pub safe_margin: u32,
    pub text_shadow: bool,
    pub reference_position: String,
    pub verse_box_x: f64,
    pub verse_box_y: f64,
    pub verse_box_width: f64,
    pub verse_box_height: f64,
    pub reference_box_x: f64,
    pub reference_box_y: f64,
    pub reference_box_width: f64,
    pub reference_box_height: f64,
    pub auto_layout: bool,
    pub min_font_scale: f64,
    pub transition_type: String,
    pub transition_duration: u32,
    /// Which theme is currently applied — a session preference, freely
    /// reassignable to any theme (including personal ones) and unrelated
    /// to whether it can be deleted. See `is_builtin` for that.
    pub is_default: bool,
    /// True only for the seeded "Midnight Scripture" theme — the one theme
    /// that's permanent and can't be deleted. Every user-created theme
    /// stays personal and deletable regardless of `is_default`.
    pub is_builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// The editable subset accepted when making or updating a presentation theme.
#[derive(Debug, Clone, Deserialize)]
pub struct PresentationThemeInput {
    pub name: String,
    pub background_color: String,
    pub background_gradient: Option<String>,
    pub text_color: String,
    pub reference_color: String,
    pub font_family: String,
    pub text_align: String,
    pub font_scale: f64,
    pub text_font_weight: u32,
    pub reference_font_scale: f64,
    pub reference_font_weight: u32,
    pub safe_margin: u32,
    pub text_shadow: bool,
    pub reference_position: String,
    pub verse_box_x: f64,
    pub verse_box_y: f64,
    pub verse_box_width: f64,
    pub verse_box_height: f64,
    pub reference_box_x: f64,
    pub reference_box_y: f64,
    pub reference_box_width: f64,
    pub reference_box_height: f64,
    pub auto_layout: bool,
    pub min_font_scale: f64,
    pub transition_type: String,
    pub transition_duration: u32,
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

            show_commentary: true,
            show_notes: true,
            show_cross_refs: true,
            show_red_letter: true,

            font_family: "system".into(),
            text_align: "left".into(),
            margins: 0,
            line_spacing: 0.6,
            letter_spacing: 0.0,
            // 0 is a sentinel the frontend resolves to half the viewport
            // height (see resolveHeight in StrongsSheet.tsx) instead of a
            // fixed pixel value that would be cramped or oversized depending
            // on screen size. It never reapplies once the sheet is dragged
            // even once, since the real pixel height gets persisted then.
            strongs_sheet_height: 0,
            presentation_context: 1,
            default_lexicon_source: "ours".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHistoryEntry {
    pub id: i64,
    pub query: String,
    pub timestamp: i64,
    pub ref_book: Option<String>,
    pub ref_chapter: Option<u32>,
    pub ref_verse: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceOrderItem {
    pub id: String,
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub text: String,
    pub module: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presentation_override: Option<PresentationItemOverride>,
}

/// An optional, sparse presentation change attached to one service item. A
/// missing property inherits from the selected global theme; this lets an
/// operator adjust a difficult verse without creating another full theme.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct PresentationItemOverride {
    pub theme_id: Option<String>,
    pub font_scale: Option<f64>,
    pub text_font_weight: Option<u32>,
    pub reference_font_scale: Option<f64>,
    pub reference_font_weight: Option<u32>,
    pub reference_position: Option<String>,
    pub verse_box_x: Option<f64>,
    pub verse_box_y: Option<f64>,
    pub verse_box_width: Option<f64>,
    pub verse_box_height: Option<f64>,
    pub reference_box_x: Option<f64>,
    pub reference_box_y: Option<f64>,
    pub reference_box_width: Option<f64>,
    pub reference_box_height: Option<f64>,
    pub auto_layout: Option<bool>,
    pub min_font_scale: Option<f64>,
    pub transition_type: Option<String>,
    pub transition_duration: Option<u32>,
}

/// Legacy browser localStorage payloads, submitted once by the frontend to
/// import_legacy_local_storage so a device upgrading from a pre-consolidation
/// version doesn't lose its search history, service order, or display/study
/// preferences. See db::Database::import_legacy_local_storage for the
/// idempotency guarantee (an app_meta marker, not a schema version — this is a
/// one-time data migration, not a schema change).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LegacyLocalStorageImport {
    pub search_history: Vec<LegacySearchHistoryEntry>,
    pub service_order: Vec<ServiceOrderItem>,
    pub display_prefs: Option<LegacyDisplayPrefs>,
    pub study_ui: Option<LegacyStudyUi>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacySearchHistoryEntry {
    pub query: String,
    pub timestamp: i64,
    pub selected_ref: Option<LegacyVerseRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyVerseRef {
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyDisplayPrefs {
    pub font_family: String,
    pub text_align: String,
    pub margins: u32,
    pub line_spacing: f64,
    pub letter_spacing: f64,
    pub strongs_sheet_height: u32,
    pub presentation_context: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyStudyUi {
    pub show_commentary: bool,
    pub show_notes: bool,
    pub show_cross_refs: bool,
    pub show_red_letter: bool,
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
