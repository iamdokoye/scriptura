// The Ask Scripture gateway: checks who's asking, applies their daily limit, then forwards
// the question to the Modal GPU service. All the decisions live here, with the outside
// world (Supabase, Modal) passed in as `deps`, so the logic can be tested without either.

export const MAX_QUERY_CHARS = 500;
export const MAX_TOP_K = 25;
// Stay under Supabase's 150 s request idle timeout (free plan) so a slow Modal cold start
// becomes a clear error instead of a platform 504.
export const UPSTREAM_TIMEOUT_MS = 120_000;

export interface Consumption {
  allowed: boolean;
  reason: string;
  used: number;
  remaining: number;
}

export interface Deps {
  /** The user id for a valid session token, or null. */
  getUserId(jwt: string): Promise<string | null>;
  consume(userId: string, kind: "search" | "warmup"): Promise<Consumption>;
  refund(userId: string): Promise<void>;
  /** Calls the Modal service. Throws on network failure or timeout. */
  callModal(body: { query: string; top_k: number }, signal: AbortSignal): Promise<Response>;
  userLimit: number;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fail(status: number, error: string, message: string): Response {
  return json(status, { error, message });
}

/** Keeps only well-formed hits. The upstream is ours, but its answer is still just input. */
export function cleanHits(raw: unknown): { book: string; chapter: number; verse: number; score: number }[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const hits = [];
  for (const h of results.slice(0, MAX_TOP_K)) {
    if (!h || typeof h !== "object") continue;
    const { book, chapter, verse, score } = h as Record<string, unknown>;
    if (typeof book !== "string" || book.length === 0 || book.length > 40) continue;
    if (!Number.isInteger(chapter) || (chapter as number) < 1) continue;
    if (!Number.isInteger(verse) || (verse as number) < 1) continue;
    hits.push({
      book,
      chapter: chapter as number,
      verse: verse as number,
      score: typeof score === "number" ? score : 0,
    });
  }
  return hits;
}

const LIMIT_MESSAGES: Record<string, string> = {
  user_limit: "You've used all of today's searches. They reset at midnight UTC.",
  global_limit: "Ask Scripture is at capacity for today. Please try again tomorrow.",
  warmup_limit: "Too many requests. Please try again later.",
};

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const userId = jwt ? await deps.getUserId(jwt) : null;
  if (!userId) return fail(401, "unauthorized", "Please sign in to use Ask Scripture.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "The request wasn't valid JSON.");
  }
  const { query: rawQuery, top_k: rawTopK } = (body ?? {}) as Record<string, unknown>;
  if (typeof rawQuery !== "string") return fail(400, "bad_request", "'query' must be a string.");
  const query = rawQuery.split(/\s+/).filter(Boolean).join(" ").slice(0, MAX_QUERY_CHARS);
  const topK = Number.isInteger(rawTopK) ? Math.min(Math.max(rawTopK as number, 1), MAX_TOP_K) : 10;

  // An empty query is the app's warm-up ping: it wakes the GPU container but isn't a search.
  const kind = query === "" ? "warmup" : "search";
  const usage = await deps.consume(userId, kind);
  if (!usage.allowed) {
    return json(429, {
      error: usage.reason,
      message: LIMIT_MESSAGES[usage.reason] ?? "Too many requests.",
      limit: deps.userLimit,
      remaining: usage.remaining,
    });
  }

  let upstream: Response;
  try {
    upstream = await deps.callModal({ query, top_k: topK }, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));
  } catch {
    if (kind === "search") await deps.refund(userId);
    return fail(504, "upstream_timeout", "The search service took too long to respond. Please try again.");
  }
  if (!upstream.ok) {
    if (kind === "search") await deps.refund(userId);
    return fail(502, "upstream_error", "The search service had a problem. Please try again.");
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    if (kind === "search") await deps.refund(userId);
    return fail(502, "upstream_error", "The search service sent an unexpected response.");
  }

  return json(200, {
    results: kind === "warmup" ? [] : cleanHits(data),
    limit: deps.userLimit,
    remaining: usage.remaining,
  });
}
