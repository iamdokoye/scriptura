import { emit, listen } from "@tauri-apps/api/event";
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

export function emitPresentation(state: PresentState) {
  // Tauri's emit routes through the backend and reaches all WebView windows,
  // unlike BroadcastChannel which is isolated per renderer process.
  emit(CHANNEL, state).catch(console.error);
}

export function listenPresentation(cb: (state: PresentState) => void): () => void {
  // listen() is async but we keep a synchronous cleanup API for useEffect.
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
