import { useEffect, useRef } from "react";
import type { ChapterText } from "../lib/tauri";

/**
 * Proportionally syncs scroll position between the primary and parallel reading
 * panes when parallel mode's sync toggle is on. Pulled out of ReadingView since it's
 * a fully self-contained effect — it only needs the two scroll containers and doesn't
 * touch any other reading state.
 */
export function useScrollSync(
  syncScroll: boolean,
  primaryScrollRef: React.RefObject<HTMLDivElement | null>,
  parallelScrollRef: React.RefObject<HTMLDivElement | null>,
  parallelChapter: ChapterText | null,
) {
  const isSyncing = useRef(false);

  useEffect(() => {
    if (!syncScroll) return;
    const primary = primaryScrollRef.current;
    const parallel = parallelScrollRef.current;
    if (!primary || !parallel) return;

    function makeHandler(source: HTMLDivElement, target: HTMLDivElement) {
      return () => {
        if (isSyncing.current) return;
        isSyncing.current = true;
        const pct = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
        target.scrollTop = pct * (target.scrollHeight - target.clientHeight);
        isSyncing.current = false;
      };
    }

    const onPrimary = makeHandler(primary, parallel);
    const onParallel = makeHandler(parallel, primary);
    primary.addEventListener("scroll", onPrimary, { passive: true });
    parallel.addEventListener("scroll", onParallel, { passive: true });
    return () => {
      primary.removeEventListener("scroll", onPrimary);
      parallel.removeEventListener("scroll", onParallel);
    };
  }, [syncScroll, parallelChapter]);
}
