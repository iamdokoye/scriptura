import type { StateCreator } from "zustand";
import { api, type Preferences } from "../../lib/tauri";
import type { AppState } from "../app";

export interface StudyToolsSlice {
  // From backend preferences
  showStrongs: boolean;
  setShowStrongs: (v: boolean) => void;

  // Study panel section visibility — also backend preferences (moved off
  // localStorage; see displayPrefsSlice for why).
  showCommentary: boolean;
  setShowCommentary: (v: boolean) => void;
  showNotes: boolean;
  setShowNotes: (v: boolean) => void;
  showCrossRefs: boolean;
  setShowCrossRefs: (v: boolean) => void;
  showRedLetter: boolean;
  setShowRedLetter: (v: boolean) => void;

  /** Populates the four study-panel toggles from the backend at startup. */
  hydrateStudyTools: (prefs: Preferences) => void;
}

export const createStudyToolsSlice: StateCreator<AppState, [], [], StudyToolsSlice> = (set) => ({
  showStrongs: true,
  setShowStrongs: (showStrongs) => set({ showStrongs }),

  showCommentary: true,
  setShowCommentary: (showCommentary) => {
    set({ showCommentary });
    api.setPreferences({ show_commentary: showCommentary }).catch((e) => console.error("[studyTools] failed to persist", e));
  },
  showNotes: true,
  setShowNotes: (showNotes) => {
    set({ showNotes });
    api.setPreferences({ show_notes: showNotes }).catch((e) => console.error("[studyTools] failed to persist", e));
  },
  showCrossRefs: true,
  setShowCrossRefs: (showCrossRefs) => {
    set({ showCrossRefs });
    api.setPreferences({ show_cross_refs: showCrossRefs }).catch((e) => console.error("[studyTools] failed to persist", e));
  },
  showRedLetter: true,
  setShowRedLetter: (showRedLetter) => {
    set({ showRedLetter });
    api.setPreferences({ show_red_letter: showRedLetter }).catch((e) => console.error("[studyTools] failed to persist", e));
  },

  hydrateStudyTools: (prefs) =>
    set({
      showCommentary: prefs.show_commentary,
      showNotes: prefs.show_notes,
      showCrossRefs: prefs.show_cross_refs,
      showRedLetter: prefs.show_red_letter,
    }),
});
