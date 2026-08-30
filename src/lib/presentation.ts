import { invoke } from "@tauri-apps/api/core";
import type { DisplayPrefs } from "../store/app";
import type { PresentationTheme } from "./tauri";

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
  presentationTheme: PresentationTheme | null;
  /** Cut to a plain black screen — verse content keeps its place underneath. */
  black?: boolean;
  /** A dedicated "something's wrong" screen, overriding black and live content alike. */
  emergency?: boolean;
  /**
   * Which part of a split verse is currently displayed (0 = part a, 1 = part b, …).
   * Only meaningful when displayPrefs.splitLongVerses is true and the verse splits into
   * more than one part at the active font size.
   */
  versePart?: number;
}

declare global {
  interface Window {
    __scripturaApplyPresentation?: (state: PresentState) => void;
  }
}

// Route through the Rust backend. The backend stores the latest state and pushes
// it into the presentation window via WebviewWindow::eval — see relay_presentation
// in src-tauri/src/commands/mod.rs for why (macOS throttles JS timers/events in
// unfocused WKWebViews, but an externally-driven eval() call is not throttled).
export function emitPresentation(state: PresentState) {
  invoke("relay_presentation", { payload: state }).catch(console.error);
}

// Installs a global hook that the Rust backend calls directly via eval() whenever
// state changes, plus an initial pull on mount to avoid missing the first update.
export function listenPresentation(cb: (state: PresentState) => void): () => void {
  window.__scripturaApplyPresentation = cb;

  invoke<PresentState | null>("get_presentation_state")
    .then((s) => { if (s) cb(s); })
    .catch(() => {});

  return () => {
    if (window.__scripturaApplyPresentation === cb) {
      delete window.__scripturaApplyPresentation;
    }
  };
}
