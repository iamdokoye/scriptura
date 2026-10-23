import type { Song, SongSection } from "./api";

export interface Slide {
  sectionKey: string;
  label: string;
  /** 1-based position within the section when it spans several slides. */
  part: number;
  parts: number;
  text: string;
}

export const MIN_LINES = 1;
export const MAX_LINES = 10;
export const DEFAULT_MAX_LINES = 4;

/** The order sections are played in: the arrangement, or stored order if none. */
export function playOrder(song: Pick<Song, "sections" | "arrangement">): SongSection[] {
  if (song.arrangement.length === 0) return song.sections;
  const byKey = new Map(song.sections.map((s) => [s.key, s]));
  return song.arrangement.map((k) => byKey.get(k)).filter((s): s is SongSection => !!s);
}

/**
 * Split lines into slides of at most `max` lines, as evenly as possible (a 5-line
 * block at max 4 becomes 3 + 2, not 4 + 1) and preferring an even count so
 * couplets stay together.
 */
export function chunkLines(lines: string[], max: number): string[][] {
  const cap = Math.min(MAX_LINES, Math.max(MIN_LINES, Math.floor(max)));
  if (lines.length <= cap) return lines.length ? [lines] : [];
  const parts = Math.ceil(lines.length / cap);
  let size = Math.ceil(lines.length / parts);
  // Round odd sizes up to keep couplets together, unless that strands a lone last line.
  if (size % 2 === 1 && size + 1 <= cap && Math.ceil(lines.length / (size + 1)) === parts) {
    const rest = lines.length % (size + 1);
    if (rest === 0 || rest >= 2) size += 1;
  }
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size));
  return out;
}

/**
 * One section -> slides. A blank line inside the lyrics is an explicit slide
 * break; every resulting block is then split further if it exceeds `maxLines`.
 */
export function sectionSlides(section: SongSection, maxLines: number): Slide[] {
  const blocks = section.lyrics
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== ""))
    .filter((b) => b.length > 0);
  const chunks = blocks.flatMap((b) => chunkLines(b, maxLines));
  return chunks.map((lines, i) => ({
    sectionKey: section.key,
    label: section.label,
    part: i + 1,
    parts: chunks.length,
    text: lines.join("\n"),
  }));
}

/** The full slide sequence for a song, following its arrangement. */
export function buildSlides(song: Pick<Song, "sections" | "arrangement">, maxLines: number): Slide[] {
  return playOrder(song).flatMap((s) => sectionSlides(s, maxLines));
}
