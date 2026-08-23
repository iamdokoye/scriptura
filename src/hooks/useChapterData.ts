import { useEffect, useState } from "react";
import { api, type ChapterText } from "../lib/tauri";

/**
 * Fetches the primary chapter (plus pre-fetching the adjacent ones for instant
 * prev/next) and, when parallel mode is on, the parallel chapter. Pulled out of
 * ReadingView because chapter-loading is a self-contained data concern with no
 * dependency on the rest of the component's UI state.
 */
export function useChapterData(
  primaryModule: string | null,
  book: string,
  chapter: number,
  parallelMode: boolean,
  parallelModule: string | null,
) {
  const [primaryChapter, setPrimaryChapter] = useState<ChapterText | null>(null);
  const [parallelChapter, setParallelChapter] = useState<ChapterText | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!primaryModule) return;
    setLoading(true);
    setError(null);
    api
      .getChapter(primaryModule, book, chapter)
      .then((ch) => {
        setPrimaryChapter(ch);
        const prev = chapter - 1;
        const next = chapter + 1;
        if (prev >= 1) api.getChapter(primaryModule, book, prev).catch(() => {});
        api.getChapter(primaryModule, book, next).catch(() => {});
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [primaryModule, book, chapter]);

  useEffect(() => {
    if (!parallelMode || !parallelModule) { setParallelChapter(null); return; }
    api
      .getChapter(parallelModule, book, chapter)
      .then(setParallelChapter)
      .catch(() => setParallelChapter(null));
  }, [parallelMode, parallelModule, book, chapter]);

  return { chapter: primaryChapter, parallelChapter, loading, error };
}
