/**
 * Verse splitting — breaks a verse into screen-sized parts (a, b, c…) only
 * when even the smallest allowed font (the theme's shrink floor) still can't
 * fit the full text in the box the ACTIVE presentation context actually
 * renders into. Auto-layout shrinking always gets first refusal: a verse
 * that fits once shrunk to the floor is never split, only shrunk.
 *
 * Capacity is derived from the real box for the active presentation context:
 *   • ctx 1 (single verse)     → the theme's verse_box_width/height
 *   • ctx 2/3 (context rows)   → the fixed 60vh / 50vh active-row height
 *   • ctx 4 (chapter scroll)   → the fixed active-verse max-height clamp
 * via `capacityDims()`, and the floor font size via `minFontFor()` — both
 * exported so `PresentationView.tsx` (the presentation output window) and
 * `ReadingView.tsx` / `VersePanes.tsx` (the operator's own console) derive
 * identical inputs and therefore always agree on where a verse splits.
 *
 * The 1920 × 1080 reference frame is used for the percentage→pixel conversion.
 */

export type PresentationContext = 1 | 2 | 3 | 4;

export const PART_LABELS = ["a", "b", "c", "d"] as const;
export type PartLabel = (typeof PART_LABELS)[number];

/** Maximum number of parts a verse can be split into. */
const MAX_PARTS = PART_LABELS.length;

/** Minimal theme fields needed to compute box capacity / shrink floor. */
export interface ThemeForSplit {
  verse_box_width: number;   // % of screen, ctx=1 only
  verse_box_height: number;  // % of screen, ctx=1 only
  font_scale: number;
  auto_layout?: boolean;
  min_font_scale?: number;
}

/** Real box capacity for a given presentation context, in % of the 1920×1080 frame. */
export interface CapacityDims {
  widthPct: number;
  heightPct: number;
  /** Smallest font (px) the box is ever shrunk to before splitting kicks in. */
  minFontSize: number;
}

const SCREEN_W = 1920;
const SCREEN_H = 1080;
/** Average character width as a fraction of the rendered font size. */
const CHAR_W_RATIO = 0.55;
/** Line height as a fraction of the rendered font size. */
const LINE_H_RATIO = 1.35;

/** ctx 2/3's fixed active-row height (matches PresentationView's `activeRowHeight`). */
const ACTIVE_ROW_HEIGHT_VH: Record<2 | 3, number> = { 2: 60, 3: 50 };
/** ctx 4's fixed active-verse max-height clamp (matches `ACTIVE_VERSE_MAX_HEIGHT_VH`). */
const SCROLL_ACTIVE_MAX_HEIGHT_VH = 75;

/**
 * The smallest font a verse will ever be shrunk to before splitting should
 * be considered — mirrors `ShrinkingVerseText`'s own `minSize` calculation
 * in PresentationView.tsx so the two never disagree.
 */
export function minFontFor(theme: ThemeForSplit | null | undefined, maxFontSize: number): number {
  if (!theme) return 24;
  return theme.auto_layout
    ? Math.max(14, maxFontSize * (theme.min_font_scale ?? 1))
    : maxFontSize;
}

/**
 * Real box dimensions (as % of the 1920×1080 reference frame) for the given
 * presentation context. `hPadPct` is the horizontal safe-margin percentage
 * already used to lay out that context (theme's `safe_margin`, or the
 * margins-derived fallback) and `gutterPct` is an extra width deduction for
 * ctx 4's verse-number column.
 */
export function capacityDims(
  ctx: PresentationContext,
  theme: ThemeForSplit | null | undefined,
  hPadPct: number,
  gutterPct = 0,
): { widthPct: number; heightPct: number } {
  if (ctx === 1) {
    if (theme) return { widthPct: theme.verse_box_width, heightPct: theme.verse_box_height };
    // No theme — ctx 1 falls back to VerseColumn's plain centered box.
    return { widthPct: 100 - 2 * hPadPct, heightPct: 100 };
  }
  const widthPct = Math.max(10, 100 - 2 * hPadPct - gutterPct);
  if (ctx === 2 || ctx === 3) return { widthPct, heightPct: ACTIVE_ROW_HEIGHT_VH[ctx] };
  return { widthPct, heightPct: SCROLL_ACTIVE_MAX_HEIGHT_VH }; // ctx 4
}

function charsForBox(fontSize: number, dims: { widthPct: number; heightPct: number }, fontScale = 1): { charsPerLine: number; linesPerBox: number } {
  const size = fontSize * fontScale;
  const boxW = (dims.widthPct / 100) * SCREEN_W;
  const boxH = (dims.heightPct / 100) * SCREEN_H;
  return {
    charsPerLine: Math.max(1, Math.floor(boxW / (size * CHAR_W_RATIO))),
    linesPerBox: Math.max(1, Math.floor(boxH / (size * LINE_H_RATIO))),
  };
}

/**
 * Character capacity of one split part, computed at the box's shrink floor
 * (`dims.minFontSize`) so a verse only splits once shrinking alone — down to
 * that floor — genuinely can't fit it, and each part uses the box's full
 * line capacity at that size rather than an arbitrary line target.
 */
export function charsPerPart(dims: CapacityDims, theme?: ThemeForSplit): number {
  if (!theme) {
    // Legacy heuristic — ≈140 chars at 32 px, scales inversely with font size.
    return Math.max(60, Math.round(140 * (32 / dims.minFontSize)));
  }
  const { charsPerLine, linesPerBox } = charsForBox(dims.minFontSize, dims, theme.font_scale);
  return Math.max(60, charsPerLine * linesPerBox);
}

/**
 * Split verse text into parts. Returns a single-element array when the verse
 * fits the box at its shrink floor — callers use `parts.length > 1` to
 * decide whether to show split UI.
 */
export function splitVerse(text: string, dims: CapacityDims, theme?: ThemeForSplit): string[] {
  const limit = charsPerPart(dims, theme);
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

export function needsSplit(text: string, dims: CapacityDims, theme?: ThemeForSplit): boolean {
  return splitVerse(text, dims, theme).length > 1;
}

/** Short preview string for a part — first 50 chars followed by "…" */
export function partPreview(part: string, maxLen = 50): string {
  const t = part.trim();
  return t.length <= maxLen ? t : `${t.slice(0, maxLen).trimEnd()}…`;
}
