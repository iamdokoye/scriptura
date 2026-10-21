import { useEffect, useState } from "react";
import { api } from "../../lib/tauri";
import type { AiHit } from "../../lib/aiSearch";

const keyOf = (h: { book: string; chapter: number; verse: number; endVerse?: number }) =>
  `${h.book}|${h.chapter}|${h.verse}|${h.endVerse ?? ""}`;

/**
 * Looks up each hit's text in the user's own Bible module. The search service only returns
 * references, so what's shown is always the translation currently in use.
 *
 * `texts` maps hit key → verse text. A hit whose chapter loaded but has no such verse
 * (translations number verses differently) lands in `missing` so the list can hide it
 * instead of offering a click that goes nowhere.
 */
export function useVerseTexts(hits: AiHit[], module: string | null) {
  const [texts, setTexts] = useState<Map<string, string>>(new Map());
  const [missing, setMissing] = useState<Set<string>>(new Set());

  useEffect(() => {
    setTexts(new Map());
    setMissing(new Set());
    if (!module || hits.length === 0) return;

    let cancelled = false;
    const chapters = new Map<string, AiHit[]>();
    for (const h of hits) {
      const k = `${h.book}|${h.chapter}`;
      chapters.set(k, [...(chapters.get(k) ?? []), h]);
    }

    for (const group of chapters.values()) {
      api.getChapter(module, group[0].book, group[0].chapter)
        .then((ch) => {
          if (cancelled) return;
          const byVerse = new Map(ch.verses.map((v) => [v.verse, v.spans.map((s) => s.text).join("")]));
          setTexts((prev) => {
            const next = new Map(prev);
            for (const h of group) {
              if (h.endVerse && h.endVerse > h.verse) {
                let combined = "";
                for (let v = h.verse; v <= h.endVerse; v++) {
                  const vt = byVerse.get(v);
                  if (vt !== undefined) {
                    combined += (combined ? " " : "") + `${v} ${vt}`;
                  }
                }
                if (combined) next.set(keyOf(h), combined);
              } else {
                const t = byVerse.get(h.verse);
                if (t !== undefined) next.set(keyOf(h), t);
              }
            }
            return next;
          });
          setMissing((prev) => {
            const next = new Set(prev);
            for (const h of group) if (!byVerse.has(h.verse)) next.add(keyOf(h));
            return next;
          });
        })
        .catch(() => { /* chapter unavailable in this module — the reference still works */ });
    }
    return () => { cancelled = true; };
  }, [hits, module]);

  return { texts, missing, keyOf };
}
