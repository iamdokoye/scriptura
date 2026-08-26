import type { StateCreator } from "zustand";
import { api } from "../../lib/tauri";
import type { AppState, View } from "../app";

export type Workspace = "study" | "presentation";

export interface NavigationSlice {
  view: View;
  setView: (v: View) => void;

  // First-run
  hasModules: boolean;
  setHasModules: (v: boolean) => void;

  // Which persona the app is set up for right now — see Preferences.workspace
  // (src-tauri/src/types.rs). "study" is the personal Bible-study experience
  // on its own; "presentation" adds the live-show tools (service queue,
  // Live Show console, presentation themes) on top of it. Study mode doesn't
  // just deprioritize those — they're not reachable at all, by design.
  workspace: Workspace;
  /** Sets and persists — use for a real user choice (the Settings toggle). */
  setWorkspace: (w: Workspace) => void;
  /** Sets from the backend's stored preference at startup — does not re-persist. */
  hydrateWorkspace: (w: Workspace) => void;
}

export const createNavigationSlice: StateCreator<AppState, [], [], NavigationSlice> = (set, get) => ({
  view: "reading",
  setView: (view) => set({ view }),

  hasModules: false,
  setHasModules: (hasModules) => set({ hasModules }),

  workspace: "study",
  setWorkspace: (workspace) => {
    set({ workspace });
    api.setPreferences({ workspace }).catch((e) => console.error("[workspace] failed to persist", e));

    // Switching to Study mode removes every presenting control from the UI —
    // an output window left running with no way to reach Black/Emergency/
    // Stop from the vanished controls would be a real problem, so shut it
    // down and clear the state those controls owned.
    if (workspace === "study") {
      const s = get();
      if (s.presentationActive) {
        api.closePresentationWindow().catch(() => {});
        s.setPresentationActive(false);
      }
      s.setLiveBlack(false);
      s.setLiveEmergency(false);
    }
  },
  hydrateWorkspace: (workspace) => set({ workspace }),
});
