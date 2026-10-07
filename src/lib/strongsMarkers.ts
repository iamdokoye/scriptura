/** "G03588" / "H0853" / "G3588a" → "G3588" / "H853" / "G3588". Source modules pad and suffix numbers inconsistently. */
export function normalizeStrongs(raw: string): string {
  const m = /^([GgHh])0*(\d+)/.exec(raw.trim());
  return m ? `${m[1].toUpperCase()}${m[2]}` : raw;
}

/**
 * The Strong's numbers worth showing for a word: grammatical markers (the
 * Greek article, the Hebrew direct-object marker…) are dropped so "his hand"
 * offers only the real word, not "G3588 G5495". A word carrying only
 * markers comes back empty and renders as plain text.
 */
export function contentStrongs(numbers: readonly string[], markers: ReadonlySet<string>): string[] {
  if (markers.size === 0) return [...numbers];
  return numbers.filter((n) => !markers.has(normalizeStrongs(n)));
}
