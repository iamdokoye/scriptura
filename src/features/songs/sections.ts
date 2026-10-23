import type { SongSection } from "./api";

export const SECTION_KINDS = [
  { prefix: "v", name: "Verse", numbered: true },
  { prefix: "c", name: "Chorus", numbered: false },
  { prefix: "p", name: "Pre-Chorus", numbered: false },
  { prefix: "b", name: "Bridge", numbered: false },
  { prefix: "t", name: "Tag", numbered: false },
  { prefix: "i", name: "Intro", numbered: false },
  { prefix: "o", name: "Outro", numbered: false },
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

/** A blank section of the given kind, with a key and label unused by `existing`. */
export function newSection(kind: SectionKind, existing: SongSection[]): SongSection {
  const keys = new Set(existing.map((s) => s.key));
  const labels = new Set(existing.map((s) => s.label));
  let n = 1;
  for (;;) {
    const unnumbered = !kind.numbered && n === 1;
    const key = unnumbered ? kind.prefix : `${kind.prefix}${n}`;
    const label = unnumbered ? kind.name : `${kind.name} ${n}`;
    if (!keys.has(key) && !labels.has(label)) return { key, label, lyrics: "" };
    n += 1;
  }
}

/** Duplicate a section under a fresh key. */
export function cloneSection(src: SongSection, existing: SongSection[]): SongSection {
  const keys = new Set(existing.map((s) => s.key));
  let n = 2;
  while (keys.has(`${src.key}_${n}`)) n += 1;
  return { key: `${src.key}_${n}`, label: `${src.label} (copy)`, lyrics: src.lyrics };
}

/** Label-bar colours, by section kind (the key's leading letter). */
export function sectionColor(key: string): string {
  switch (key.charAt(0).toLowerCase()) {
    case "v": return "rgb(59 91 182)";   // verse: blue
    case "c": return "rgb(150 52 74)";   // chorus: crimson
    case "b": return "rgb(46 125 90)";   // bridge: green
    case "p": return "rgb(122 78 160)";  // pre-chorus: violet
    default: return "rgb(110 110 118)";  // tag / intro / outro / other
  }
}
