import { BIBLE_BOOKS, findBooks } from "../data/books";

// Longest-first so "1 Corinthians" is tried before "1 Chronicles"
const BOOKS_BY_LENGTH = [...BIBLE_BOOKS].sort((a, b) => b.length - a.length);

function parseRef(ref: string): { chapter: number | null; verse: number | null } {
  const s = ref.trim();
  if (!s) return { chapter: null, verse: null };
  const idx = s.indexOf(":");
  if (idx >= 0) {
    return {
      chapter: parseInt(s.slice(0, idx)) || null,
      verse: parseInt(s.slice(idx + 1)) || null,
    };
  }
  return { chapter: parseInt(s) || null, verse: null };
}

export interface ParsedScriptureInput {
  bookPart: string;
  refPart: string;
  matchedBook: string | null;
  suggestions: string[];
  chapter: number | null;
  verse: number | null;
}

/** Reads typed text as "book [chapter[:verse]]": "jn 3:16", "1co 2", "gen". */
export function parseScriptureInput(raw: string): ParsedScriptureInput {
  const input = raw.trimStart();
  if (!input) {
    return { bookPart: "", refPart: "", matchedBook: null, suggestions: [], chapter: null, verse: null };
  }

  // 1. Try to match a complete book name at the start (longest match wins)
  for (const book of BOOKS_BY_LENGTH) {
    if (input.toLowerCase().startsWith(book.toLowerCase())) {
      const after = input.slice(book.length).trimStart();
      if (!after || /^\d/.test(after)) {
        const { chapter, verse } = parseRef(after);
        return { bookPart: book, refPart: after, matchedBook: book, suggestions: [book], chapter, verse };
      }
    }
  }

  // 2. Partial: split at first "word(s) then space then digits" boundary
  //    handles "gen 1:2", "1 sam 3:5", "1co 2:3"
  const spaceRef = input.match(/^(.*?)\s+(\d[\d:]*)$/);
  const bookPart = spaceRef ? spaceRef[1] : input;
  const refPart = spaceRef ? spaceRef[2] : "";

  const suggestions = findBooks(bookPart);
  const { chapter, verse } = parseRef(refPart);
  return { bookPart, refPart, matchedBook: null, suggestions, chapter, verse };
}

/** "v5", "V10" — jump to that verse in the current book + chapter. */
export function parseVerseJump(raw: string): number | null {
  const m = /^v(\d+)$/i.exec(raw.trim());
  return m ? parseInt(m[1]) : null;
}
