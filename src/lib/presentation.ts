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

// Route through the Rust backend so the event reaches the presentation WebView.
// Frontend-to-frontend emit is unreliable across separate Tauri windows;
// backend app.emit() is the canonical cross-webview delivery path.
export function emitPresentation(state: PresentState) {
  invoke("relay_presentation", { payload: state }).catch(console.error);
}

export function listenPresentation(cb: (state: PresentState) => void): () => void {
  // listen() receives backend-emitted events reliably regardless of which window is focused.
  let unlisten: (() => void) | null = null;
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
