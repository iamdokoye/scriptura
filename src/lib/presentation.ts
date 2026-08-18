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

let _channel: BroadcastChannel | null = null;
function channel(): BroadcastChannel {
  if (!_channel) _channel = new BroadcastChannel(CHANNEL);
  return _channel;
}

export function emitPresentation(state: PresentState) {
  channel().postMessage(state);
}

export function listenPresentation(cb: (state: PresentState) => void): () => void {
  const ch = channel();
  const handler = (e: MessageEvent<PresentState>) => cb(e.data);
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}

export function closePresentation() {
  _channel?.close();
  _channel = null;
}
