import { create } from "zustand";
import {
  searchViaAccount, errorMessage, sanitizeHits,
  AiSearchError, type AiHit, type Quota,
} from "../lib/aiSearch";
import { useAccountStore } from "./accountStore";

type Phase = "idle" | "loading" | "done" | "error";

interface AiSearchState {
  open: boolean;
  query: string;
  phase: Phase;
  hits: AiHit[];
  error: string | null;
  quota: Quota | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel and runs `query` (or just opens it when empty). */
  ask: (query: string) => void;
  /** Inits account store; safe to call repeatedly. */
  ensureReady: () => Promise<void>;
  /** Forget results and errors. */
  reset: () => void;
}

// Only the newest question may write results; an older, slower answer is dropped.
let latest = 0;
let readyPromise: Promise<void> | null = null;

/**
 * A question asked before signing in waits in the prompt box.
 * Called once sign-in succeeds, to run the pending question immediately.
 */
export function resumePendingQuestion() {
  const { query, phase, hits, ask } = useAiSearchStore.getState();
  if (query && phase === "idle" && hits.length === 0) ask(query);
}

export const useAiSearchStore = create<AiSearchState>()((set, get) => ({
  open: false,
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

      const accountStatus = useAccountStore.getState().status;
      if (accountStatus !== "signedIn") {
        // Not signed in: keep question in prompt box, panel shows sign-in form
        return;
      }

      set({ phase: "loading" });
      try {
        const { hits, quota } = await searchViaAccount(query);
        if (id !== latest) return;
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
      await useAccountStore.getState().init();
    })();
    return readyPromise;
  },

  reset: () => {
    latest++;
    set({ phase: "idle", hits: [], error: null, query: "", quota: null });
  },
}));
