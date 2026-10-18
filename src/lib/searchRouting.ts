import { parseScriptureInput, parseVerseJump } from "./scriptureRef";

/**
 * What the Live Show search bar should do with what's been typed.
 *
 * The bar is a single input; the app decides what you meant so there's no mode to
 * remember. Reference vs. word search is guessed from the text, because both are free
 * and instant and a wrong guess costs nothing. Asking the AI is never guessed: it makes a
 * network call that costs money and answers more slowly, so the operator opts in by
 * starting with `?`.
 *
 *   jn 3:16, 1co 2, v5      → reference   (jump to a verse)
 *   love your enemies       → word        (search the text)
 *   /john                   → word        (a leading "/" forces text search)
 *   ? verses about hope     → ask         (natural-language search)
 */
export type QueryRoute =
  | { kind: "empty" }
  | { kind: "reference" }
  | { kind: "word"; text: string }
  | { kind: "ask"; text: string };

export const ASK_PREFIX = "?";
export const WORD_PREFIX = "/";

// Short words that are also book prefixes ("is" → Isaiah, "so" → Song of Solomon,
// "he" → Hebrews). Typed alone they're far more likely the start of a phrase than a
// book, and treating them as books would also make Space "complete" them mid-sentence.
const COMMON_WORDS = new Set([
  "a", "am", "an", "as", "at", "be", "by", "do", "go", "he", "i", "if", "in", "is",
  "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we",
]);

export function routeQuery(raw: string): QueryRoute {
  const s = raw.trimStart();
  if (!s) return { kind: "empty" };

  if (s.startsWith(ASK_PREFIX)) return { kind: "ask", text: s.slice(1).trim() };
  if (s.startsWith(WORD_PREFIX)) return { kind: "word", text: s.slice(1).trim() };

  if (parseVerseJump(s) !== null) return { kind: "reference" };

  const { matchedBook, suggestions } = parseScriptureInput(s);
  if (matchedBook) return { kind: "reference" };
  if (suggestions.length > 0) {
    const bareCommonWord = /^[a-z]+$/i.test(s.trim()) && COMMON_WORDS.has(s.trim().toLowerCase());
    if (!bareCommonWord) return { kind: "reference" };
  }
  return { kind: "word", text: s.trim() };
}
