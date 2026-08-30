/**
 * Verse splitting — breaks a verse into screen-sized parts (a, b, c…)
 * only when the presentation placeholder cannot fit the full text at the user's
 * configured font size.  Auto-layout shrinking is irrelevant to the decision —
 * if the user set a large font, the verse should split rather than shrink.
 *
 * Capacity is derived from the verse box dimensions in the active theme:
 *   • effectiveSize  = readingFontSize × font_scale
 *   • charsPerLine   = floor(boxWidth  / (effectiveSize × 0.55))
 *   • linesPerBox    = floor(boxHeight / (effectiveSize × 1.35))
 *
 * The 1920 × 1080 reference frame is used for the percentage→pixel conversion.
 * When no theme is provided the call falls back to a simple font-size heuristic
 * so the helper can still be used without theme context (e.g. VersePanes chips).
 */

export const PART_LABELS = ["a", "b", "c", "d"] as const;
export type PartLabel = (typeof PART_LABELS)[number];

/** Maximum number of parts a verse can be split into. */
const MAX_PARTS = PART_LABELS.length;

/** Minimal theme fields needed to compute box capacity. */
export interface ThemeForSplit {
  verse_box_width: number;   // % of screen
  verse_box_height: number;  // % of screen
  font_scale: number;
}

const SCREEN_W = 1920;
const SCREEN_H = 1080;
/** Average character width as a fraction of the rendered font size. */
const CHAR_W_RATIO = 0.55;
/** Line height as a fraction of the rendered font size. */
const LINE_H_RATIO = 1.35;
/** Target lines per split part — keeps each part to a readable projection chunk. */
const TARGET_LINES_PER_PART = 3;

export function charsPerPart(fontSize: number, theme?: ThemeForSplit): number {
  if (!theme) {
    // Legacy heuristic — ≈140 chars at 32 px, scales inversely with font size.
    return Math.max(60, Math.round(140 * (32 / fontSize)));
  }

  const size = fontSize * theme.font_scale;
  const boxW = (theme.verse_box_width / 100) * SCREEN_W;
  const boxH = (theme.verse_box_height / 100) * SCREEN_H;
  const charsPerLine = Math.floor(boxW / (size * CHAR_W_RATIO));
  const linesPerBox = Math.floor(boxH / (size * LINE_H_RATIO));
  // Target a comfortable projection chunk (≤ TARGET_LINES_PER_PART lines), not
  // the full box, so long verses produce 3–4 readable parts rather than 1–2
  // near-full screens.
  const linesPerPart = Math.min(linesPerBox, TARGET_LINES_PER_PART);
  return Math.max(60, charsPerLine * linesPerPart);
}

/**
 * Split verse text into parts.  Returns a single-element array when the
 * verse fits in the placeholder — callers use `parts.length > 1` to decide
 * whether to show split UI.
 */
export function splitVerse(text: string, fontSize: number, theme?: ThemeForSplit): string[] {
  const limit = charsPerPart(fontSize, theme);
  const trimmed = text.trim();
  if (trimmed.length <= limit) return [trimmed];

  const parts: string[] = [];
  let rem = trimmed;
  while (rem.length > 0) {
    if (rem.length <= limit || parts.length >= MAX_PARTS - 1) {
      parts.push(rem);
      break;
    }
    // Find the last word boundary at or before the limit; fall back to hard
    // limit only if no space found in the first 40 % of the window.
    const window = rem.slice(0, limit + 1);
    const lastSpace = window.lastIndexOf(" ");
    const cut = lastSpace > Math.floor(limit * 0.4) ? lastSpace : limit;
    parts.push(rem.slice(0, cut).trim());
    rem = rem.slice(cut).trim();
  }
  return parts;
}

export function needsSplit(text: string, fontSize: number, theme?: ThemeForSplit): boolean {
  return splitVerse(text, fontSize, theme).length > 1;
}

/** Short preview string for a part — first 50 chars followed by "…" */
export function partPreview(part: string, maxLen = 50): string {
  const t = part.trim();
  return t.length <= maxLen ? t : `${t.slice(0, maxLen).trimEnd()}…`;
}
