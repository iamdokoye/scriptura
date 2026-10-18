import { create } from "zustand";
import {
  aiSearchApi, AiSearchError, errorMessage, sanitizeHits, searchViaAccount,
  type AiHit, type AiSearchStatus, type Quota,
} from "../lib/aiSearch";
import { useAccountStore } from "./accountStore";

/**
 * State for natural-language scripture search, kept out of the app-wide store: the
 * panel, the search bar's "?" prefix and the toolbar button all talk to this one
 * feature, and nothing else in the app needs to know it exists.
 *
 * A search goes one of two ways. A person who connected their own server (the advanced
 * option) uses that. Everyone else uses their Scriptura account, whose gateway holds the
 * Modal credentials so no key ever ships in the app.
 */

// A Modal container stays up a few minutes after its last request (see modal_app.py),
// so one warm-up ping per this interval keeps the first real question fast.
const WARM_INTERVAL_MS = 4 * 60 * 1000;

type Phase = "idle" | "loading" | "done" | "error";
export type SearchSource = "custom" | "account";

interface AiSearchState {
  open: boolean;
  /** Own-server connection. null until the first status check completes. */
  config: AiSearchStatus | null;
  query: string;
  phase: Phase;
  hits: AiHit[];
  error: string | null;
  /** Searches left today, when searching through an account. */
  quota: Quota | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel and runs `query` (or just opens it when empty). */
  ask: (query: string) => void;
  /** Loads the saved own-server config and the account session; safe to call repeatedly. */
  ensureReady: () => Promise<void>;
  saveConfig: (endpoint: string, keyId: string, keySecret: string) => Promise<void>;
  clearConfig: () => Promise<void>;
  /** Forget results and errors (after signing out, for instance). */
  reset: () => void;
  /** Fire-and-forget ping so the GPU container is loaded before the first question. */
  warmUp: () => void;
}

// Only the newest question may write results; an older, slower answer is dropped.
let latest = 0;
let lastWarm = 0;
let readyPromise: Promise<void> | null = null;

/** Which route a search would take right now, or null when neither is set up. */
export function activeSource(): SearchSource | null {
  if (useAiSearchStore.getState().config?.configured) return "custom";
  if (useAccountStore.getState().status === "signedIn") return "account";
  return null;
}

/**
 * A question asked before the person was signed in or connected waits in the prompt box.
 * The connect forms call this once they succeed, to send it.
 */
export function resumePendingQuestion() {
  const { query, phase, hits, ask } = useAiSearchStore.getState();
  if (query && phase === "idle" && hits.length === 0) ask(query);
}

async function runSearch(source: SearchSource, query: string): Promise<{ hits: unknown; quota?: Quota }> {
  return source === "custom" ? { hits: await aiSearchApi.query(query) } : searchViaAccount(query);
}

export const useAiSearchStore = create<AiSearchState>()((set, get) => ({
  open: false,
  config: null,
  query: "",
  phase: "idle",
  hits: [],
  error: null,
  quota: null,

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),

  ask: (raw) => {
    const query = raw.trim();
    set({ open: true });
    if (!query) return;

    const id = ++latest;
    set({ query, phase: "idle", error: null });

    void (async () => {
      await get().ensureReady();
      if (id !== latest) return;

      // Not signed in or connected: the panel shows the sign-in form. The question
      // stays in the prompt box, ready for when that's done.
      const source = activeSource();
      if (!source) return;

      set({ phase: "loading" });
      try {
        const { hits, quota } = await runSearch(source, query);
        if (id !== latest) return;
        lastWarm = Date.now(); // the service just answered, so it's warm
        set({ phase: "done", hits: sanitizeHits(hits), quota: quota ?? null });
      } catch (e) {
        if (id !== latest) return;
        set({
          phase: "error",
          error: errorMessage(e),
          hits: [],
          quota: e instanceof AiSearchError && e.quota ? e.quota : get().quota,
        });
      }
    })();
  },

  ensureReady: () => {
    readyPromise ??= (async () => {
      const loadConfig = aiSearchApi.status()
        .then((config) => set({ config }))
        .catch(() => set({ config: { configured: false, endpoint: "", key_id: "" } }));
      await Promise.all([loadConfig, useAccountStore.getState().init()]);
    })();
    return readyPromise;
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

  reset: () => {
    latest++;
    lastWarm = 0;
    set({ phase: "idle", hits: [], error: null, query: "", quota: null });
  },

  warmUp: () => {
    const source = activeSource();
    if (!source) return;
    if (Date.now() - lastWarm < WARM_INTERVAL_MS) return;
    lastWarm = Date.now();
    runSearch(source, "").catch(() => {
      lastWarm = 0; // failed; let the next open try again
    });
  },
}));
