use serde::{Deserialize, Serialize};

/// One labelled block of lyrics (a verse, the chorus, …). `key` is a short stable
/// id ("v1", "c", "b") that the song's arrangement refers to, so a chorus is
/// stored once and played wherever the arrangement lists it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SongSection {
    pub key: String,
    pub label: String,
    pub lyrics: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Song {
    /// `None` until the song has been saved once.
    pub id: Option<i64>,
    pub title: String,
    pub author: String,
    pub copyright: String,
    pub ccli_number: String,
    pub key: String,
    pub tempo: String,
    pub tags: Vec<String>,
    pub notes: String,
    /// Section keys in playing order. Empty means "sections in stored order".
    pub arrangement: Vec<String>,
    pub favourite: bool,
    pub sections: Vec<SongSection>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SongSummary {
    pub id: i64,
    pub title: String,
    pub author: String,
    pub ccli_number: String,
    pub favourite: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportSummary {
    pub imported: Vec<SongSummary>,
    /// Titles skipped because the library already has that song.
    pub skipped: Vec<String>,
}
