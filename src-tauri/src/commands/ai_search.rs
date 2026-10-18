//! Natural-language scripture search, backed by the Modal service in
//! `services/scripture-search`.
//!
//! The request is made here rather than from the webview so the proxy-auth secret never
//! enters the page (and the CSP's `connect-src` can stay locked to IPC). Everything this
//! feature persists lives in its own `ai_search.json` in the app data dir, with its own
//! lock, so a failure here cannot reach the shared database or any other feature.

use crate::types::AppError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

/// A cold GPU container loads two models before answering; the app sends a warm-up ping
/// when the panel opens, but a first real query can still land on a cold start.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_QUERY_CHARS: usize = 500;
const MAX_TOP_K: u32 = 25;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Config {
    endpoint: String,
    key_id: String,
    key_secret: String,
}

impl Config {
    fn is_complete(&self) -> bool {
        !self.endpoint.is_empty() && !self.key_id.is_empty() && !self.key_secret.is_empty()
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
        Self {
            path,
            config: Mutex::new(config),
            client: reqwest::Client::new(),
        }
    }

    // A panic elsewhere while holding this lock must not wedge the feature for good.
    fn config(&self) -> Config {
        self.config
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

#[derive(Debug, Serialize)]
pub struct AiSearchStatus {
    configured: bool,
    endpoint: String,
    key_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiHit {
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub score: f64,
}

#[derive(Deserialize)]
struct ServiceResponse {
    results: Vec<AiHit>,
}

/// The endpoint is where the secret gets sent, so it must be https.
fn validate_endpoint(raw: &str) -> Result<String, AppError> {
    let url = raw.trim();
    let rest = url
        .strip_prefix("https://")
        .ok_or_else(|| AppError::Other("The endpoint must start with https://".into()))?;
    if rest.is_empty() || rest.starts_with('/') || rest.contains(char::is_whitespace) {
        return Err(AppError::Other("That doesn't look like a valid URL".into()));
    }
    Ok(url.to_string())
}

#[tauri::command]
pub fn ai_search_status(state: State<'_, AiSearchState>) -> AiSearchStatus {
    let c = state.config();
    AiSearchStatus {
        configured: c.is_complete(),
        endpoint: c.endpoint,
        key_id: c.key_id,
    }
}

#[tauri::command]
pub fn ai_search_configure(
    endpoint: String,
    key_id: String,
    key_secret: String,
    state: State<'_, AiSearchState>,
) -> Result<AiSearchStatus, AppError> {
    let config = Config {
        endpoint: validate_endpoint(&endpoint)?,
        key_id: key_id.trim().to_string(),
        key_secret: key_secret.trim().to_string(),
    };
    if !config.is_complete() {
        return Err(AppError::Other("All three fields are required".into()));
    }

    let json = serde_json::to_string(&config).map_err(|e| AppError::Other(e.to_string()))?;
    write_private(&state.path, &json)?;
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = config.clone();

    Ok(AiSearchStatus {
        configured: true,
        endpoint: config.endpoint,
        key_id: config.key_id,
    })
}

#[tauri::command]
pub fn ai_search_clear(state: State<'_, AiSearchState>) -> Result<(), AppError> {
    match std::fs::remove_file(&state.path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    *state.config.lock().unwrap_or_else(|e| e.into_inner()) = Config::default();
    Ok(())
}

/// Finds verses matching `query`. An empty query is the warm-up ping: the service
/// answers it only once its models are loaded, so the first real search isn't cold.
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
        return Err(AppError::Network(match status.as_u16() {
            401 | 403 => {
                "The service rejected the access key. Check it in AI search settings.".into()
            }
            404 => "The service endpoint wasn't found. Check the URL in AI search settings.".into(),
            code => format!("The search service returned an error ({code})"),
        }));
    }

    let parsed: ServiceResponse = resp
        .json()
        .await
        .map_err(|_| AppError::Network("The search service sent an unexpected response".into()))?;
    Ok(parsed.results)
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
    fn endpoint_must_be_https() {
        assert!(validate_endpoint("https://me--scriptura.modal.run").is_ok());
        assert!(validate_endpoint("  https://me--scriptura.modal.run  ").is_ok());
        assert!(validate_endpoint("http://me--scriptura.modal.run").is_err());
        assert!(validate_endpoint("me--scriptura.modal.run").is_err());
        assert!(validate_endpoint("https://").is_err());
        assert!(validate_endpoint("https:///path").is_err());
        assert!(validate_endpoint("https://a b.com").is_err());
    }

    #[test]
    fn parses_service_response() {
        let json = r#"{"results":[{"book":"John","chapter":3,"verse":16,"score":0.93}]}"#;
        let parsed: ServiceResponse = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.results.len(), 1);
        assert_eq!(parsed.results[0].book, "John");
        assert_eq!(parsed.results[0].verse, 16);
    }

    #[test]
    fn config_needs_every_field() {
        let mut c = Config::default();
        assert!(!c.is_complete());
        c.endpoint = "https://x".into();
        c.key_id = "id".into();
        assert!(!c.is_complete());
        c.key_secret = "secret".into();
        assert!(c.is_complete());
    }
}
