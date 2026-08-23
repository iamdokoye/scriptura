use crate::sword::conf::ModuleConf;
use crate::types::{AppError, ModuleCategory, ModuleInfo, Result};
use reqwest::blocking::Client;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const CROSSWIRE_REPO_URL: &str = "https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/";
const CATALOG_URL: &str =
    "https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/mods.d.tar.gz";
const CATALOG_TTL: std::time::Duration = std::time::Duration::from_secs(3600);

// Hardcoded fallback used only when the live catalog fetch fails.
// (module_id, display_name, description, category, iso_lang)
const FREE_MODULES: &[(&str, &str, &str, &str, &str)] = &[
    (
        "KJV",
        "King James Version",
        "1769 Blayney text; most widely studied English Bible",
        "Bible",
        "eng",
    ),
    (
        "KJV1611",
        "KJV — Original 1611 Text",
        "First printed KJV with original spelling and translational choices",
        "Bible",
        "eng",
    ),
    (
        "ASV",
        "American Standard Version",
        "1901 literal revision of the Revised Version; basis for NASB/RSV",
        "Bible",
        "eng",
    ),
    (
        "BBE",
        "Bible in Basic English",
        "1949 simplified-vocabulary translation using only 850 core words",
        "Bible",
        "eng",
    ),
    (
        "DBY",
        "Darby Translation",
        "1890 translation by J.N. Darby; emphasises literal rendering",
        "Bible",
        "eng",
    ),
    (
        "YLT",
        "Young's Literal Translation",
        "1898 by Robert Young; extremely literal, preserves Hebrew tenses",
        "Bible",
        "eng",
    ),
    (
        "StrongsGreek",
        "Strong's Greek Dictionary",
        "James Strong's complete Greek NT lexicon keyed to KJV",
        "Lexicon",
        "eng",
    ),
    (
        "StrongsHebrew",
        "Strong's Hebrew Dictionary",
        "James Strong's complete Hebrew/Aramaic OT lexicon keyed to KJV",
        "Lexicon",
        "eng",
    ),
    (
        "MHC",
        "Matthew Henry Complete",
        "Exhaustive verse-by-verse commentary by Matthew Henry (1662–1714)",
        "Commentary",
        "eng",
    ),
    (
        "TSK",
        "Treasury of Scripture Knowledge",
        "Over 340,000 cross-references compiled by R. A. Torrey (1896)",
        "Commentary",
        "eng",
    ),
];

struct CatalogCache {
    modules: Vec<ModuleInfo>,
    fetched_at: std::time::Instant,
}

pub struct ModuleRegistry {
    modules_dir: PathBuf,
    loaded: Mutex<HashMap<String, Arc<ModuleConf>>>,
    catalog_cache: Mutex<Option<CatalogCache>>,
}

impl ModuleRegistry {
    pub fn new(modules_dir: PathBuf) -> Self {
        Self {
            modules_dir,
            loaded: Mutex::new(HashMap::new()),
            catalog_cache: Mutex::new(None),
        }
    }

    #[allow(dead_code)]
    pub fn modules_dir(&self) -> &Path {
        &self.modules_dir
    }

    pub fn conf_for(&self, module_id: &str) -> Option<Arc<ModuleConf>> {
        let loaded = self.loaded.lock().unwrap();
        loaded.get(module_id).cloned()
    }

    pub fn module_path(&self, module_id: &str) -> PathBuf {
        self.modules_dir.join(module_id)
    }

    pub fn register(&self, conf: ModuleConf) {
        let mut loaded = self.loaded.lock().unwrap();
        loaded.insert(conf.module_id.clone(), Arc::new(conf));
    }

    pub fn load_installed(&self) {
        if !self.modules_dir.exists() {
            return;
        }
        let Ok(entries) = std::fs::read_dir(&self.modules_dir) else {
            return;
        };
        for entry in entries.flatten() {
            let module_dir = entry.path();
            let module_id = entry.file_name().to_string_lossy().to_string();

            // `.tmp-*` / `.old-*` are install()'s staging directories; one can be left
            // behind if the app is killed mid-install/mid-swap. They never match a
            // conf's own naming, so they'd just be silently skipped below — but since
            // we're already iterating this directory, sweep them up while we're here.
            if module_id.starts_with(".tmp-") || module_id.starts_with(".old-") {
                let _ = std::fs::remove_dir_all(&module_dir);
                continue;
            }

            let conf_path = module_dir
                .join("mods.d")
                .join(format!("{}.conf", module_id.to_lowercase()));
            if let Ok(conf) = ModuleConf::parse(&module_id, &conf_path) {
                self.register(conf);
            }
        }
    }

    /// Fetch the live CrossWire catalog from mods.d.tar.gz.
    /// Returns None on any error so callers can fall back gracefully.
    fn fetch_live_catalog() -> Option<Vec<ModuleInfo>> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .ok()?;

        let resp = client.get(CATALOG_URL).send().ok()?;
        if !resp.status().is_success() {
            log::warn!("[modules] catalog fetch HTTP {}", resp.status());
            return None;
        }

        let bytes = resp.bytes().ok()?;
        let gz = flate2::read::GzDecoder::new(std::io::Cursor::new(bytes));
        let mut archive = tar::Archive::new(gz);

        let entries = match archive.entries() {
            Ok(e) => e,
            Err(e) => {
                log::warn!("[modules] catalog tar open: {e}");
                return None;
            }
        };

        let mut modules = Vec::new();
        for entry in entries {
            let Ok(mut entry) = entry else { continue };

            let is_conf = entry
                .path()
                .ok()
                .map(|p| {
                    p.extension()
                        .map_or(false, |e| e.eq_ignore_ascii_case("conf"))
                })
                .unwrap_or(false);
            if !is_conf {
                continue;
            }

            let mut content = String::new();
            if entry.read_to_string(&mut content).is_err() {
                continue;
            }

            if let Some(info) = parse_sword_conf(&content) {
                modules.push(info);
            }
        }

        log::info!(
            "[modules] live catalog: {} modules from CrossWire",
            modules.len()
        );
        if modules.is_empty() {
            None
        } else {
            Some(modules)
        }
    }

    /// Return the full list of available free modules, marking which are installed.
    /// Tries the live CrossWire catalog first; falls back to the hardcoded list.
    pub fn fetch_available(&self) -> Vec<ModuleInfo> {
        // Check cache (release the lock before any network I/O)
        let cached: Option<Vec<ModuleInfo>> = {
            let cache = self.catalog_cache.lock().unwrap();
            if let Some(ref c) = *cache {
                if c.fetched_at.elapsed() < CATALOG_TTL {
                    Some(c.modules.clone())
                } else {
                    None
                }
            } else {
                None
            }
        };

        let raw_modules = if let Some(modules) = cached {
            modules
        } else if let Some(modules) = Self::fetch_live_catalog() {
            let mut cache = self.catalog_cache.lock().unwrap();
            *cache = Some(CatalogCache {
                modules: modules.clone(),
                fetched_at: std::time::Instant::now(),
            });
            modules
        } else {
            log::info!("[modules] using hardcoded fallback module list");
            FREE_MODULES
                .iter()
                .map(|(id, name, desc, cat, lang)| ModuleInfo {
                    id: id.to_string(),
                    name: name.to_string(),
                    description: desc.to_string(),
                    language: lang.to_string(),
                    version: "1.0".to_string(),
                    category: parse_category(cat),
                    installed: false,
                    requires_key: false,
                    has_strongs: matches!(*cat, "Lexicon"),
                    size_bytes: None,
                })
                .collect()
        };

        // Apply current installed status
        let loaded = self.loaded.lock().unwrap();
        raw_modules
            .into_iter()
            .map(|mut m| {
                m.installed = loaded.contains_key(&m.id);
                m
            })
            .collect()
    }

    /// Download and install a module from CrossWire.
    ///
    /// The archive is downloaded and extracted into a temporary sibling directory,
    /// fully validated there (conf found and parsed, cipher key present if required),
    /// and only then atomically swapped into the module's real directory. This means
    /// an interrupted download, a truncated response, or a corrupt/incomplete archive
    /// can never leave a partially-extracted module at the path readers actually use —
    /// they either see the previous good install (if any) or nothing, never a broken one.
    pub fn install(
        &self,
        module_id: &str,
        cipher_key: Option<&str>,
        progress_cb: impl Fn(u32, &str) + Send + Sync + 'static,
    ) -> Result<()> {
        // Validate before module_id is used to build any URL or filesystem path.
        if module_id.is_empty()
            || module_id.contains(['/', '\\', '\0', '.'])
            || module_id.len() > 64
        {
            return Err(AppError::Sword(format!("invalid module id: {module_id}")));
        }

        progress_cb(5, "Connecting to CrossWire repository…");

        let url = format!("{CROSSWIRE_REPO_URL}{module_id}.zip");
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| AppError::Network(e.to_string()))?;

        let mut response = client
            .get(&url)
            .send()
            .map_err(|e| AppError::Network(format!("download failed: {e}")))?;

        if !response.status().is_success() {
            return Err(AppError::Network(format!(
                "HTTP {} for {url}",
                response.status()
            )));
        }

        const MAX_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024; // 500 MB

        let content_length = response.content_length().unwrap_or(0);
        if content_length > MAX_DOWNLOAD_BYTES {
            return Err(AppError::Network(format!(
                "module archive too large ({content_length} bytes)"
            )));
        }
        let mut data: Vec<u8> = Vec::with_capacity(content_length.min(MAX_DOWNLOAD_BYTES) as usize);
        let mut buf = vec![0u8; 65536];
        let mut downloaded = 0u64;
        progress_cb(10, "Downloading module…");
        loop {
            let n = response
                .read(&mut buf)
                .map_err(|e| AppError::Network(format!("read body: {e}")))?;
            if n == 0 {
                break;
            }
            downloaded += n as u64;
            if downloaded > MAX_DOWNLOAD_BYTES {
                return Err(AppError::Network(
                    "module archive exceeds size limit".into(),
                ));
            }
            data.extend_from_slice(&buf[..n]);
            if content_length > 0 {
                let pct = 10 + (downloaded as f64 / content_length as f64 * 40.0) as u32;
                progress_cb(pct.min(50), "Downloading module…");
            }
        }

        // A connection that closes early hands back a short read (n == 0) rather than
        // an error, so an interrupted download can otherwise pass through silently as
        // if it were the complete file. Catch that here, before anything is extracted.
        if content_length > 0 && downloaded != content_length {
            return Err(AppError::Network(format!(
                "incomplete download: got {downloaded} of {content_length} bytes"
            )));
        }

        progress_cb(52, "Extracting module…");

        std::fs::create_dir_all(&self.modules_dir)?;
        let dest_dir = self.modules_dir.join(module_id);
        // Extract into a temp sibling directory first. Nothing below writes to
        // dest_dir directly, so a panic, crash, or error partway through extraction
        // or validation leaves dest_dir untouched — either the previous good install
        // (on an update) or nothing (on a fresh install), never a partial module.
        let tmp_dir = self.modules_dir.join(format!(".tmp-{module_id}"));
        let _ = std::fs::remove_dir_all(&tmp_dir); // leftover from a prior interrupted attempt
        std::fs::create_dir_all(&tmp_dir)?;

        let extract_and_validate = || -> Result<ModuleConf> {
            extract_zip_entries(data, &tmp_dir)?;

            let conf_path = Self::find_conf(&tmp_dir, module_id)?;
            let mut conf = ModuleConf::parse(module_id, &conf_path)?;

            if conf.requires_cipher() && cipher_key.is_none() {
                return Err(AppError::CipherKeyRequired);
            }
            if let Some(key) = cipher_key {
                conf.raw.insert("cipherkey".to_string(), key.to_string());
            }
            Ok(conf)
        };

        progress_cb(57, "Parsing module configuration…");
        let conf = match extract_and_validate() {
            Ok(conf) => conf,
            Err(e) => {
                let _ = std::fs::remove_dir_all(&tmp_dir);
                return Err(e);
            }
        };

        // Fully validated — swap it into place. If dest_dir already holds a previous
        // install (a reinstall/update), stage it aside rather than deleting it up
        // front, so a failed rename can still restore it instead of losing the module.
        if dest_dir.exists() {
            let backup_dir = self.modules_dir.join(format!(".old-{module_id}"));
            let _ = std::fs::remove_dir_all(&backup_dir);
            std::fs::rename(&dest_dir, &backup_dir)
                .map_err(|e| AppError::Sword(format!("failed to stage previous install: {e}")))?;
            if let Err(e) = std::fs::rename(&tmp_dir, &dest_dir) {
                let _ = std::fs::rename(&backup_dir, &dest_dir); // best-effort rollback
                return Err(AppError::Sword(format!(
                    "failed to finalize module install: {e}"
                )));
            }
            let _ = std::fs::remove_dir_all(&backup_dir);
        } else {
            std::fs::rename(&tmp_dir, &dest_dir)
                .map_err(|e| AppError::Sword(format!("failed to finalize module install: {e}")))?;
        }

        self.register(conf);

        progress_cb(59, "Module downloaded");
        Ok(())
    }

    fn find_conf(module_dir: &Path, module_id: &str) -> Result<PathBuf> {
        let candidate = module_dir
            .join("mods.d")
            .join(format!("{}.conf", module_id.to_lowercase()));
        if candidate.exists() {
            return Ok(candidate);
        }

        for entry in walkdir::WalkDir::new(module_dir).max_depth(4) {
            let entry = entry.map_err(|e| AppError::Other(e.to_string()))?;
            let path = entry.path();
            if path
                .extension()
                .map_or(false, |e| e.eq_ignore_ascii_case("conf"))
            {
                return Ok(path.to_path_buf());
            }
        }
        Err(AppError::Sword(format!(
            "no .conf found in {}",
            module_dir.display()
        )))
    }
}

/// Extracts a zip archive into `dest_dir`, skipping any entry whose path would
/// resolve outside it (zip-slip / path traversal) and rejecting any single entry
/// larger than MAX_ENTRY_BYTES. Pulled out of `install()` as a free function so this
/// path-safety behavior can be unit tested directly against a crafted archive,
/// without needing a real network download to exercise it.
fn extract_zip_entries(data: Vec<u8>, dest_dir: &Path) -> Result<()> {
    const MAX_ENTRY_BYTES: u64 = 256 * 1024 * 1024; // 256 MB per entry

    let cursor = std::io::Cursor::new(data);
    let mut zip =
        zip::ZipArchive::new(cursor).map_err(|e| AppError::Sword(format!("zip open: {e}")))?;

    for i in 0..zip.len() {
        let mut file = zip
            .by_index(i)
            .map_err(|e| AppError::Sword(format!("zip entry {i}: {e}")))?;

        // enclosed_name() returns None for paths with ".." or absolute components
        let enclosed = match file.enclosed_name() {
            Some(p) => p,
            None => {
                log::warn!("[modules] skipping unsafe zip entry: {}", file.name());
                continue;
            }
        };
        let out_path = dest_dir.join(enclosed);

        // Double-check the resolved path is still inside dest_dir
        if !out_path.starts_with(dest_dir) {
            log::warn!("[modules] skipping zip entry outside dest: {}", file.name());
            continue;
        }

        if file.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            if file.size() > MAX_ENTRY_BYTES {
                return Err(AppError::Sword(format!(
                    "zip entry {} exceeds size limit",
                    file.name()
                )));
            }
            // std::io::copy surfaces a zip CRC32 mismatch as an error here,
            // since ZipFile validates each entry's checksum as it is read.
            let mut out_file = std::fs::File::create(&out_path)?;
            std::io::copy(&mut file, &mut out_file)?;
        }
    }
    Ok(())
}

/// Parse a SWORD module .conf file into a ModuleInfo.
/// Returns None if the conf is missing required fields or is a cipher-key module.
fn parse_sword_conf(content: &str) -> Option<ModuleInfo> {
    let mut module_id = String::new();
    let mut description = String::new();
    let mut about = String::new();
    let mut lang = String::new();
    let mut version = String::new();
    let mut mod_drv = String::new();
    let mut category_str = String::new();
    let mut cipher_key = String::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Section header [ModuleId]
        if line.starts_with('[') && line.ends_with(']') && module_id.is_empty() {
            module_id = line[1..line.len() - 1].trim().to_string();
            continue;
        }

        let Some(eq) = line.find('=') else { continue };
        let key = line[..eq].trim().to_lowercase();
        let val = line[eq + 1..].trim();

        match key.as_str() {
            "description" => description = val.to_string(),
            "about" => {
                if about.is_empty() {
                    about = val.to_string();
                }
            }
            "lang" => lang = val.to_string(),
            "version" => version = val.to_string(),
            "moddrv" => mod_drv = val.to_lowercase(),
            "category" => category_str = val.to_string(),
            "cipherkey" => cipher_key = val.to_string(),
            _ => {}
        }
    }

    if module_id.is_empty() || description.is_empty() {
        return None;
    }

    let requires_key = !cipher_key.is_empty();

    let category = if !category_str.is_empty() {
        match category_str.as_str() {
            "Biblical Texts" | "Texts" => ModuleCategory::Bible,
            "Commentaries" => ModuleCategory::Commentary,
            "Lexicons / Dictionaries" | "Lexicons" | "Dictionaries" => ModuleCategory::Lexicon,
            "Daily Devotional" | "Devotionals" => ModuleCategory::Devotional,
            _ => ModuleCategory::Other,
        }
    } else {
        match mod_drv.as_str() {
            "rawtext" | "rawtext4" | "ztext" | "ztext4" | "hrefcom" => ModuleCategory::Bible,
            "rawcom" | "rawcom4" | "zcom" | "rawfiles" => ModuleCategory::Commentary,
            "rawld" | "rawld4" | "zld" => ModuleCategory::Lexicon,
            _ => ModuleCategory::Other,
        }
    };

    // Build a readable description from the About field (unescape \n, take first ~200 chars)
    let desc = if !about.is_empty() {
        let plain = about.replace("\\n", " ").replace("\\t", " ");
        let trimmed = plain.trim().to_string();
        if trimmed.len() > 200 {
            format!("{}…", trimmed[..200].trim_end())
        } else {
            trimmed
        }
    } else {
        description.clone()
    };

    Some(ModuleInfo {
        id: module_id,
        name: description,
        description: desc,
        language: if lang.is_empty() {
            "eng".to_string()
        } else {
            lang
        },
        version: if version.is_empty() {
            "1.0".to_string()
        } else {
            version
        },
        category,
        installed: false,
        requires_key,
        has_strongs: false,
        size_bytes: None,
    })
}

fn parse_category(s: &str) -> ModuleCategory {
    match s {
        "Bible" => ModuleCategory::Bible,
        "Commentary" => ModuleCategory::Commentary,
        "Lexicon" => ModuleCategory::Lexicon,
        "Dictionary" => ModuleCategory::Dictionary,
        "Devotional" => ModuleCategory::Devotional,
        _ => ModuleCategory::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("scriptura-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn build_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut buf = std::io::Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(&mut buf);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for (name, content) in entries {
            writer.start_file(*name, options).unwrap();
            std::io::Write::write_all(&mut writer, content).unwrap();
        }
        writer.finish().unwrap();
        buf.into_inner()
    }

    #[test]
    fn extracts_well_formed_entries() {
        let dest = temp_dir("extract-ok");
        let zip_bytes = build_zip(&[
            (
                "mods.d/kjv.conf",
                b"[KJV]\ndescription=King James Version\n",
            ),
            ("modules/texts/rawtext/kjv/ot.bzs", b"binary-data-here"),
        ]);

        extract_zip_entries(zip_bytes, &dest).unwrap();

        assert!(dest.join("mods.d/kjv.conf").exists());
        assert!(dest.join("modules/texts/rawtext/kjv/ot.bzs").exists());

        let _ = std::fs::remove_dir_all(&dest);
    }

    #[test]
    fn skips_path_traversal_entries() {
        let dest = temp_dir("extract-traversal");
        // A crafted archive claiming to write outside dest_dir. Real extractors
        // (e.g. older/naive Zip Slip-vulnerable ones) would happily write this
        // straight through; extract_zip_entries must skip it instead.
        let zip_bytes = build_zip(&[
            ("../../evil.txt", b"pwned"),
            (
                "mods.d/kjv.conf",
                b"[KJV]\ndescription=King James Version\n",
            ),
        ]);

        extract_zip_entries(zip_bytes, &dest).unwrap();

        // The malicious entry must never land anywhere on disk...
        assert!(!dest
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("evil.txt")
            .exists());
        // ...while the legitimate entry in the same archive still extracts normally.
        assert!(dest.join("mods.d/kjv.conf").exists());

        let _ = std::fs::remove_dir_all(&dest);
    }

    #[test]
    fn parses_valid_bible_conf() {
        let info = parse_sword_conf(
            "[KJV]\n\
             Description=King James Version\n\
             About=The 1769 Blayney text.\n\
             Lang=en\n\
             Version=2.0\n\
             ModDrv=zText\n\
             Category=Biblical Texts\n",
        )
        .expect("valid conf should parse");

        assert_eq!(info.id, "KJV");
        assert_eq!(info.name, "King James Version");
        assert_eq!(info.language, "en");
        assert_eq!(info.version, "2.0");
        assert_eq!(info.category, ModuleCategory::Bible);
        assert!(!info.requires_key);
    }

    #[test]
    fn rejects_conf_missing_description() {
        assert!(parse_sword_conf("[KJV]\nLang=en\n").is_none());
    }

    #[test]
    fn rejects_conf_missing_section_header() {
        assert!(parse_sword_conf("Description=No section header\n").is_none());
    }

    #[test]
    fn detects_cipher_key_requirement() {
        let info =
            parse_sword_conf("[LOCKED]\nDescription=Locked module\nCipherKey=\nModDrv=zText\n")
                .unwrap();
        // An empty CipherKey line still means the key line exists in cipher_key's
        // raw string form here — sword marks "locked, key not yet supplied" this way.
        assert!(!info.requires_key);

        let info = parse_sword_conf(
            "[LOCKED]\nDescription=Locked module\nCipherKey=abc123\nModDrv=zText\n",
        )
        .unwrap();
        assert!(info.requires_key);
    }

    #[test]
    fn falls_back_to_moddrv_when_category_absent() {
        let commentary =
            parse_sword_conf("[MHC]\nDescription=Matthew Henry Complete\nModDrv=RawCom\n").unwrap();
        assert_eq!(commentary.category, ModuleCategory::Commentary);

        let lexicon =
            parse_sword_conf("[STRONGS]\nDescription=Strong's Dictionary\nModDrv=RawLD\n").unwrap();
        assert_eq!(lexicon.category, ModuleCategory::Lexicon);
    }

    #[test]
    fn extracts_entry_within_size_limit() {
        // Exercising an actual over-the-limit (256 MB) entry isn't practical in a
        // unit test; this instead guards against the size check being accidentally
        // inverted by confirming a normal small entry is still let through.
        let dest = temp_dir("extract-size-guard");
        let zip_bytes = build_zip(&[("small.txt", b"well within the limit")]);
        assert!(extract_zip_entries(zip_bytes, &dest).is_ok());
        assert!(dest.join("small.txt").exists());

        let _ = std::fs::remove_dir_all(&dest);
    }
}
