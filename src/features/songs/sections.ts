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

/**
 * A blank section of the given kind. The number comes from the labels in use, not
 * the keys: if "Verse 2" was renamed "Chorus", the next verse is "Verse 2" again.
 * The key only has to be unique.
 */
export function newSection(kind: SectionKind, existing: SongSection[]): SongSection {
  const keys = new Set(existing.map((s) => s.key));
  const labels = new Set(existing.map((s) => s.label.trim().toLowerCase()));
  let n = 1;
  for (;;) {
    const unnumbered = !kind.numbered && n === 1;
    const label = unnumbered ? kind.name : `${kind.name} ${n}`;
    if (!labels.has(label.toLowerCase())) {
      let key = unnumbered ? kind.prefix : `${kind.prefix}${n}`;
      for (let k = 2; keys.has(key); k++) key = `${unnumbered ? kind.prefix : `${kind.prefix}${n}`}_${k}`;
      return { key, label, lyrics: "" };
    }
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

/** Which kind a typed section name belongs to ("Refrain 2" -> chorus), or "other". */
export function sectionKind(label: string): string {
  const w = label.trim().toLowerCase();
  if (/^(verse|v)\b|^v\d/.test(w)) return "v";
  if (/^(chorus|refrain|ref|ch|c)\b|^c\d/.test(w)) return "c";
  if (/^(pre[- ]?chorus|pre|pc|p)\b/.test(w)) return "p";
  if (/^(bridge|b)\b|^b\d/.test(w)) return "b";
  return "other";
}

/** Label-bar colour for a section name. Follows the name as it is typed. */
export function sectionColor(label: string): string {
  switch (sectionKind(label)) {
    case "v": return "rgb(59 91 182)";   // verse: blue
    case "c": return "rgb(150 52 74)";   // chorus / refrain: crimson
    case "b": return "rgb(46 125 90)";   // bridge: green
    case "p": return "rgb(122 78 160)";  // pre-chorus: violet
    default: return "rgb(110 110 118)";  // tag / intro / outro / other
  }
}
