import { invoke } from "@tauri-apps/api/core";
import { BIBLE_BOOKS } from "../data/books";
import type { VerseRef } from "../store/app";

/** A verse the search service believes matches the question. Text comes from the user's own module. */
export interface AiHit extends VerseRef {
  score: number;
}

export interface AiSearchStatus {
  configured: boolean;
  endpoint: string;
  key_id: string;
}

export const aiSearchApi = {
  status: () => invoke<AiSearchStatus>("ai_search_status"),
  configure: (endpoint: string, keyId: string, keySecret: string) =>
    invoke<AiSearchStatus>("ai_search_configure", { endpoint, keyId, keySecret }),
  clear: () => invoke<void>("ai_search_clear"),
  /** An empty query is a warm-up ping that returns no hits. */
  query: (query: string, topK = 12) =>
    invoke<AiHit[]>("ai_search_query", { query, topK }),
};

const BOOK_SET = new Set(BIBLE_BOOKS);

/**
 * Keeps only hits that name a real book with a positive chapter and verse, and drops
 * repeats. The service is ours, but its answer crosses a network, so the UI never
 * trusts it to be well-formed before turning a hit into navigation.
 */
export function sanitizeHits(raw: unknown): AiHit[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const hits: AiHit[] = [];
  for (const h of raw) {
    if (!h || typeof h !== "object") continue;
    const { book, chapter, verse, score } = h as Record<string, unknown>;
    if (typeof book !== "string" || !BOOK_SET.has(book)) continue;
    if (!Number.isInteger(chapter) || (chapter as number) < 1) continue;
    if (!Number.isInteger(verse) || (verse as number) < 1) continue;
    const key = `${book}|${chapter}|${verse}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ book, chapter: chapter as number, verse: verse as number, score: typeof score === "number" ? score : 0 });
  }
  return hits;
}

/** Tauri rejects with the error string; anything else gets a generic message. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string" && e) return e;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong";
}
