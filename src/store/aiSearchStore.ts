import { create } from "zustand";
import { aiSearchApi, errorMessage, sanitizeHits, type AiHit, type AiSearchStatus } from "../lib/aiSearch";

/**
 * State for natural-language scripture search, kept out of the app-wide store: the
 * panel, the search bar's "?" prefix and the toolbar button all talk to this one
 * feature, and nothing else in the app needs to know it exists.
 */

// A Modal container stays up a few minutes after its last request (see modal_app.py),
// so one warm-up ping per this interval keeps the first real question fast.
const WARM_INTERVAL_MS = 4 * 60 * 1000;

type Phase = "idle" | "loading" | "done" | "error";

interface AiSearchState {
  open: boolean;
  /** null until the first status check completes. */
  config: AiSearchStatus | null;
  query: string;
  phase: Phase;
  hits: AiHit[];
  error: string | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel and runs `query` (or just opens it when empty). */
  ask: (query: string) => void;
  loadConfig: () => Promise<void>;
  saveConfig: (endpoint: string, keyId: string, keySecret: string) => Promise<void>;
  clearConfig: () => Promise<void>;
  /** Fire-and-forget ping so the GPU container is loaded before the first question. */
  warmUp: () => void;
}

// Only the newest question may write results; an older, slower answer is dropped.
let latest = 0;
let lastWarm = 0;

export const useAiSearchStore = create<AiSearchState>()((set, get) => ({
  open: false,
  config: null,
  query: "",
  phase: "idle",
  hits: [],
  error: null,

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),

  ask: (raw) => {
    const query = raw.trim();
    set({ open: true });
    if (!query) return;

    // Not connected yet: the panel shows the setup form. Keep the question so it's
    // waiting in the prompt box once the connection is saved.
    if (get().config?.configured === false) {
      set({ query, phase: "idle", error: null });
      return;
    }

    const id = ++latest;
    set({ query, phase: "loading", error: null });
    aiSearchApi
      .query(query)
      .then((raw) => {
        if (id !== latest) return;
        lastWarm = Date.now(); // the service just answered, so it's warm
        set({ phase: "done", hits: sanitizeHits(raw) });
      })
      .catch((e) => {
        if (id !== latest) return;
        set({ phase: "error", error: errorMessage(e), hits: [] });
      });
  },

  loadConfig: async () => {
    try {
      set({ config: await aiSearchApi.status() });
    } catch {
      set({ config: { configured: false, endpoint: "", key_id: "" } });
    }
  },

  saveConfig: async (endpoint, keyId, keySecret) => {
    const config = await aiSearchApi.configure(endpoint, keyId, keySecret);
    lastWarm = 0;
    set({ config, phase: "idle", error: null }); // drop any error from the old credentials
  },

  clearConfig: async () => {
    await aiSearchApi.clear();
    latest++; // abandon anything still in flight against the old credentials
    set({ config: { configured: false, endpoint: "", key_id: "" }, phase: "idle", hits: [], error: null, query: "" });
  },

  warmUp: () => {
    if (!get().config?.configured) return;
    if (Date.now() - lastWarm < WARM_INTERVAL_MS) return;
    lastWarm = Date.now();
    aiSearchApi.query("").catch(() => {
      lastWarm = 0; // failed; let the next open try again
    });
  },
}));
