/**
 * Verse splitting — determines whether a verse needs to be broken into
 * screen-sized parts (a, b, c…) and where to cut it.
 *
 * The primary split path is DOM-measurement: `measureVersePartsDOM()` renders
 * text into a hidden off-screen element sized exactly like the real
 * presentation box and binary-searches word boundaries to find where each part
 * ends. This is called:
 *
 *   • In `PresentationView.tsx` using `window.innerWidth/Height` (the actual
 *     presentation screen dimensions).
 *   • In `ReadingView.tsx` using the presentation monitor dimensions from the
 *     Tauri MonitorInfo API so the operator console agrees with the output.
 *
 * The old character-counting helpers (`splitVerse`, `capacityDims`, etc.) are
 * kept for fallback and for contexts where DOM measurement isn't practical.
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
  /** Actual (max) font size — used to decide whether splitting is needed. */
  maxFontSize?: number;
}

const SCREEN_W = 1920;
const SCREEN_H = 1080;
/** Average character width as a fraction of the rendered font size.
 *  0.65 matches real bold/serif fonts better than 0.55, keeping thresholds realistic. */
const CHAR_W_RATIO = 0.65;
/** Line height as a fraction of the rendered font size. */
const LINE_H_RATIO = 1.6;
/** Target lines per split part — 2 lines per part keeps splits tight and readable. */
const TARGET_LINES_PER_PART = 2;

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
 * Character capacity of one split part. Uses the actual (max) rendering font
 * size with a TARGET_LINES_PER_PART line cap — same heuristic as the original
 * split logic — so a verse splits when it would need more than ~3 lines at
 * the user's configured font, not only when it can't fit even at the shrink
 * floor.
 */
export function charsPerPart(dims: CapacityDims, theme?: ThemeForSplit): number {
  const fontSize = dims.maxFontSize ?? dims.minFontSize;
  if (!theme) {
    // Legacy heuristic — ≈140 chars at 32 px, scales inversely with font size.
    return Math.max(60, Math.round(140 * (32 / fontSize)));
  }
  const { charsPerLine, linesPerBox } = charsForBox(fontSize, dims, theme.font_scale);
  const linesPerPart = Math.min(linesPerBox, TARGET_LINES_PER_PART);
  return Math.max(60, charsPerLine * linesPerPart);
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

// ── DOM-based split (accurate, no hardcoded ratios) ───────────────────────────

export interface MeasureTextStyle {
  fontFamily: string;
  /** Rendered font size in pixels (already scaled by font_scale). */
  fontSizePx: number;
  lineHeight: number;
  fontWeight?: number;
  textAlign?: string;
}

/**
 * Splits `text` into parts that each fit inside a box of `widthPx × heightPx`
 * at the given text style, using actual browser layout instead of hardcoded
 * character-width ratios. A temporary hidden element is created, measured, and
 * immediately removed — no lasting DOM side effects.
 *
 * Every part — including the last one — is measured against the same
 * `heightPx` budget (the real on-screen box), so each slide fills the screen
 * properly and no part is left to overflow. The loop keeps cutting off
 * screen-sized chunks until the remainder actually fits in one box; `maxParts`
 * is a generous safety valve, not a target, so a Bible-longest verse like
 * Esther 8:9 still gets split fully instead of having its tail squeezed into
 * one final oversized part.
 *
 * Returns a single-element array when the full text fits.
 */
export function measureVersePartsDOM(
  text: string,
  widthPx: number,
  heightPx: number,
  style: MeasureTextStyle,
  maxParts = 20,
): string[] {
  const trimmed = text.trim();
  if (!trimmed || widthPx <= 0 || heightPx <= 0) return [trimmed];

  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "fixed",
    top: "-99999px",
    left: "-99999px",
    width: `${widthPx}px`,
    maxHeight: `${heightPx}px`,
    overflow: "hidden",
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSizePx}px`,
    lineHeight: String(style.lineHeight),
    fontWeight: String(style.fontWeight ?? 600),
    textAlign: style.textAlign ?? "left",
    whiteSpace: "normal",
    wordBreak: "break-word",
    boxSizing: "border-box",
    padding: "0",
    margin: "0",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.appendChild(el);

  try {
    el.textContent = trimmed;
    // Full text fits in the box — no split needed
    if (el.scrollHeight <= el.clientHeight) return [trimmed];

    const parts: string[] = [];
    let remaining = trimmed;

    while (remaining.length > 0 && parts.length < maxParts - 1) {
      const words = remaining.split(" ");

      if (words.length <= 1) {
        parts.push(remaining);
        remaining = "";
        break;
      }

      // Does the whole remainder already fit in one box? Then this is the
      // last part — no further cutting needed.
      el.textContent = remaining;
      if (el.scrollHeight <= el.clientHeight) {
        parts.push(remaining);
        remaining = "";
        break;
      }

      // Guard: if even the first word alone overflows the box, push
      // everything remaining (degenerate long word — let the box wrap it).
      el.textContent = words[0];
      if (el.scrollHeight > el.clientHeight) {
        parts.push(remaining);
        remaining = "";
        break;
      }

      // Binary search for the largest word prefix that still fits in the box.
      let lo = 0;
      let hi = words.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        el.textContent = words.slice(0, mid + 1).join(" ");
        if (el.scrollHeight <= el.clientHeight) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }

      parts.push(words.slice(0, lo + 1).join(" "));
      remaining = words.slice(lo + 1).join(" ").trim();
    }

    if (remaining.length > 0) parts.push(remaining);
    return parts.length > 0 ? parts : [trimmed];
  } finally {
    document.body.removeChild(el);
  }
}
