import { invoke } from "@tauri-apps/api/core";
import { BIBLE_BOOKS } from "../data/books";
import type { VerseRef } from "../store/app";
import { getSupabase } from "./supabase";

/** A verse the search service believes matches the question. Text comes from the user's own module. */
export interface AiHit extends VerseRef {
  score: number;
}

export interface AiSearchStatus {
  configured: boolean;
  endpoint: string;
  key_id: string;
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
 * holds the Modal credentials, applies the daily limit and forwards to the GPU service.
 */
export async function searchViaAccount(query: string, topK = 12): Promise<{ hits: unknown; quota?: Quota }> {
  const supabase = getSupabase();
  if (!supabase) throw new AiSearchError("Accounts aren't available in this build.");

  const { data, error } = await supabase.functions.invoke("search", { body: { query, top_k: topK } });
  if (error) {
    // For an HTTP error the gateway's JSON body rides on error.context (a Response).
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const body = await ctx.json().catch(() => null) as { message?: unknown; remaining?: unknown; limit?: unknown } | null;
      const quota = typeof body?.remaining === "number" && typeof body?.limit === "number"
        ? { remaining: body.remaining, limit: body.limit }
        : undefined;
      if (typeof body?.message === "string") throw new AiSearchError(body.message, quota);
      if (ctx.status === 401) throw new AiSearchError("Your session has expired. Please sign in again.");
    }
    throw new AiSearchError("Couldn't reach the search service. Check your connection and try again.");
  }

  const body = (data ?? {}) as { results?: unknown; remaining?: unknown; limit?: unknown };
  const quota = typeof body.remaining === "number" && typeof body.limit === "number"
    ? { remaining: body.remaining, limit: body.limit }
    : undefined;
  return { hits: body.results, quota };
}

/** For a self-hosted server: the Rust side holds the URL and token and makes the request. */
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
