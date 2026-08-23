import type { StateCreator } from "zustand";
import { api, type Preferences } from "../../lib/tauri";
import type { AppState, DisplayPrefs, FontFamily, TextAlign } from "../app";

const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  fontFamily: "system",
  textAlign: "left",
  margins: 0,
  lineSpacing: 0.6,
  letterSpacing: 0,
  strongsSheetHeight: 360,
  presentationContext: 1,
};

const FONT_FAMILIES: readonly FontFamily[] = ["system", "serif", "times", "mono"];
const TEXT_ALIGNS: readonly TextAlign[] = ["left", "justify"];
const PRESENTATION_CONTEXTS = [1, 2, 3, 4] as const;

/**
 * The backend's Preferences row stores font_family/text_align/presentation_context
 * as plain string/number columns — narrower than DisplayPrefs' literal-union types.
 * Validates and falls back to the default for anything unexpected, same defensive
 * posture the old localStorage loader had for exactly this reason (a value written
 * by an older app version, or just malformed data, shouldn't crash the UI).
 */
function fromPreferences(prefs: Preferences): DisplayPrefs {
  return {
    fontFamily: (FONT_FAMILIES as readonly string[]).includes(prefs.font_family)
      ? (prefs.font_family as FontFamily)
      : DEFAULT_DISPLAY_PREFS.fontFamily,
    textAlign: (TEXT_ALIGNS as readonly string[]).includes(prefs.text_align)
      ? (prefs.text_align as TextAlign)
      : DEFAULT_DISPLAY_PREFS.textAlign,
    margins: prefs.margins,
    lineSpacing: prefs.line_spacing,
    letterSpacing: prefs.letter_spacing,
    strongsSheetHeight: prefs.strongs_sheet_height,
    presentationContext: (PRESENTATION_CONTEXTS as readonly number[]).includes(prefs.presentation_context)
      ? (prefs.presentation_context as 1 | 2 | 3 | 4)
      : DEFAULT_DISPLAY_PREFS.presentationContext,
  };
}

export interface DisplayPrefsSlice {
  displayPrefs: DisplayPrefs;
  setDisplayPrefs: (p: Partial<DisplayPrefs>) => void;
  /**
   * Populates from the backend's authoritative Preferences row. Called once at
   * startup (see App.tsx) — the store starts with DEFAULT_DISPLAY_PREFS so the
   * UI has something sane to render before that async fetch resolves.
   */
  hydrateDisplayPrefs: (prefs: Preferences) => void;
}

export const createDisplayPrefsSlice: StateCreator<AppState, [], [], DisplayPrefsSlice> = (set) => ({
  displayPrefs: DEFAULT_DISPLAY_PREFS,

  // Persists to SQLite (via the backend Preferences row) instead of
  // localStorage — see the localStorage-to-SQLite consolidation: unlike
  // localStorage, a failed write here is surfaced (logged), not silently
  // swallowed, and the write is a real transactional, validated column update
  // rather than a JSON blob with no schema.
  setDisplayPrefs: (patch) => {
    set((s) => ({ displayPrefs: { ...s.displayPrefs, ...patch } }));
    api
      .setPreferences({
        font_family: patch.fontFamily,
        text_align: patch.textAlign,
        margins: patch.margins,
        line_spacing: patch.lineSpacing,
        letter_spacing: patch.letterSpacing,
        strongs_sheet_height: patch.strongsSheetHeight,
        presentation_context: patch.presentationContext,
      })
      .catch((e) => console.error("[displayPrefs] failed to persist", e));
  },

  hydrateDisplayPrefs: (prefs) => set({ displayPrefs: fromPreferences(prefs) }),
});
