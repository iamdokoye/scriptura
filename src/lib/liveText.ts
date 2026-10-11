import type { DisplayPrefs } from "../store/app";
import type { PresentationTheme } from "./tauri";

/** What the live output uses when no theme is loaded yet — fixed, so the
 * output never depends on the user's reading-text Settings. */
const FALLBACK = {
  fontSize: 56,
  fontFamily: "system",
  textAlign: "center",
  lineSpacing: 0.3,
  letterSpacing: 0,
  safeMargin: 5,
} as const;

/** Base font size (px) for live verse text. */
export function liveFontSize(theme: PresentationTheme | null | undefined): number {
  return theme?.font_size ?? FALLBACK.fontSize;
}

export function liveSafeMargin(theme: PresentationTheme | null | undefined): number {
  return theme?.safe_margin ?? FALLBACK.safeMargin;
}

/**
 * Display prefs as the live output should see them: the typography fields come
 * from the theme, everything else (presentation context, split-long-verses…)
 * passes through. Settings → Text only styles reading text now, so the output
 * window and the operator-side split maths both go through this instead of
 * reading font/spacing/alignment straight from the user's preferences.
 */
export function liveDisplayPrefs(base: DisplayPrefs, theme: PresentationTheme | null | undefined): DisplayPrefs {
  return {
    ...base,
    fontFamily: (theme?.font_family ?? FALLBACK.fontFamily) as DisplayPrefs["fontFamily"],
    textAlign: (theme?.text_align ?? FALLBACK.textAlign) as DisplayPrefs["textAlign"],
    lineSpacing: theme?.line_spacing ?? FALLBACK.lineSpacing,
    letterSpacing: theme?.letter_spacing ?? FALLBACK.letterSpacing,
    // Theme safe_margin is the per-side % of the frame; DisplayPrefs.margins
    // is the *total* % (applied as half each side) over a 5% baseline.
    margins: ((theme?.safe_margin ?? FALLBACK.safeMargin) - 5) * 2,
  };
}
