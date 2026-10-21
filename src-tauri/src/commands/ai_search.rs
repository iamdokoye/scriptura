//! Natural-language scripture search powered by Anthropic Claude (e.g. Claude Haiku 5.5).
//!
//! The request is made from Rust rather than the webview so the user's API key
//! never enters webview JavaScript contexts and CSP stays locked to IPC.
//! The key is saved in `ai_search.json` in the app data dir with 0600 permissions.

use crate::types::AppError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

const MAX_QUERY_CHARS: usize = 500;
const CLAUDE_MODEL: &str = "claude-haiku-5-5";
const CLAUDE_TIMEOUT: Duration = Duration::from_secs(15);
const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";

pub fn normalize_claude_model(raw: &str) -> String {
    let s = raw.trim();
    let lower = s.to_lowercase();
    match lower.as_str() {
        "haiku 5.5" | "haiku-5.5" | "haiku 5-5" | "haiku5.5" | "claude 5.5 haiku" | "claude 5.5" | "claude-haiku-5-5" => "claude-haiku-5-5".to_string(),
        "haiku 5" | "haiku-5" | "haiku5" | "claude 5 haiku" | "claude 5" | "claude-haiku-5" => "claude-haiku-5".to_string(),
        "haiku 4.5" | "haiku-4.5" | "claude-haiku-4-5" => "claude-haiku-4-5".to_string(),
        "sonnet 5.5" | "sonnet-5.5" | "claude-sonnet-5-5" => "claude-sonnet-5-5".to_string(),
        // Migrate deprecated / invalid 3.5 haiku model IDs to 5.5
        "haiku 3.5" | "haiku-3.5" | "claude-3-5-haiku-20241022" | "claude-3-5-haiku-latest" => "claude-haiku-5-5".to_string(),
        _ => {
            if s.is_empty() {
                CLAUDE_MODEL.to_string()
            } else {
                s.to_string()
            }
        }
    }
}

const MAX_TOP_K: u32 = 25;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Config {
    /// User-supplied Anthropic API key for Claude scripture search.
    #[serde(default)]
    claude_api_key: String,
    /// Claude model to use (defaults to claude-haiku-5-5).
    #[serde(default)]
    claude_model: Option<String>,
    #[serde(default)]
    endpoint: String,
    #[serde(default)]
    key_id: String,
    #[serde(default)]
    key_secret: String,
}

impl Config {
    fn is_complete(&self) -> bool {
        !self.endpoint.is_empty() && !self.key_id.is_empty() && !self.key_secret.is_empty()
    }
    fn has_claude(&self) -> bool {
        !self.claude_api_key.is_empty()
    }
    fn claude_model(&self) -> String {
        match self.claude_model.as_deref() {
            Some(m) if !m.trim().is_empty() => normalize_claude_model(m),
            _ => CLAUDE_MODEL.to_string(),
        }
    }
    fn to_status(&self) -> AiSearchStatus {
        AiSearchStatus {
            configured: self.is_complete() || self.has_claude(),
            endpoint: self.endpoint.clone(),
            key_id: self.key_id.clone(),
            claude_configured: self.has_claude(),
            claude_model: self.claude_model(),
        }
    }
}

pub struct AiSearchState {
    path: PathBuf,
    config: Mutex<Config>,
    client: reqwest::Client,
}

impl AiSearchState {
    /// Loads any saved config. A missing or unreadable file just means "not set up yet".
    pub fn load(data_dir: &std::path::Path) -> Self {
        let path = data_dir.join("ai_search.json");
        let config = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        let client = reqwest::Client::builder()
            .tcp_nodelay(true)
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            path,
            config: Mutex::new(config),
            client,
        }
    }

    fn config(&self) -> Config {
        self.config
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSearchStatus {
    pub configured: bool,
    pub endpoint: String,
    pub key_id: String,
    pub claude_configured: bool,
    pub claude_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiHit {
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_verse: Option<u32>,
}

/// The system prompt instructs Claude to return structured JSON references with KJV
/// scripture references that match a natural-language query.
/// Keeping it concise and reference-only allows Claude Haiku to respond within 1-2 seconds.
const CLAUDE_SYSTEM_PROMPT: &str = r#"You are a King James Version (KJV) Bible expert.
Given a topic, story, or description, return the most relevant KJV scripture references as a JSON array.
Each object must have these fields:
- "book": the full canonical book name (e.g. "Genesis", "Acts", "Psalms", "Song of Solomon")
- "chapter": integer
- "verse": starting verse integer
- "end_verse": ending verse integer (optional, for passages)
- "score": confidence from 0.0 to 1.0

Output ONLY the raw JSON array of up to 10 references. Do not include verse text, quotes, markdown code fences, or explanations."#;

#[tauri::command]
pub fn ai_search_status(state: State<'_, AiSearchState>) -> AiSearchStatus {
    state.config().to_status()
}

#[tauri::command]
pub fn claude_api_key_status(state: State<'_, AiSearchState>) -> bool {
    state.config().has_claude()
}

#[tauri::command]
pub fn claude_api_key_save(
    api_key: String,
    model: Option<String>,
    state: State<'_, AiSearchState>,
) -> Result<AiSearchStatus, AppError> {
    let key = api_key.trim();
    let mut config = state.config();

    if !key.is_empty() {
        config.claude_api_key = key.to_string();
    } else if !config.has_claude() {
        return Err(AppError::Other("API key is required".into()));
    }

    if let Some(m) = model {
        let m_trimmed = m.trim();
        config.claude_model = if m_trimmed.is_empty() { None } else { Some(m_trimmed.to_string()) };
    }

    let json = serde_json::to_string(&config).map_err(|e| AppError::Other(e.to_string()))?;
    write_private(&state.path, &json)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = config.clone();

    Ok(config.to_status())
}

#[tauri::command]
pub fn claude_api_key_clear(state: State<'_, AiSearchState>) -> Result<AiSearchStatus, AppError> {
    let mut config = state.config();
    config.claude_api_key = String::new();
    config.claude_model = None;
    if !config.is_complete() {
        match std::fs::remove_file(&state.path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    } else {
        let json = serde_json::to_string(&config).map_err(|e| AppError::Other(e.to_string()))?;
        write_private(&state.path, &json)?;
    }
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = config.clone();

    Ok(config.to_status())
}

#[tauri::command]
pub fn ai_search_configure(
    endpoint: String,
    key_id: String,
    key_secret: String,
    state: State<'_, AiSearchState>,
) -> Result<AiSearchStatus, AppError> {
    let mut config = state.config();
    config.endpoint = endpoint.trim().to_string();
    config.key_id = key_id.trim().to_string();
    config.key_secret = key_secret.trim().to_string();

    let json = serde_json::to_string(&config).map_err(|e| AppError::Other(e.to_string()))?;
    write_private(&state.path, &json)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = config.clone();

    Ok(config.to_status())
}

#[tauri::command]
pub fn ai_search_clear(state: State<'_, AiSearchState>) -> Result<AiSearchStatus, AppError> {
    let mut config = state.config();
    config.endpoint.clear();
    config.key_id.clear();
    config.key_secret.clear();

    if !config.has_claude() {
        match std::fs::remove_file(&state.path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    } else {
        let json = serde_json::to_string(&config).map_err(|e| AppError::Other(e.to_string()))?;
        write_private(&state.path, &json)?;
    }
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = config.clone();

    Ok(config.to_status())
}

#[tauri::command]
pub async fn ai_search_query(
    query: String,
    top_k: Option<u32>,
    state: State<'_, AiSearchState>,
) -> Result<Vec<AiHit>, AppError> {
    let config = state.config();
    if !config.is_complete() {
        return Err(AppError::Other("AI search isn't set up yet".into()));
    }

    let query: String = query
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(MAX_QUERY_CHARS)
        .collect();
    let body = serde_json::json!({
        "query": query,
        "top_k": top_k.unwrap_or(10).clamp(1, MAX_TOP_K),
    });

    let resp = state
        .client
        .post(&config.endpoint)
        .header("Modal-Key", &config.key_id)
        .header("Modal-Secret", &config.key_secret)
        .json(&body)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                AppError::Network("The search service took too long to respond".into())
            } else {
                AppError::Network("Couldn't reach the search service".into())
            }
        })?;

    let status = resp.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => AppError::Other("Invalid search token. Check your credentials.".into()),
            429 => AppError::Other("The search service is busy. Please try again in a moment.".into()),
            _ => AppError::Network(format!("Search service error (HTTP {})", status)),
        });
    }

    #[derive(Deserialize)]
    struct ModalResponse {
        results: Vec<AiHit>,
    }
    let data: ModalResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Other(format!("Unexpected response from search service: {e}")))?;

    Ok(data.results)
}

/// Normalizes any common representation, alias, abbreviation, or casing of a Bible book
/// to its canonical 66-book KJV name.
pub fn normalize_bible_book(raw: &str) -> Option<&'static str> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    let lower = s.to_lowercase().replace('.', "");
    let compact = lower.replace([' ', '_', '-'], "");

    match compact.as_str() {
        "gen" | "genesis" => Some("Genesis"),
        "ex" | "exo" | "exod" | "exodus" => Some("Exodus"),
        "lev" | "levit" | "leviticus" => Some("Leviticus"),
        "num" | "numb" | "numbers" => Some("Numbers"),
        "deut" | "deuteronomy" => Some("Deuteronomy"),
        "josh" | "joshua" => Some("Joshua"),
        "judg" | "judges" => Some("Judges"),
        "ruth" => Some("Ruth"),
        "1sam" | "1samuel" | "1stsamuel" | "isamuel" => Some("1 Samuel"),
        "2sam" | "2samuel" | "2ndsamuel" | "iisamuel" => Some("2 Samuel"),
        "1kings" | "1stkings" | "ikings" | "1ki" => Some("1 Kings"),
        "2kings" | "2ndkings" | "iikings" | "2ki" => Some("2 Kings"),
        "1chron" | "1chronicles" | "1stchronicles" | "ichronicles" | "1ch" => Some("1 Chronicles"),
        "2chron" | "2chronicles" | "2ndchronicles" | "iichronicles" | "2ch" => Some("2 Chronicles"),
        "ezra" => Some("Ezra"),
        "neh" | "nehemiah" => Some("Nehemiah"),
        "est" | "esther" => Some("Esther"),
        "job" => Some("Job"),
        "ps" | "psa" | "psalm" | "psalms" => Some("Psalms"),
        "prov" | "proverbs" => Some("Proverbs"),
        "eccles" | "ecclesiastes" | "ecc" => Some("Ecclesiastes"),
        "song" | "songofsolomon" | "songofsongs" | "canticles" | "sos" => Some("Song of Solomon"),
        "isa" | "isaiah" => Some("Isaiah"),
        "jer" | "jeremiah" => Some("Jeremiah"),
        "lam" | "lamentations" => Some("Lamentations"),
        "ezek" | "ezekiel" => Some("Ezekiel"),
        "dan" | "daniel" => Some("Daniel"),
        "hos" | "hosea" => Some("Hosea"),
        "joel" => Some("Joel"),
        "amos" => Some("Amos"),
        "obad" | "obadiah" => Some("Obadiah"),
        "jon" | "jonah" => Some("Jonah"),
        "mic" | "micah" => Some("Micah"),
        "nah" | "nahum" => Some("Nahum"),
        "hab" | "habakkuk" => Some("Habakkuk"),
        "zeph" | "zephaniah" => Some("Zephaniah"),
        "hag" | "haggai" => Some("Haggai"),
        "zech" | "zechariah" => Some("Zechariah"),
        "mal" | "malachi" => Some("Malachi"),
        "matt" | "matthew" | "mt" => Some("Matthew"),
        "mark" | "mrk" | "mk" => Some("Mark"),
        "luke" | "luk" | "lk" => Some("Luke"),
        "john" | "joh" | "jn" => Some("John"),
        "acts" | "act" => Some("Acts"),
        "rom" | "romans" => Some("Romans"),
        "1cor" | "1corinthians" | "1stcorinthians" | "icorinthians" => Some("1 Corinthians"),
        "2cor" | "2corinthians" | "2ndcorinthians" | "iicorinthians" => Some("2 Corinthians"),
        "gal" | "galatians" => Some("Galatians"),
        "eph" | "ephesians" => Some("Ephesians"),
        "phil" | "philippians" | "php" => Some("Philippians"),
        "col" | "colossians" => Some("Colossians"),
        "1thess" | "1thessalonians" | "1stthessalonians" | "ithessalonians" => Some("1 Thessalonians"),
        "2thess" | "2thessalonians" | "2ndthessalonians" | "iithessalonians" => Some("2 Thessalonians"),
        "1tim" | "1timothy" | "1sttimothy" | "itimothy" => Some("1 Timothy"),
        "2tim" | "2timothy" | "2ndtimothy" | "iitimothy" => Some("2 Timothy"),
        "titus" | "tit" => Some("Titus"),
        "philem" | "philemon" | "phm" => Some("Philemon"),
        "heb" | "hebrews" => Some("Hebrews"),
        "jas" | "james" => Some("James"),
        "1pet" | "1peter" | "1stpeter" | "ipeter" => Some("1 Peter"),
        "2pet" | "2peter" | "2ndpeter" | "iipeter" => Some("2 Peter"),
        "1john" | "1stjohn" | "ijohn" => Some("1 John"),
        "2john" | "2ndjohn" | "iijohn" => Some("2 John"),
        "3john" | "3rdjohn" | "iiijohn" => Some("3 John"),
        "jude" => Some("Jude"),
        "rev" | "revelation" | "revelations" => Some("Revelation"),
        _ => None,
    }
}

fn parse_u32_val(val: &serde_json::Value) -> Option<u32> {
    if let Some(n) = val.as_u64() {
        return Some(n as u32);
    }
    if let Some(s) = val.as_str() {
        let trimmed = s.trim();
        if let Some((first, _)) = trimmed.split_once(['-', '–']) {
            return first.trim().parse::<u32>().ok();
        }
        return trimmed.parse::<u32>().ok();
    }
    None
}

fn parse_end_verse_val(val: &serde_json::Value, start_verse_val: &serde_json::Value) -> Option<u32> {
    if let Some(ev) = parse_u32_val(val) {
        return Some(ev);
    }
    if let Some(s) = start_verse_val.as_str() {
        if let Some((_, second)) = s.split_once(['-', '–']) {
            return second.trim().parse::<u32>().ok();
        }
    }
    None
}

/// Parses Claude's response into a list of verified AiHit results.
/// Attempts structured JSON extraction first; if that yields nothing (e.g. Claude replied
/// in natural conversation or plain citations), falls back to regex scripture citation parsing.
pub fn parse_claude_response(text: &str) -> Vec<AiHit> {
    let mut hits = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // ── Strategy 1: JSON array / object parsing ───────────────────────────────
    let trimmed = text.trim();
    let unquoted = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    let cleaned = unquoted
        .strip_suffix("```")
        .unwrap_or(unquoted)
        .trim();

    let json_candidate = if let (Some(s), Some(e)) = (cleaned.find('['), cleaned.rfind(']')) {
        if s <= e { Some(&cleaned[s..=e]) } else { None }
    } else if let (Some(s), Some(e)) = (cleaned.find('{'), cleaned.rfind('}')) {
        if s <= e { Some(&cleaned[s..=e]) } else { None }
    } else {
        None
    };

    if let Some(json_str) = json_candidate {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
            let items: Option<&Vec<serde_json::Value>> = if let Some(arr) = val.as_array() {
                Some(arr)
            } else if let Some(obj) = val.as_object() {
                obj.get("results")
                    .or_else(|| obj.get("verses"))
                    .or_else(|| obj.get("hits"))
                    .or_else(|| obj.get("matches"))
                    .and_then(|v| v.as_array())
            } else {
                None
            };

            if let Some(items) = items {
                for item in items {
                    if let Some(obj) = item.as_object() {
                        let book_str = obj.get("book").and_then(|b| b.as_str()).unwrap_or("");
                        let normalized_book = match normalize_bible_book(book_str) {
                            Some(b) => b,
                            None => continue,
                        };

                        let chapter = match obj.get("chapter").and_then(parse_u32_val) {
                            Some(c) if c >= 1 => c,
                            _ => continue,
                        };

                        let verse_val = obj.get("verse").unwrap_or(&serde_json::Value::Null);
                        let verse = match parse_u32_val(verse_val) {
                            Some(v) if v >= 1 => v,
                            _ => continue,
                        };

                        let end_verse_val = obj.get("end_verse").unwrap_or(&serde_json::Value::Null);
                        let end_verse = match parse_end_verse_val(end_verse_val, verse_val) {
                            Some(ev) if ev > verse => Some(ev),
                            _ => None,
                        };

                        let score = obj.get("score").and_then(|s| s.as_f64()).unwrap_or(0.95);

                        let key = (normalized_book.to_string(), chapter, verse, end_verse);
                        if seen.insert(key) {
                            hits.push(AiHit {
                                book: normalized_book.to_string(),
                                chapter,
                                verse,
                                score,
                                end_verse,
                            });
                        }
                    }
                }
            }
        }
    }

    if !hits.is_empty() {
        return hits;
    }

    // ── Strategy 2: Fallback regex scripture citation parser ───────────────────
    // Matches references like: "Exodus 23:2", "Psalm 1:1", "Proverbs 4:14-15", "1 Corinthians 15:33"
    let re = regex::Regex::new(r"(?i)\b([1-3]?\s*[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?)\s+(\d+):(\d+)(?:[-–](\d+))?\b");
    if let Ok(re) = re {
        let mut score = 0.95;
        for cap in re.captures_iter(text) {
            let book_str = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let normalized_book = match normalize_bible_book(book_str) {
                Some(b) => b,
                None => continue,
            };

            let chapter = match cap.get(2).and_then(|m| m.as_str().parse::<u32>().ok()) {
                Some(c) if c >= 1 => c,
                _ => continue,
            };

            let verse = match cap.get(3).and_then(|m| m.as_str().parse::<u32>().ok()) {
                Some(v) if v >= 1 => v,
                _ => continue,
            };

            let end_verse = match cap.get(4).and_then(|m| m.as_str().parse::<u32>().ok()) {
                Some(ev) if ev > verse => Some(ev),
                _ => None,
            };

            let key = (normalized_book.to_string(), chapter, verse, end_verse);
            if seen.insert(key) {
                hits.push(AiHit {
                    book: normalized_book.to_string(),
                    chapter,
                    verse,
                    score,
                    end_verse,
                });
                score = (score - 0.01).max(0.50);
                if hits.len() >= 15 {
                    break;
                }
            }
        }
    }

    hits
}

/// Queries Claude Haiku for KJV scripture references matching a natural-language
/// description. Fast execution (< 2s).
#[tauri::command]
pub async fn claude_search_query(
    query: String,
    state: State<'_, AiSearchState>,
) -> Result<Vec<AiHit>, AppError> {
    let config = state.config();
    if !config.has_claude() {
        return Err(AppError::Other("Claude API key isn't set up yet".into()));
    }

    let query: String = query
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(MAX_QUERY_CHARS)
        .collect();

    if query.is_empty() {
        return Ok(vec![]);
    }

    let user_prompt = format!(
        "Find the top matching KJV Bible verses for: \"{query}\". Return ONLY the JSON array of references."
    );

    let body = serde_json::json!({
        "model": config.claude_model(),
        "max_tokens": 512,
        "system": CLAUDE_SYSTEM_PROMPT,
        "messages": [{
            "role": "user",
            "content": user_prompt,
        }],
    });

    let resp = state
        .client
        .post(CLAUDE_API_URL)
        .header("x-api-key", &config.claude_api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .timeout(CLAUDE_TIMEOUT)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                AppError::Network("Claude took too long to respond".into())
            } else {
                AppError::Network(format!("Couldn't reach Claude API: {e}"))
            }
        })?;

    let status = resp.status();
    if !status.is_success() {
        let error_body = resp.text().await.unwrap_or_default();
        return Err(AppError::Network(match status.as_u16() {
            401 => "Invalid Claude API key. Check it in Settings → AI Scripture Search.".into(),
            403 => "Claude API access denied. Check your API key permissions.".into(),
            404 => format!("Claude model not found. Check AI model in Settings. ({error_body})"),
            429 => "Claude rate limit reached. Wait a moment and try again.".into(),
            code => format!("Claude API error ({code}): {error_body}"),
        }));
    }

    // Claude's Messages API response shape:
    // { "content": [ { "type": "thinking", ... }, { "type": "text", "text": "..." } ] }
    let resp_body: serde_json::Value = resp
        .json()
        .await
        .map_err(|_| AppError::Network("Claude sent an unexpected response".into()))?;

    // Collect all "text" content blocks (models with thinking put thinking blocks first)
    let text = match resp_body.get("content").and_then(|c| c.as_array()) {
        Some(arr) => arr
            .iter()
            .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n"),
        None => String::new(),
    };

    let hits = parse_claude_response(&text);
    if hits.is_empty() && !text.trim().is_empty() {
        log::warn!("Claude search returned text but no hits were parsed: {}", text);
    }

    Ok(hits)
}

/// Writes the config readable by the current user only — it holds an access secret.
fn write_private(path: &std::path::Path, contents: &str) -> Result<(), AppError> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        f.write_all(contents.as_bytes())?;
        Ok(())
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, contents)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_config_state() {
        let mut c = Config::default();
        assert!(!c.has_claude());
        c.claude_api_key = "test-claude-key".into();
        assert!(c.has_claude());
        let s = c.to_status();
        assert!(s.configured);
        assert!(s.claude_configured);
        assert_eq!(s.claude_model, "claude-haiku-5-5");
    }

    #[test]
    fn parses_claude_json_response() {
        let json = r#"[{"book":"Acts","chapter":5,"verse":1,"end_verse":11,"score":0.95}]"#;
        let hits = parse_claude_response(json);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].book, "Acts");
        assert_eq!(hits[0].chapter, 5);
        assert_eq!(hits[0].verse, 1);
        assert_eq!(hits[0].end_verse, Some(11));
    }

    #[test]
    fn parses_claude_json_with_psalm_and_string_numbers() {
        let json = r#"```json
[
    {"book":"Psalm","chapter":"1","verse":"1"},
    {"book":"Proverbs","chapter":4,"verse":"14-15"}
]
```"#;
        let hits = parse_claude_response(json);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].book, "Psalms");
        assert_eq!(hits[0].chapter, 1);
        assert_eq!(hits[0].verse, 1);

        assert_eq!(hits[1].book, "Proverbs");
        assert_eq!(hits[1].chapter, 4);
        assert_eq!(hits[1].verse, 14);
        assert_eq!(hits[1].end_verse, Some(15));
    }

    #[test]
    fn parses_claude_playground_plain_text() {
        let text = r#"Exodus 23:2: "Thou shalt not follow a multitude to do evil."
Psalm 1:1: "Blessed is the man that walketh not in the counsel of the ungodly, nor standeth in the way of sinners, nor sitteth in the seat of the scornful."
Proverbs 1:10: "My son, if sinners entice thee, consent thou not."
Proverbs 4:14-15: "Enter not into the path of the wicked, and go not in the way of evil men. Avoid it, pass not by it, turn from it, and pass away."
Proverbs 13:20: "He that walketh with wise men shall be wise: but a companion of fools shall be destroyed."
Psalm 26:4-5: "I have not sat with vain persons, neither will I go in with dissemblers. I have hated the congregation of evil doers, and will not sit with the wicked."
Numbers 16:26: "Depart, I pray you, from the tents of these wicked men, and touch nothing of theirs, lest ye be consumed in all their sins."
1 Corinthians 15:33: "Be not deceived: evil communications corrupt good manners."
Romans 12:2: "And be not conformed to this world: but be ye transformed by the renewing of your mind."
2 Corinthians 6:17: "Wherefore come out from among them, and be ye separate, saith the Lord, and touch not the unclean thing."
Ephesians 5:11: "And have no fellowship with the unfruitful works of darkness, but rather reprove them."
Revelation 18:4: "Come out of her, my people, that ye be not partakers of her sins, and that ye receive not of her plagues."
Matthew 7:13-14 is also relevant: it warns that the broad road is taken by many, while the narrow way is found by few."#;

        let hits = parse_claude_response(text);
        assert!(!hits.is_empty(), "Should extract citations from plain text");
        assert_eq!(hits[0].book, "Exodus");
        assert_eq!(hits[0].chapter, 23);
        assert_eq!(hits[0].verse, 2);

        assert_eq!(hits[1].book, "Psalms");
        assert_eq!(hits[1].chapter, 1);
        assert_eq!(hits[1].verse, 1);

        // Check Proverbs 4:14-15 range
        let prov4 = hits.iter().find(|h| h.book == "Proverbs" && h.chapter == 4).unwrap();
        assert_eq!(prov4.verse, 14);
        assert_eq!(prov4.end_verse, Some(15));

        // Check 1 Corinthians
        let cor = hits.iter().find(|h| h.book == "1 Corinthians").unwrap();
        assert_eq!(cor.chapter, 15);
        assert_eq!(cor.verse, 33);
    }

    #[test]
    fn normalizes_claude_models() {
        assert_eq!(normalize_claude_model("haiku 5.5"), "claude-haiku-5-5");
        assert_eq!(normalize_claude_model("haiku 5"), "claude-haiku-5");
        assert_eq!(normalize_claude_model("claude-3-5-haiku-20241022"), "claude-haiku-5-5");
        assert_eq!(normalize_claude_model(""), "claude-haiku-5-5");
    }
}
