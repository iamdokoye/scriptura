import { useEffect } from "react";
import { useAppStore } from "../../store/app";
import { emitPresentation, type PresentState, type SongSlidePayload } from "../../lib/presentation";
import { useSongsLive } from "./liveStore";

/** A full output state carrying `slide`, with the rest filled from the app's current presentation settings. */
export function useSongPresentState(slide: SongSlidePayload | null): PresentState {
  const currentRef = useAppStore((s) => s.currentRef);
  const primaryModule = useAppStore((s) => s.primaryModule);
  const displayPrefs = useAppStore((s) => s.displayPrefs);
  const readingFontSize = useAppStore((s) => s.readingFontSize);
  const presentationTheme = useAppStore((s) => s.activePresentationTheme);
  const black = useAppStore((s) => s.liveBlack);
  const emergency = useAppStore((s) => s.liveEmergency);
  return {
    book: currentRef.book,
    chapter: currentRef.chapter,
    verse: currentRef.verse,
    primaryModule: primaryModule ?? "",
    parallelModule: null,
    parallelMode: false,
    selectedStrongs: null,
    strongsGroup: null,
    strongsSource: null,
    displayPrefs,
    readingFontSize,
    presentationTheme,
    black,
    emergency,
    slide: slide ?? { text: "", label: "" },
  };
}

export function liveSlidePayload(live: ReturnType<typeof useSongsLive.getState>["live"]): SongSlidePayload | null {
  if (!live) return null;
  const slide = live.slides[live.index];
  if (!slide) return null;
  return {
    text: slide.text,
    label: `${live.title} — ${slide.label}`,
    copyright: live.copyright || undefined,
  };
}

/**
 * Pushes the live song slide to the output window whenever it (or blackout /
 * emergency / theme) changes. Mounted only while the Songs tab is open; going
 * back to Scriptures lets that screen's own sync take the output back.
 */
export function useSongOutput() {
  const live = useSongsLive((s) => s.live);
  const presentationActive = useAppStore((s) => s.presentationActive);
  const state = useSongPresentState(liveSlidePayload(live));

  useEffect(() => {
    if (!presentationActive || !live) return;
    emitPresentation(state);
    // `state` is rebuilt every render; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationActive, live, state.black, state.emergency, state.presentationTheme, state.displayPrefs]);
}
