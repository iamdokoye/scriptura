// Pure Ask Scripture gateway handler: checks authentication, enforces daily quota,
// coordinates Claude nomination and verification, validates against the real KJV database,
// and records token usage. All I/O is injected via Deps for unit testing.

export const MAX_QUERY_CHARS = 500;
export const MAX_TOP_K = 15;
export const DEFAULT_TOP_K = 10;
export const MAX_NOMINATIONS = 12;
export const MAX_PASSAGE_VERSES = 40;
export const PASSAGE_TEXT_VERSES = 6;

export const NOMINATE_TIMEOUT_MS = 20_000;
export const VERIFY_TIMEOUT_MS = 40_000;
export const TOTAL_TIMEOUT_MS = 100_000;

export type Confidence = "match" | "related" | "unverified";

export interface Hit {
  book: string;
  chapter: number;
  verse: number;
  end_verse?: number;
  score: number;
  confidence: Confidence;
}

export interface NominatedPassage {
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
}

export interface ValidatedPassage {
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  text: string;
}

export interface Consumption {
  allowed: boolean;
  reason: string;
  used: number;
  remaining: number;
}

export interface Quota {
  limit: number;
  remaining: number;
}

export interface NominationResult {
  passages: NominatedPassage[];
  inputTokens: number;
  outputTokens: number;
}

export interface VerificationResult {
  verdicts: Map<number, "match" | "related" | "no"> | null;
  inputTokens: number;
  outputTokens: number;
}

export interface ChapterSpan {
  minVerse: number;
  maxVerse: number;
}

export interface Deps {
  getUserId(jwt: string): Promise<string | null>;
  consume(userId: string, kind: "search" | "warmup"): Promise<Consumption>;
  refund(userId: string): Promise<void>;
  recordUsage(userId: string, inputTokens: number, outputTokens: number): Promise<void>;
  getQuota?(userId: string): Promise<Quota>;

  // Passage validation against real KJV database:
  lookupChapterSpans(
    pairs: Array<{ book: string; chapter: number }>
  ): Promise<Map<string, ChapterSpan>>;
  fetchPassageTexts(
    passages: Array<{ book: string; chapter: number; verse_start: number; verse_end: number }>
  ): Promise<Map<string, string>>;

  // Claude stages:
  nominate(query: string, signal: AbortSignal): Promise<NominationResult>;
  verify(query: string, passages: ValidatedPassage[], signal: AbortSignal): Promise<VerificationResult>;

  // Optional legacy Modal backend:
  callModal?(body: { query: string; top_k: number }, signal: AbortSignal): Promise<Response>;
  backend?: "claude" | "modal";

  userLimit: number;
  log?(data: Record<string, unknown>): void;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function fail(status: number, error: string, message: string): Response {
  return json(status, { error, message });
}

export const LIMIT_MESSAGES: Record<string, string> = {
  user_limit: "You've used all of today's searches. They reset at midnight UTC.",
  global_limit: "Ask Scripture is at capacity for today. Please try again tomorrow.",
  warmup_limit: "Too many requests. Please try again later.",
};

export const VERDICTS = new Set(["match", "related", "no"]);

/**
 * Validates nominated passages against real chapter spans from kjv_verses.
 * - Drops unknown books/chapters.
 * - Swaps reversed verse numbers.
 * - Clamps verse numbers into the real chapter.
 * - Caps passage at 40 verses.
 * - Dedupes and caps at 12 passages.
 */
export function validateNominatedPassages(
  nominations: NominatedPassage[],
  spans: Map<string, ChapterSpan>
): Array<{ book: string; chapter: number; verse_start: number; verse_end: number }> {
  const result: Array<{ book: string; chapter: number; verse_start: number; verse_end: number }> = [];
  const seen = new Set<string>();

  for (const n of nominations) {
    if (!n || typeof n !== "object") continue;
    const { book, chapter, verse_start, verse_end } = n;
    if (typeof book !== "string" || !Number.isInteger(chapter) || chapter < 1) continue;
    if (!Number.isInteger(verse_start) || !Number.isInteger(verse_end)) continue;

    const spanKey = `${book}:${chapter}`;
    const span = spans.get(spanKey);
    if (!span) {
      // Unknown book or chapter does not exist in KJV
      continue;
    }

    let start = verse_start;
    let end = verse_end;
    if (end < start) {
      const tmp = start;
      start = end;
      end = tmp;
    }

    // Clamp into the real chapter
    start = Math.max(span.minVerse, Math.min(span.maxVerse, start));
    end = Math.max(span.minVerse, Math.min(span.maxVerse, end));

    // Cap at MAX_PASSAGE_VERSES (40)
    if (end - start + 1 > MAX_PASSAGE_VERSES) {
      end = start + MAX_PASSAGE_VERSES - 1;
    }

    const passageKey = `${book}:${chapter}:${start}:${end}`;
    if (seen.has(passageKey)) continue;
    seen.add(passageKey);

    result.push({ book, chapter, verse_start: start, verse_end: end });
    if (result.length >= MAX_NOMINATIONS) break;
  }

  return result;
}

/**
 * Applies verifier verdicts according to modal_app.py logic:
 * - If verdicts is null (verification failed/timed out/refused): mark all as "unverified" (NEVER "match").
 * - If verdicts are present:
 *   - "match" first, then "related" (preserving nomination order within each group).
 *   - "no" or unmentioned candidates are dropped.
 *   - Scores are descending in (0, 1].
 */
export function applyVerdicts(
  passages: ValidatedPassage[],
  verdicts: Map<number, "match" | "related" | "no"> | null,
  topK: number
): Hit[] {
  if (verdicts === null) {
    // Unverified fallback
    return passages.slice(0, topK).map((p, idx) => ({
      book: p.book,
      chapter: p.chapter,
      verse: p.verse_start,
      end_verse: p.verse_end > p.verse_start ? p.verse_end : undefined,
      score: Math.round((1 - idx * (0.8 / Math.max(topK, 1))) * 1000) / 1000,
      confidence: "unverified",
    }));
  }

  const items = passages.map((p, idx) => {
    const verdict = verdicts.get(idx + 1) ?? "no";
    return { passage: p, verdict, originalIndex: idx };
  });

  const matches = items.filter((item) => item.verdict === "match");
  const related = items.filter((item) => item.verdict === "related");
  const ordered = [...matches, ...related].slice(0, topK);

  return ordered.map((item, rank) => {
    const p = item.passage;
    return {
      book: p.book,
      chapter: p.chapter,
      verse: p.verse_start,
      end_verse: p.verse_end > p.verse_start ? p.verse_end : undefined,
      score: Math.round((1 - rank * (0.8 / Math.max(topK, 1))) * 1000) / 1000,
      confidence: item.verdict as "match" | "related",
    };
  });
}

export function cleanModalHits(raw: unknown, maxTopK: number): Hit[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const hits: Hit[] = [];
  const confidences = new Set(["match", "related", "unverified"]);
  for (const h of results.slice(0, maxTopK)) {
    if (!h || typeof h !== "object") continue;
    const { book, chapter, verse, end_verse, score, confidence } = h as Record<string, unknown>;
    if (typeof book !== "string" || !book) continue;
    if (!Number.isInteger(chapter) || (chapter as number) < 1) continue;
    if (!Number.isInteger(verse) || (verse as number) < 1) continue;
    hits.push({
      book,
      chapter: chapter as number,
      verse: verse as number,
      end_verse: Number.isInteger(end_verse) && (end_verse as number) > (verse as number) ? (end_verse as number) : undefined,
      score: typeof score === "number" ? score : 0,
      confidence: typeof confidence === "string" && confidences.has(confidence) ? (confidence as Confidence) : "unverified",
    });
  }
  return hits;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const startTime = Date.now();

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
  const topK = Number.isInteger(rawTopK)
    ? Math.min(Math.max(rawTopK as number, 1), MAX_TOP_K)
    : DEFAULT_TOP_K;

  const isWarmup = query === "";
  const useModal = deps.backend === "modal";

  // ── Warm-up ping ──────────────────────────────────────────────────────────
  if (isWarmup) {
    if (!useModal) {
      // With Claude as the backend, a warm-up ping does nothing:
      // return empty results and remaining quota, count nothing.
      let quota: Quota;
      if (deps.getQuota) {
        quota = await deps.getQuota(userId);
      } else {
        const usage = await deps.consume(userId, "warmup");
        quota = { limit: deps.userLimit, remaining: usage.remaining };
      }
      deps.log?.({
        outcome: "warmup",
        latency_ms: { total: Date.now() - startTime },
        user_id: userId,
      });
      return json(200, { results: [], limit: quota.limit, remaining: quota.remaining });
    }

    // Modal warmup:
    const usage = await deps.consume(userId, "warmup");
    if (!usage.allowed) {
      return json(429, {
        error: usage.reason,
        message: LIMIT_MESSAGES[usage.reason] ?? "Too many requests.",
        limit: deps.userLimit,
        remaining: usage.remaining,
      });
    }
    if (deps.callModal) {
      try {
        await deps.callModal({ query: "", top_k: topK }, AbortSignal.timeout(TOTAL_TIMEOUT_MS));
      } catch {
        // Warm-up failure is silent
      }
    }
    return json(200, { results: [], limit: deps.userLimit, remaining: usage.remaining });
  }

  // ── 1. Quota consumption ──────────────────────────────────────────────────
  const usage = await deps.consume(userId, "search");
  if (!usage.allowed) {
    deps.log?.({
      outcome: "limit_exceeded",
      reason: usage.reason,
      user_id: userId,
      latency_ms: { total: Date.now() - startTime },
    });
    return json(429, {
      error: usage.reason,
      message: LIMIT_MESSAGES[usage.reason] ?? "Too many requests.",
      limit: deps.userLimit,
      remaining: usage.remaining,
    });
  }

  // ── Optional Modal backend route ──────────────────────────────────────────
  if (useModal && deps.callModal) {
    let upstream: Response;
    try {
      upstream = await deps.callModal({ query, top_k: topK }, AbortSignal.timeout(TOTAL_TIMEOUT_MS));
    } catch {
      await deps.refund(userId);
      return fail(504, "upstream_timeout", "The search service took too long to respond. Please try again.");
    }
    if (!upstream.ok) {
      await deps.refund(userId);
      return fail(502, "upstream_error", "The search service had a problem. Please try again.");
    }

    let data: unknown;
    try {
      data = await upstream.json();
    } catch {
      await deps.refund(userId);
      return fail(502, "upstream_error", "The search service sent an unexpected response.");
    }

    const results = cleanModalHits(data, topK);
    return json(200, {
      results,
      limit: deps.userLimit,
      remaining: usage.remaining,
    });
  }

  // ── Claude Primary Backend Route ──────────────────────────────────────────
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let nominateLatency = 0;
  let dbLatency = 0;
  let verifyLatency = 0;

  // ── 2. Nominate (Claude Haiku 5.5) ─────────────────────────────────────────
  const t0 = Date.now();
  let nomination: NominationResult;
  try {
    nomination = await deps.nominate(query, AbortSignal.timeout(NOMINATE_TIMEOUT_MS));
    nominateLatency = Date.now() - t0;
    totalInputTokens += nomination.inputTokens;
    totalOutputTokens += nomination.outputTokens;
  } catch {
    await deps.refund(userId);
    deps.log?.({
      outcome: "nominate_failed",
      user_id: userId,
      latency_ms: { total: Date.now() - startTime, nominate: Date.now() - t0 },
    });
    return fail(502, "nominate_failed", "The search service had a problem. Please try again.");
  }

  if (!nomination.passages || nomination.passages.length === 0) {
    // Model returned no candidate passages
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      await deps.recordUsage(userId, totalInputTokens, totalOutputTokens);
    }
    deps.log?.({
      outcome: "no_nominations",
      user_id: userId,
      latency_ms: { total: Date.now() - startTime, nominate: nominateLatency },
      tokens: { input: totalInputTokens, output: totalOutputTokens },
    });
    return json(200, { results: [], limit: deps.userLimit, remaining: usage.remaining });
  }

  // ── 3. Validate against real KJV database ──────────────────────────────────
  const t1 = Date.now();
  const candidatePairs = nomination.passages.map((p) => ({ book: p.book, chapter: p.chapter }));
  const chapterSpans = await deps.lookupChapterSpans(candidatePairs);
  const validatedSpans = validateNominatedPassages(nomination.passages, chapterSpans);

  if (validatedSpans.length === 0) {
    dbLatency = Date.now() - t1;
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      await deps.recordUsage(userId, totalInputTokens, totalOutputTokens);
    }
    deps.log?.({
      outcome: "no_valid_passages",
      user_id: userId,
      latency_ms: { total: Date.now() - startTime, nominate: nominateLatency, db_validate: dbLatency },
      tokens: { input: totalInputTokens, output: totalOutputTokens },
    });
    return json(200, { results: [], limit: deps.userLimit, remaining: usage.remaining });
  }

  // ── 4. Read real text from database ───────────────────────────────────────
  const textMap = await deps.fetchPassageTexts(validatedSpans);
  dbLatency = Date.now() - t1;

  const validatedPassages: ValidatedPassage[] = [];
  for (const p of validatedSpans) {
    const key = `${p.book}:${p.chapter}:${p.verse_start}:${p.verse_end}`;
    const text = textMap.get(key) ?? "";
    if (text.trim()) {
      validatedPassages.push({
        ...p,
        text,
      });
    }
  }

  if (validatedPassages.length === 0) {
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      await deps.recordUsage(userId, totalInputTokens, totalOutputTokens);
    }
    deps.log?.({
      outcome: "no_text_found",
      user_id: userId,
      latency_ms: { total: Date.now() - startTime, nominate: nominateLatency, db_validate: dbLatency },
      tokens: { input: totalInputTokens, output: totalOutputTokens },
    });
    return json(200, { results: [], limit: deps.userLimit, remaining: usage.remaining });
  }

  // ── 5. Verify (Claude Haiku 5.5) ───────────────────────────────────────────
  const t2 = Date.now();
  let verification: VerificationResult;
  try {
    verification = await deps.verify(query, validatedPassages, AbortSignal.timeout(VERIFY_TIMEOUT_MS));
    verifyLatency = Date.now() - t2;
    totalInputTokens += verification.inputTokens;
    totalOutputTokens += verification.outputTokens;
  } catch {
    // Fail soft: never fail the search if verify fails or times out; mark as unverified
    verifyLatency = Date.now() - t2;
    verification = { verdicts: null, inputTokens: 0, outputTokens: 0 };
  }

  // ── 6. Apply verdicts and form results ─────────────────────────────────────
  const results = applyVerdicts(validatedPassages, verification.verdicts, topK);

  // Record total token usage for the request
  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    try {
      await deps.recordUsage(userId, totalInputTokens, totalOutputTokens);
    } catch {
      // Don't fail the response if usage recording had a hiccup
    }
  }

  // Structured logging (Never logs question text, model output, or secrets!)
  deps.log?.({
    outcome: verification.verdicts ? (results.length > 0 ? "success" : "all_rejected") : "unverified",
    results_count: results.length,
    matches_count: results.filter((r) => r.confidence === "match").length,
    related_count: results.filter((r) => r.confidence === "related").length,
    latency_ms: {
      total: Date.now() - startTime,
      nominate: nominateLatency,
      db_validate: dbLatency,
      verify: verifyLatency,
    },
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
    },
    user_id: userId,
  });

  return json(200, {
    results,
    limit: deps.userLimit,
    remaining: usage.remaining,
  });
}
