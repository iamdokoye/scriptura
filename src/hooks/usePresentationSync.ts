import { useEffect } from "react";
import { emitPresentation } from "../lib/presentation";
import type { VerseRef, DisplayPrefs } from "../store/app";

/** Broadcasts the current reading state to the Scriptura Live window whenever it changes. */
export function usePresentationSync(args: {
  presentationActive: boolean;
  primaryModule: string | null;
  currentRef: VerseRef;
  parallelModule: string | null;
  parallelMode: boolean;
  selectedStrongs: string | null;
  displayPrefs: DisplayPrefs;
  readingFontSize: number;
}) {
  const {
    presentationActive, primaryModule, currentRef, parallelModule,
    parallelMode, selectedStrongs, displayPrefs, readingFontSize,
  } = args;

  useEffect(() => {
    if (!presentationActive || !primaryModule) return;
    emitPresentation({
      book: currentRef.book,
      chapter: currentRef.chapter,
      verse: currentRef.verse,
      primaryModule,
      parallelModule,
      parallelMode,
      selectedStrongs,
      displayPrefs,
      readingFontSize,
    });
  }, [presentationActive, currentRef, primaryModule, parallelModule, parallelMode, selectedStrongs, displayPrefs, readingFontSize]);
}
