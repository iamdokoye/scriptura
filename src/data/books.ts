/** All 66 canonical books in Bible order. */
export const BIBLE_BOOKS: readonly string[] = [
  // OT
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
  // NT
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
  "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
];

/**
 * Common abbreviations that don't naturally work with prefix matching.
 * "jn" → John is the classic case — "john" doesn't start with "jn".
 */
const ABBR: Record<string, string> = {
  jn: "John",
  sg: "Song of Solomon",
  sos: "Song of Solomon",
  ss: "Song of Solomon",
  phm: "Philemon",
  phlm: "Philemon",
};

/**
 * Return all books whose name starts with `prefix` (case-insensitive),
 * in canonical order. Strips spaces before comparing so "1co" matches
 * "1 Corinthians", "1sa" matches "1 Samuel", etc.
 * Falls back to an abbreviation table for non-prefix-matchable shorthands.
 */
export function findBooks(prefix: string): string[] {
  if (!prefix.trim()) return [];
  const needle = prefix.toLowerCase().replace(/\s+/g, "");

  const prefixMatches = BIBLE_BOOKS.filter((book) => {
    const hay = book.toLowerCase();
    return hay.startsWith(needle) || hay.replace(/\s+/g, "").startsWith(needle);
  }) as string[];

  // If no prefix match, check the abbreviation table
  const abbrTarget = ABBR[needle];
  if (abbrTarget && !prefixMatches.includes(abbrTarget)) {
    return [abbrTarget, ...prefixMatches];
  }

  return prefixMatches;
}
