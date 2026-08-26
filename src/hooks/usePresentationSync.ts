import { useEffect } from "react";
import { emitPresentation } from "../lib/presentation";
import type { VerseRef, DisplayPrefs } from "../store/app";
import type { PresentationTheme } from "../lib/tauri";

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
  presentationTheme: PresentationTheme | null;
  /** Live Show console only — ReadingView's plain Go Live flow has no blackout/emergency controls. */
  black?: boolean;
  emergency?: boolean;
}) {
  const {
    presentationActive, primaryModule, currentRef, parallelModule,
    parallelMode, selectedStrongs, displayPrefs, readingFontSize, presentationTheme,
    black, emergency,
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
      presentationTheme,
      black,
      emergency,
    });
  }, [presentationActive, currentRef, primaryModule, parallelModule, parallelMode, selectedStrongs, displayPrefs, readingFontSize, presentationTheme, black, emergency]);
}
