import { FRAME_H, FRAME_W } from "../../lib/themeDraft";

/** Guide lines for the theme canvas. Each grid contributes lines per axis, as
 * a percentage of the frame, so non-square grids (a 16:9 frame) stay honest. */
export type GridId = "center" | "thirds" | "quarters" | "tens" | "fives" | "square" | "safe";

export interface GridLines {
  x: number[];
  y: number[];
}

export interface GridDef {
  id: GridId;
  label: string;
  hint: string;
  lines: (safeMarginPct: number) => GridLines;
  /** How the lines are drawn — heavier for coarse grids so fine ones stay quiet. */
  style: { alpha: number; dashed?: boolean; accent?: boolean };
}

const evenly = (count: number, step: number) => Array.from({ length: count }, (_, i) => (i + 1) * step);
const both = (lines: number[]): GridLines => ({ x: lines, y: lines });

export const GRIDS: GridDef[] = [
  { id: "center", label: "Centre", hint: "Horizontal and vertical middle", lines: () => both([50]), style: { alpha: 0.55 } },
  { id: "thirds", label: "Thirds", hint: "Rule-of-thirds lines", lines: () => both([100 / 3, 200 / 3]), style: { alpha: 0.4 } },
  { id: "quarters", label: "Quarters", hint: "25 / 50 / 75%", lines: () => both([25, 50, 75]), style: { alpha: 0.32 } },
  { id: "tens", label: "10% grid", hint: "Every 10% of the frame", lines: () => both(evenly(9, 10)), style: { alpha: 0.2 } },
  { id: "fives", label: "5% grid", hint: "Fine — every 5%", lines: () => both(evenly(19, 5)), style: { alpha: 0.11 } },
  {
    id: "square",
    label: "Square grid",
    hint: "120 px squares on a 1920×1080 screen",
    lines: () => ({
      x: evenly(15, (120 / FRAME_W) * 100),
      y: evenly(8, (120 / FRAME_H) * 100),
    }),
    style: { alpha: 0.16 },
  },
  {
    id: "safe",
    label: "Safe margins",
    hint: "The theme's safe margin on every side",
    lines: (safe) => both([safe, 100 - safe]),
    style: { alpha: 0.9, dashed: true, accent: true },
  },
];

export interface GridSettings {
  enabled: GridId[];
  snap: boolean;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = { enabled: [], snap: false };

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Union of every enabled grid's lines, de-duplicated and sorted. */
export function activeLines(enabled: GridId[], safeMarginPct: number): GridLines {
  const x = new Set<number>();
  const y = new Set<number>();
  for (const grid of GRIDS) {
    if (!enabled.includes(grid.id)) continue;
    const lines = grid.lines(safeMarginPct);
    lines.x.forEach((v) => x.add(round(v)));
    lines.y.forEach((v) => y.add(round(v)));
  }
  const sort = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return { x: sort(x), y: sort(y) };
}

/** How close (in % of the frame) an edge must be before it snaps. */
export const SNAP_THRESHOLD = 1.2;

export interface Snap {
  /** The adjustment to apply to the value. */
  delta: number;
  /** The grid line it landed on. */
  line: number;
}

/** The closest line to `value` within the threshold, or null. */
export function nearestLine(value: number, lines: number[], threshold = SNAP_THRESHOLD): Snap | null {
  let best: Snap | null = null;
  for (const line of lines) {
    const delta = line - value;
    if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line };
  }
  return best;
}

/**
 * Snap a box being moved along one axis: whichever of its leading edge,
 * centre or trailing edge is nearest a line wins, so a box can be lined up by
 * its middle as easily as by a side.
 */
export function snapMove(start: number, size: number, lines: number[], threshold = SNAP_THRESHOLD): { start: number; line: number | null } {
  let best: Snap | null = null;
  for (const edge of [start, start + size / 2, start + size]) {
    const hit = nearestLine(edge, lines, threshold);
    if (hit && (!best || Math.abs(hit.delta) < Math.abs(best.delta))) best = hit;
  }
  return best ? { start: start + best.delta, line: best.line } : { start, line: null };
}

/** Snap the trailing edge of a box being resized, returning the new size. */
export function snapResize(start: number, size: number, lines: number[], threshold = SNAP_THRESHOLD): { size: number; line: number | null } {
  const hit = nearestLine(start + size, lines, threshold);
  return hit ? { size: size + hit.delta, line: hit.line } : { size, line: null };
}

const STORAGE_KEY = "scriptura.themeDesigner.grid";

/** Remembered per viewer; storage can be unavailable or hold junk, so every
 * access is guarded and falls back to the defaults. */
export function loadGridSettings(): GridSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GRID_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GridSettings>;
    const known = new Set<string>(GRIDS.map((g) => g.id));
    return {
      enabled: Array.isArray(parsed.enabled) ? (parsed.enabled.filter((id) => known.has(id)) as GridId[]) : [],
      snap: parsed.snap === true,
    };
  } catch {
    return DEFAULT_GRID_SETTINGS;
  }
}

export function saveGridSettings(settings: GridSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort only.
  }
}
