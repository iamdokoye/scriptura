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

export const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
  "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
] as const;

export const BIBLE_CHAPTER_COUNTS: Record<string, number> = {
  Genesis: 50, Exodus: 40, Leviticus: 27, Numbers: 36, Deuteronomy: 34,
  Joshua: 24, Judges: 21, Ruth: 4, "1 Samuel": 31, "2 Samuel": 24,
  "1 Kings": 22, "2 Kings": 25, "1 Chronicles": 29, "2 Chronicles": 36,
  Ezra: 10, Nehemiah: 13, Esther: 10, Job: 42, Psalms: 150, Proverbs: 31,
  Ecclesiastes: 12, "Song of Solomon": 8, Isaiah: 66, Jeremiah: 52,
  Lamentations: 5, Ezekiel: 48, Daniel: 12, Hosea: 14, Joel: 3, Amos: 9,
  Obadiah: 1, Jonah: 4, Micah: 7, Nahum: 3, Habakkuk: 3, Zephaniah: 3,
  Haggai: 2, Zechariah: 14, Malachi: 4,
  Matthew: 28, Mark: 16, Luke: 24, John: 21, Acts: 28, Romans: 16,
  "1 Corinthians": 16, "2 Corinthians": 13, Galatians: 6, Ephesians: 6,
  Philippians: 4, Colossians: 4, "1 Thessalonians": 5, "2 Thessalonians": 3,
  "1 Timothy": 6, "2 Timothy": 4, Titus: 3, Philemon: 1, Hebrews: 13,
  James: 5, "1 Peter": 5, "2 Peter": 3, "1 John": 5, "2 John": 1, "3 John": 1,
  Jude: 1, Revelation: 22,
};

const BOOK_ALIAS_MAP: Record<string, string> = {
  psalm: "Psalms",
  psalms: "Psalms",
  songofsongs: "Song of Solomon",
  songofsolomon: "Song of Solomon",
  canticles: "Song of Solomon",
  revelations: "Revelation",
  revelation: "Revelation",
  actsoftheapostles: "Acts",
};

export function normalizeBook(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const lower = s.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, "");
  if (BOOK_ALIAS_MAP[compact]) return BOOK_ALIAS_MAP[compact];
  for (const b of BIBLE_BOOKS) {
    if (b.toLowerCase() === lower || b.toLowerCase().replace(/[^a-z0-9]/g, "") === compact) {
      return b;
    }
  }
  return null;
}

/**
 * Validates nominated passages against real chapter spans or canonical KJV books.
 * - Normalizes book names (e.g. "Psalm" -> "Psalms").
 * - Drops unknown books/chapters.
 * - Swaps reversed verse numbers.
 * - Clamps verse numbers into the real chapter.
 * - Caps passage at 40 verses.
 * - Dedupes and caps at 12 passages.
 */
export function validateNominatedPassages(
  nominations: NominatedPassage[],
  spans: Map<string, ChapterSpan>
): Array<{ book: string; chapter: number; verse_start: number; verse_end: number; confidence?: Confidence }> {
  const result: Array<{ book: string; chapter: number; verse_start: number; verse_end: number; confidence?: Confidence }> = [];
  const seen = new Set<string>();
  const dbHasSpans = spans.size > 0;

  for (const n of nominations) {
    if (!n || typeof n !== "object") continue;
    const { book: rawBook, chapter, verse_start, verse_end, confidence } = n as any;
    if (typeof rawBook !== "string" || !Number.isInteger(chapter) || chapter < 1) continue;
    if (!Number.isInteger(verse_start)) continue;

    const normBook = normalizeBook(rawBook);
    if (!normBook) continue;

    const maxChapters = BIBLE_CHAPTER_COUNTS[normBook];
    if (!maxChapters || chapter > maxChapters) continue;

    const spanKey = `${normBook}:${chapter}`;
    const span = spans.get(spanKey);

    if (dbHasSpans && !span) {
      // Database is populated and this chapter does not exist in KJV
      continue;
    }

    let start = verse_start;
    let end = Number.isInteger(verse_end) ? verse_end : verse_start;
    if (end < start) {
      const tmp = start;
      start = end;
      end = tmp;
    }

    if (span) {
      // Clamp into the real chapter from database
      start = Math.max(span.minVerse, Math.min(span.maxVerse, start));
      end = Math.max(span.minVerse, Math.min(span.maxVerse, end));
    } else {
      // Fallback bounds when database is unseeded
      start = Math.max(1, Math.min(176, start));
      end = Math.max(start, Math.min(176, end));
    }

    // Cap at MAX_PASSAGE_VERSES (40)
    if (end - start + 1 > MAX_PASSAGE_VERSES) {
      end = start + MAX_PASSAGE_VERSES - 1;
    }

    const passageKey = `${normBook}:${chapter}:${start}:${end}`;
    if (seen.has(passageKey)) continue;
    seen.add(passageKey);

    result.push({
      book: normBook,
      chapter,
      verse_start: start,
      verse_end: end,
      confidence: confidence === "match" || confidence === "related" ? confidence : undefined,
    });
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

  // ── 3. Validate against real KJV database or canon ────────────────────────
  const t1 = Date.now();
  const candidatePairs = nomination.passages.map((p) => ({ book: p.book, chapter: p.chapter }));
  let chapterSpans = new Map<string, ChapterSpan>();
  try {
    chapterSpans = await deps.lookupChapterSpans(candidatePairs);
  } catch {
    // Fail soft if DB span lookup has an issue
  }
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
  let textMap = new Map<string, string>();
  try {
    textMap = await deps.fetchPassageTexts(validatedSpans);
  } catch {
    // Fail soft if DB text lookup has an issue
  }
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

  // ── 5. Verify if texts are available in database ─────────────────────────
  if (validatedPassages.length > 0) {
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

    // ── 6. Apply verdicts and form results ───────────────────────────────────
    const results = applyVerdicts(validatedPassages, verification.verdicts, topK);

    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      try {
        await deps.recordUsage(userId, totalInputTokens, totalOutputTokens);
      } catch {}
    }

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

  // ── 6. Fallback when database has no text (unseeded kjv_verses) ───────────
  // Form results directly from validated nominations so user gets their passages.
  const fallbackResults: Hit[] = validatedSpans.slice(0, topK).map((p, rank) => ({
    book: p.book,
    chapter: p.chapter,
    verse: p.verse_start,
    end_verse: p.verse_end > p.verse_start ? p.verse_end : undefined,
    score: Math.round((1 - rank * (0.8 / Math.max(topK, 1))) * 1000) / 1000,
    confidence: (p.confidence as Confidence) ?? (rank === 0 ? "match" : "related"),
  }));

  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    try {
      await deps.recordUsage(userId, totalInputTokens, totalOutputTokens);
    } catch {}
  }

  deps.log?.({
    outcome: "fallback_unseeded",
    results_count: fallbackResults.length,
    latency_ms: {
      total: Date.now() - startTime,
      nominate: nominateLatency,
      db_validate: dbLatency,
    },
    tokens: { input: totalInputTokens, output: totalOutputTokens },
    user_id: userId,
  });

  return json(200, {
    results: fallbackResults,
    limit: deps.userLimit,
    remaining: usage.remaining,
  });
}
