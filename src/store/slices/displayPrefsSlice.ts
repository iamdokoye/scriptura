import type { StateCreator } from "zustand";
import type { AppState, DisplayPrefs } from "../app";

const DISPLAY_PREFS_KEY = "scriptura-display-prefs-v2";
const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  fontFamily: "system",
  textAlign: "left",
  margins: 0,
  lineSpacing: 0.6,
  letterSpacing: 0,
  strongsSheetHeight: 360,
  presentationContext: 1,
};

function loadDisplayPrefs(): DisplayPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(DISPLAY_PREFS_KEY) ?? "{}");
    return {
      ...DEFAULT_DISPLAY_PREFS,
      ...p,
      // Guard against stale string values from previous schema
      lineSpacing: typeof p.lineSpacing === "number" && p.lineSpacing >= 0 && p.lineSpacing <= 1
        ? p.lineSpacing : DEFAULT_DISPLAY_PREFS.lineSpacing,
      letterSpacing: typeof p.letterSpacing === "number" && p.letterSpacing >= 0 && p.letterSpacing <= 1
        ? p.letterSpacing : DEFAULT_DISPLAY_PREFS.letterSpacing,
      presentationContext: [1, 2, 3, 4].includes(p.presentationContext)
        ? p.presentationContext
        : p.presentationLayout === "scroll" ? 4 : DEFAULT_DISPLAY_PREFS.presentationContext,
    };
  } catch { return DEFAULT_DISPLAY_PREFS; }
}
function saveDisplayPrefs(p: DisplayPrefs) {
  try { localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(p)); } catch {}
}

export interface DisplayPrefsSlice {
  displayPrefs: DisplayPrefs;
  setDisplayPrefs: (p: Partial<DisplayPrefs>) => void;
}

export const createDisplayPrefsSlice: StateCreator<AppState, [], [], DisplayPrefsSlice> = (set) => ({
  displayPrefs: loadDisplayPrefs(),
  setDisplayPrefs: (patch) =>
    set((s) => {
      const next = { ...s.displayPrefs, ...patch };
      saveDisplayPrefs(next);
      return { displayPrefs: next };
    }),
});
