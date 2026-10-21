import { invoke } from "@tauri-apps/api/core";
import { BIBLE_BOOKS, normalizeBookName } from "../data/books";
import type { VerseRef } from "../store/app";
import { getSupabase } from "./supabase";

/**
 * How sure the service is about a result. "match" and "related" were checked against the real
 * text of the passage; "unverified" means that check couldn't run, so look before you show it.
 */
export type Confidence = "match" | "related" | "unverified";

/** A verse the search service believes matches the question. Text comes from the user's own module. */
export interface AiHit extends VerseRef {
  score: number;
  confidence?: Confidence;
  endVerse?: number;
}

export interface AiSearchStatus {
  configured: boolean;
  endpoint?: string;
  key_id?: string;
  claude_configured: boolean;
  claude_model: string;
}

/** What a search through a Scriptura account returns besides the verses. */
export interface Quota {
  remaining: number;
  limit: number;
}

/** A search that failed, with a message that's safe to show the person. */
export class AiSearchError extends Error {
  constructor(message: string, readonly quota?: Quota) {
    super(message);
  }
}

/**
 * Searches through the signed-in account's gateway (the Supabase Edge Function), which
 * enforces daily plan quotas and verifies passages with Claude Haiku 5.5.
 */
export async function searchViaAccount(query: string, topK = 10): Promise<{ hits: unknown; quota?: Quota }> {
  const supabase = getSupabase();
  if (!supabase) throw new AiSearchError("Accounts aren't available in this build.");

  const { data, error } = await supabase.functions.invoke("search", { body: { query, top_k: topK } });
  if (error) {
    // For an HTTP error the gateway's JSON body rides on error.context (a Response).
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const body = (await ctx.json().catch(() => null)) as {
        error?: unknown;
        message?: unknown;
        remaining?: unknown;
        limit?: unknown;
      } | null;

      const quota =
        typeof body?.remaining === "number" && typeof body?.limit === "number"
          ? { remaining: body.remaining, limit: body.limit }
          : undefined;

      if (ctx.status === 401) {
        throw new AiSearchError("Your session has expired. Please sign in again.");
      }
      if (ctx.status === 429) {
        const msg =
          typeof body?.message === "string"
            ? body.message
            : "You've used all of today's searches. They reset at midnight UTC.";
        throw new AiSearchError(msg, quota);
      }
      if (ctx.status === 504) {
        throw new AiSearchError("The search service took too long to respond. Please try again.");
      }
      if (ctx.status === 502) {
        throw new AiSearchError("The search service had a problem. Please try again.");
      }
      if (typeof body?.message === "string") {
        throw new AiSearchError(body.message, quota);
      }
    }
    throw new AiSearchError("Couldn't reach the search service. Check your connection and try again.");
  }

  const body = (data ?? {}) as { results?: unknown; remaining?: unknown; limit?: unknown };
  const quota =
    typeof body.remaining === "number" && typeof body.limit === "number"
      ? { remaining: body.remaining, limit: body.limit }
      : undefined;

  return { hits: body.results, quota };
}

/** Self-hosted server: the Rust side holds the URL and token and makes the request. */
export const aiSearchApi = {
  status: () => invoke<AiSearchStatus>("ai_search_status"),
  configure: (endpoint: string, keyId: string, keySecret: string) =>
    invoke<AiSearchStatus>("ai_search_configure", { endpoint, keyId, keySecret }),
  clear: () => invoke<AiSearchStatus>("ai_search_clear"),
  /** An empty query is a warm-up ping that returns no hits. */
  query: (query: string, topK = 10) =>
    invoke<AiHit[]>("ai_search_query", { query, topK }),
};

/** Direct Anthropic key: user supplies their own Anthropic API key stored locally in Rust. */
export const claudeApi = {
  status: () => invoke<AiSearchStatus>("ai_search_status"),
  save: (apiKey: string, model?: string) =>
    invoke<AiSearchStatus>("claude_api_key_save", { apiKey, model: model ?? null }),
  clear: () => invoke<AiSearchStatus>("claude_api_key_clear"),
  query: (query: string) =>
    invoke<AiHit[]>("claude_search_query", { query }),
};

const BOOK_SET = new Set(BIBLE_BOOKS);

/**
 * Keeps only hits that name a real book with a positive chapter and verse, and drops
 * repeats. Normalizes book aliases like "Psalm" to "Psalms".
 */
export function sanitizeHits(raw: unknown): AiHit[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const hits: AiHit[] = [];

  for (const h of raw) {
    if (!h || typeof h !== "object") continue;
    const { book, chapter, verse, score, confidence, end_verse, endVerse } = h as Record<string, unknown>;

    const normBook = typeof book === "string" ? normalizeBookName(book) : null;
    if (!normBook || !BOOK_SET.has(normBook)) continue;
    if (!Number.isInteger(chapter) || (chapter as number) < 1) continue;
    if (!Number.isInteger(verse) || (verse as number) < 1) continue;

    const end =
      typeof end_verse === "number" && end_verse > (verse as number)
        ? end_verse
        : typeof endVerse === "number" && endVerse > (verse as number)
          ? endVerse
          : undefined;

    const key = `${normBook}|${chapter}|${verse}|${end ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    hits.push({
      book: normBook,
      chapter: chapter as number,
      verse: verse as number,
      score: typeof score === "number" ? score : 0,
      confidence:
        confidence === "match" || confidence === "related" || confidence === "unverified"
          ? (confidence as Confidence)
          : undefined,
      endVerse: end,
    });
  }

  return hits;
}

/** Tauri rejects with the error string; anything else gets a generic message. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string" && e) return e;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong";
}
