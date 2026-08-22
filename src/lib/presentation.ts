import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

const CHANNEL = "scriptura-presentation";

// Route through the Rust backend. The backend stores the latest state and
// emits directly to the "presentation" WebviewWindow using window.emit(),
// which is point-to-point and reliable across macOS WKWebView boundaries.
export function emitPresentation(state: PresentState) {
  invoke("relay_presentation", { payload: state }).catch(console.error);
}

export function listenPresentation(cb: (state: PresentState) => void): () => void {
  let unlisten: (() => void) | null = null;

  // Pull the last known state immediately — avoids missing the initial sync
  // if this window loaded before the first relay call fired.
  invoke<PresentState | null>("get_presentation_state")
    .then((s) => { if (s) cb(s); })
    .catch(() => {});

  // Then listen for all subsequent relay events from the backend.
  const promise = listen<PresentState>(CHANNEL, (event) => cb(event.payload));
  promise.then((fn) => { unlisten = fn; }).catch(console.error);

  return () => {
    if (unlisten) {
      unlisten();
    } else {
      promise.then((fn) => fn()).catch(() => {});
    }
  };
}
