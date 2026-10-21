import { create } from "zustand";
import {
  aiSearchApi, claudeApi, searchViaAccount, errorMessage, sanitizeHits,
  AiSearchError, type AiHit, type AiSearchStatus, type Quota,
} from "../lib/aiSearch";
import { useAccountStore } from "./accountStore";

type Phase = "idle" | "loading" | "done" | "error";

export type SearchSource = "claude" | "custom" | "account";

const WARM_INTERVAL_MS = 60_000;

interface AiSearchState {
  open: boolean;
  config: AiSearchStatus | null;
  query: string;
  phase: Phase;
  hits: AiHit[];
  error: string | null;
  quota: Quota | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel and runs `query` (or just opens it when empty). */
  ask: (query: string) => void;
  /** Loads the saved config and inits account store; safe to call repeatedly. */
  ensureReady: () => Promise<void>;
  saveConfig: (endpoint: string, keyId: string, keySecret: string) => Promise<void>;
  clearConfig: () => Promise<void>;
  saveClaudeKey: (apiKey: string, model?: string) => Promise<void>;
  clearClaudeKey: () => Promise<void>;
  /** Forget results and errors. */
  reset: () => void;
  /** Silent ping to check quota / warm up gateway. */
  warmUp: () => void;
}

// Only the newest question may write results; an older, slower answer is dropped.
let latest = 0;
let lastWarm = 0;
let readyPromise: Promise<void> | null = null;

/**
 * Which route a search would take right now, or null when neither is set up.
 * Priority: a connected own server or own Anthropic key (advanced, deliberate) first,
 * otherwise the signed-in account.
 */
export function activeSource(): SearchSource | null {
  const config = useAiSearchStore.getState().config;
  if (config?.claude_configured) return "claude";
  if (config?.configured) return "custom";
  if (useAccountStore.getState().status === "signedIn") return "account";
  return null;
}

/**
 * A question asked before the person was signed in or connected waits in the prompt box.
 * The connect forms call this once they succeed, to send it immediately.
 */
export function resumePendingQuestion() {
  const { query, phase, hits, ask } = useAiSearchStore.getState();
  if (query && phase === "idle" && hits.length === 0) ask(query);
}

async function runSearch(source: SearchSource, query: string): Promise<{ hits: unknown; quota?: Quota }> {
  if (source === "claude") {
    return { hits: await claudeApi.query(query) };
  }
  if (source === "custom") {
    return { hits: await aiSearchApi.query(query) };
  }
  return searchViaAccount(query);
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

      const source = activeSource();
      if (!source) return;

      set({ phase: "loading" });
      try {
        const { hits, quota } = await runSearch(source, query);
        if (id !== latest) return;
        lastWarm = Date.now();
        set({ phase: "done", hits: sanitizeHits(hits), quota: quota ?? get().quota });
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
        .then((config) => {
          set({ config });
        })
        .catch(() => {
          set({
            config: {
              configured: false,
              endpoint: "",
              key_id: "",
              claude_configured: false,
              claude_model: "claude-haiku-5-5",
            },
          });
        });
      await Promise.all([loadConfig, useAccountStore.getState().init()]);
    })();
    return readyPromise;
  },

  saveConfig: async (endpoint, keyId, keySecret) => {
    const config = await aiSearchApi.configure(endpoint, keyId, keySecret);
    lastWarm = 0;
    set({ config, phase: "idle", error: null });
  },

  clearConfig: async () => {
    const config = await aiSearchApi.clear();
    latest++;
    set({ config, phase: "idle", hits: [], error: null, query: "" });
  },

  saveClaudeKey: async (apiKey: string, model?: string) => {
    const config = await claudeApi.save(apiKey, model);
    set({ config, phase: "idle", error: null });
  },

  clearClaudeKey: async () => {
    const config = await claudeApi.clear();
    latest++;
    set({ config, phase: "idle", hits: [], error: null, query: "" });
  },

  reset: () => {
    latest++;
    lastWarm = 0;
    set({ phase: "idle", hits: [], error: null, query: "", quota: null });
  },

  warmUp: () => {
    const source = activeSource();
    if (!source || source === "claude") return;
    if (Date.now() - lastWarm < WARM_INTERVAL_MS) return;
    lastWarm = Date.now();
    runSearch(source, "")
      .then(({ quota }) => {
        if (quota) set({ quota });
      })
      .catch(() => {
        lastWarm = 0;
      });
  },
}));
