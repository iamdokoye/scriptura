//! Song library: the data model, its own SQLite store, and the importers.
//!
//! Deliberately self-contained. Songs live in their own `songs.db` file with their
//! own connection and lock, so a failure here (corrupt file, poisoned lock, bad
//! import) cannot touch scripture, notes, bookmarks or preferences — and the
//! library is a single portable file the user can back up or move.

pub mod import;
pub mod model;
pub mod store;

pub use model::{ImportSummary, Song, SongSummary};
pub use store::SongStore;
