import { invoke } from "@tauri-apps/api/core";
import type { DisplayPrefs } from "../store/app";

export interface PresentState {
  book: string;
  chapter: number;
  verse: number;
  primaryModule: string;
  parallelModule: string | null;
  parallelMode: boolean;
  selectedStrongs: string | null;
  displayPrefs: DisplayPrefs;
  readingFontSize: number;
}

// Route through the Rust backend. The backend stores the latest state in a Mutex,
// which the presentation window polls for changes.
export function emitPresentation(state: PresentState) {
  invoke("relay_presentation", { payload: state }).catch(console.error);
}

// Poll the backend for state changes every 150ms.
// Tauri 2 WKWebView cross-process events (listen/emit) are unreliable on macOS;
// invoke-based polling is the only mechanism guaranteed to cross the boundary.
export function listenPresentation(cb: (state: PresentState) => void): () => void {
  let stopped = false;
  let lastJson = "";

  async function tick() {
    if (stopped) return;
    try {
      const s = await invoke<PresentState | null>("get_presentation_state");
      if (s) {
        const json = JSON.stringify(s);
        if (json !== lastJson) {
          lastJson = json;
          cb(s);
        }
      }
    } catch {
      // ignore
    }
    if (!stopped) setTimeout(tick, 150);
  }

  tick();
  return () => { stopped = true; };
}
