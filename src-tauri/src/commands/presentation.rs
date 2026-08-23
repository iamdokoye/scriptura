use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// Persisted presentation state so the presentation window can fetch it immediately on load.
pub struct PresentationState(pub Mutex<Option<Value>>);

/// Relay presentation state from the main window to the presentation window.
/// Stores the latest state and pushes it via WebviewWindow::eval, which injects
/// JS directly into the target webview from the host process. This is used instead
/// of listen/emit or the window's own timers because macOS throttles JS execution
/// (including setTimeout and the event loop that would deliver a `listen` callback)
/// in WKWebViews that are not the key/focused window — eval() is driven externally
/// and isn't subject to that throttling.
#[tauri::command]
pub async fn relay_presentation(
    app: AppHandle,
    state: State<'_, PresentationState>,
    payload: Value,
) -> std::result::Result<(), String> {
    // Persist so the window can pull it immediately on mount
    *state.0.lock().unwrap() = Some(payload.clone());

    if let Some(window) = app.get_webview_window("presentation") {
        let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
        let script = format!(
            "window.__scripturaApplyPresentation && window.__scripturaApplyPresentation({json});"
        );
        window.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Called by the presentation window on mount to get the current state without
/// waiting for the next emit (avoids race between window load and first relay call).
#[tauri::command]
pub async fn get_presentation_state(
    state: State<'_, PresentationState>,
) -> std::result::Result<Option<Value>, String> {
    Ok(state.0.lock().unwrap().clone())
}

#[derive(serde::Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[tauri::command]
pub async fn list_monitors(app: AppHandle) -> std::result::Result<Vec<MonitorInfo>, String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary_pos = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .map(|m| *m.position());

    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(index, m)| {
            let pos = *m.position();
            let size = *m.size();
            MonitorInfo {
                index,
                name: m.name().cloned(),
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                is_primary: primary_pos == Some(pos),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn open_presentation_window(
    app: AppHandle,
    monitor_index: Option<usize>,
) -> std::result::Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    // If already open, just focus it
    if let Some(w) = app.get_webview_window("presentation") {
        let _ = w.set_focus();
        return Ok(());
    }

    let target_monitor = monitor_index.and_then(|idx| {
        app.get_webview_window("main")
            .and_then(|w| w.available_monitors().ok())
            .and_then(|monitors| monitors.into_iter().nth(idx))
    });

    let window =
        WebviewWindowBuilder::new(&app, "presentation", WebviewUrl::App("index.html".into()))
            .title("Scriptura Live")
            .decorations(false)
            .initialization_script("window.__SCRIPTURA_PRESENTATION__ = true;")
            .build()
            .map_err(|e| e.to_string())?;

    if let Some(monitor) = target_monitor {
        let _ = window.set_position(tauri::Position::Physical(*monitor.position()));
        let _ = window.set_size(tauri::Size::Physical(*monitor.size()));
        // A short delay before entering fullscreen gives the window manager time to
        // actually finish moving the window first — without it, the OS can decide
        // fullscreen based on where the window was *before* the move (observed on
        // macOS, where fullscreen opens a new Space tied to whichever screen the
        // window appears to be on at the moment the transition starts).
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let _ = window.set_fullscreen(true);

    Ok(())
}

#[tauri::command]
pub async fn close_presentation_window(app: AppHandle) -> std::result::Result<(), String> {
    if let Some(w) = app.get_webview_window("presentation") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
