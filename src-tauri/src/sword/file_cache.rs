use crate::types::{AppError, Result};
/// Persistent in-process file cache.
///
/// SWORD module files (`.vss`, `.bdt`, `.bzv`, etc.) are a few MB each and
/// never change while the app is running.  Reading them from disk once and
/// sharing the bytes via `Arc` eliminates all file I/O after the first access —
/// even across multiple chapters and parallel reads.
///
/// The OS page-cache already does this implicitly on macOS/Windows, but making
/// it explicit means:
///   - Zero syscalls on every subsequent read
///   - No lock contention against the kernel's page reclaim
///   - Predictable latency regardless of memory pressure
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub struct FileCache(Mutex<HashMap<PathBuf, Arc<Vec<u8>>>>);

impl FileCache {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    /// Return the cached bytes for `path`, reading from disk only on the first call.
    pub fn read(&self, path: &Path) -> Result<Arc<Vec<u8>>> {
        // Fast path: already cached — one lock, one Arc clone.
        {
            let cache = self.0.lock().unwrap();
            if let Some(data) = cache.get(path) {
                return Ok(Arc::clone(data));
            }
        }

        // Slow path: read from disk without holding the lock.
        let data = std::fs::read(path)
            .map_err(|e| AppError::Sword(format!("read {}: {e}", path.display())))?;
        let shared = Arc::new(data);

        let mut cache = self.0.lock().unwrap();
        // Another thread may have raced us — that's fine, just use whichever entry is there.
        cache
            .entry(path.to_path_buf())
            .or_insert_with(|| Arc::clone(&shared));
        Ok(Arc::clone(cache.get(path).unwrap()))
    }
}
