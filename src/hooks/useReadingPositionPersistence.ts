import { useEffect, useRef } from "react";
import { api } from "../lib/tauri";
import type { VerseRef } from "../store/app";

/**
 * Persists the current reading position to SQLite whenever it changes,
 * debounced so rapid navigation (e.g. holding the next-chapter shortcut)
 * fires one write after navigation settles, not one per intermediate step.
 *
 * Before this hook existed, the frontend called api.getReadingPosition() on
 * startup but had no call site for setReadingPosition anywhere — the column
 * was read but never written, so "resume where you left off" never actually
 * worked past whatever position happened to be there from manual testing.
 */
export function useReadingPositionPersistence(
  primaryModule: string | null,
  currentRef: VerseRef,
  debounceMs = 800,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!primaryModule) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      api
        .setReadingPosition({
          book: currentRef.book,
          chapter: currentRef.chapter,
          verse: currentRef.verse,
          module_id: primaryModule,
        })
        .catch((e) => console.error("[readingPosition] failed to persist", e));
    }, debounceMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [primaryModule, currentRef, debounceMs]);
}
