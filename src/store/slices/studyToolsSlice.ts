import type { StateCreator } from "zustand";
import type { AppState } from "../app";

const STUDY_UI_KEY = "scriptura-study-ui-v2";

interface StudyUiPrefs {
  showCommentary: boolean;
  showNotes: boolean;
  showCrossRefs: boolean;
  showRedLetter: boolean;
}

function loadStudyUi(): StudyUiPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(STUDY_UI_KEY) ?? "{}");
    return {
      showCommentary: p.showCommentary !== false,
      showNotes: p.showNotes !== false,
      showCrossRefs: p.showCrossRefs !== false,
      showRedLetter: p.showRedLetter !== false,
    };
  } catch {
    return { showCommentary: true, showNotes: true, showCrossRefs: true, showRedLetter: true };
  }
}
function saveStudyUi(prefs: StudyUiPrefs) {
  try { localStorage.setItem(STUDY_UI_KEY, JSON.stringify(prefs)); } catch {}
}

export interface StudyToolsSlice {
  // From backend preferences
  showStrongs: boolean;
  setShowStrongs: (v: boolean) => void;

  // Study panel section visibility (persisted to localStorage)
  showCommentary: boolean;
  setShowCommentary: (v: boolean) => void;
  showNotes: boolean;
  setShowNotes: (v: boolean) => void;
  showCrossRefs: boolean;
  setShowCrossRefs: (v: boolean) => void;
  showRedLetter: boolean;
  setShowRedLetter: (v: boolean) => void;
}

const studyUi = loadStudyUi();

export const createStudyToolsSlice: StateCreator<AppState, [], [], StudyToolsSlice> = (set) => ({
  showStrongs: true,
  setShowStrongs: (showStrongs) => set({ showStrongs }),

  showCommentary: studyUi.showCommentary,
  setShowCommentary: (showCommentary) =>
    set((s) => {
      saveStudyUi({ showCommentary, showNotes: s.showNotes, showCrossRefs: s.showCrossRefs, showRedLetter: s.showRedLetter });
      return { showCommentary };
    }),
  showNotes: studyUi.showNotes,
  setShowNotes: (showNotes) =>
    set((s) => {
      saveStudyUi({ showCommentary: s.showCommentary, showNotes, showCrossRefs: s.showCrossRefs, showRedLetter: s.showRedLetter });
      return { showNotes };
    }),
  showCrossRefs: studyUi.showCrossRefs,
  setShowCrossRefs: (showCrossRefs) =>
    set((s) => {
      saveStudyUi({ showCommentary: s.showCommentary, showNotes: s.showNotes, showCrossRefs, showRedLetter: s.showRedLetter });
      return { showCrossRefs };
    }),
  showRedLetter: studyUi.showRedLetter,
  setShowRedLetter: (showRedLetter) =>
    set((s) => {
      saveStudyUi({ showCommentary: s.showCommentary, showNotes: s.showNotes, showCrossRefs: s.showCrossRefs, showRedLetter });
      return { showRedLetter };
    }),
});
