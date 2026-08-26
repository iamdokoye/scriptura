import { useEffect } from "react";
import { api, type SearchResult } from "../lib/tauri";
import type { VerseRef, DisplayPrefs, View } from "../store/app";
import type { Workspace } from "../store/slices/navigationSlice";

const FONT_SIZE_PRESETS = [14, 16, 32, 48, 64, 72, 98] as const;

interface Args {
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  fsSearchOpenRef: React.RefObject<boolean>;
  setFsSearchOpen: (v: boolean) => void;
  fsScriptureRef: React.RefObject<HTMLInputElement | null>;
  readingFontSize: number;
  setReadingFontSize: (v: number) => void;
  currentRef: VerseRef;
  setCurrentRef: (ref: VerseRef) => void;
  currentSearchResults: SearchResult[];
  searchResultIndex: number;
  setSearchResultIndex: (i: number) => void;
  navTo: (ref: VerseRef) => void;
  setLastHistoryRef: (ref: VerseRef) => void;
  setView: (v: View) => void;
  serviceOrderOpen: boolean;
  setServiceOrderOpen: (v: boolean) => void;
  presentationActive: boolean;
  setDisplayPrefs: (p: Partial<DisplayPrefs>) => void;
  /** Adds the currently active verse to the service queue (Ctrl+Alt+Q). */
  addCurrentVerseToQueue: () => void;
  /** Service-queue shortcuts are Presentation-only — see Preferences.workspace. */
  workspace: Workspace;
}

/**
 * All of ReadingView's global keyboard shortcuts, pulled out because this was a
 * ~150-line effect with no meaningful coupling to ReadingView's rendering — it only
 * needs the current values and a handful of setters, all passed in explicitly. Same
 * behavior as before the extraction: one keydown listener, same key bindings.
 */
export function useReadingShortcuts(args: Args) {
  const {
    isFullscreen, setIsFullscreen, fsSearchOpenRef, setFsSearchOpen, fsScriptureRef,
    readingFontSize, setReadingFontSize, currentRef, setCurrentRef,
    currentSearchResults, searchResultIndex, setSearchResultIndex, navTo, setLastHistoryRef,
    setView, serviceOrderOpen, setServiceOrderOpen, presentationActive, setDisplayPrefs,
    addCurrentVerseToQueue, workspace,
  } = args;

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const alt = e.altKey;

      // Ctrl+F: toggle fullscreen
      if (ctrl && e.code === "KeyF") {
        e.preventDefault();
        setIsFullscreen(!isFullscreen);
        return;
      }

      // Escape: close fullscreen search palette first, then exit fullscreen.
      // Read from a ref (not the closure) so we always see the current value.
      if (e.code === "Escape") {
        if (fsSearchOpenRef.current) { setFsSearchOpen(false); return; }
        if (isFullscreen) { setIsFullscreen(false); return; }
      }

      // Ctrl+K in fullscreen: open word search palette
      if (ctrl && e.code === "KeyK" && isFullscreen) {
        e.preventDefault();
        setFsSearchOpen(true);
        return;
      }

      // Ctrl+L in fullscreen: focus scripture nav
      if (ctrl && e.code === "KeyL" && isFullscreen) {
        e.preventDefault();
        setTimeout(() => fsScriptureRef.current?.focus(), 30);
        return;
      }

      // Ctrl+= or Ctrl++: increase font size by 1px
      if (ctrl && !alt && (e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        const next = Math.min(98, readingFontSize + 1);
        setReadingFontSize(next);
        api.setPreferences({ font_size_reading: next }).catch(() => {});
        return;
      }

      // Ctrl+-: decrease font size by 1px
      if (ctrl && !alt && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        const next = Math.max(14, readingFontSize - 1);
        setReadingFontSize(next);
        api.setPreferences({ font_size_reading: next }).catch(() => {});
        return;
      }

      // Ctrl+Alt++ / Ctrl+Alt+=: jump to next preset size
      if (ctrl && alt && (e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        const next = FONT_SIZE_PRESETS.find((s) => s > readingFontSize) ?? FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
        setReadingFontSize(next);
        api.setPreferences({ font_size_reading: next }).catch(() => {});
        return;
      }

      // Ctrl+Alt+-: jump to previous preset size
      if (ctrl && alt && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        const prev = [...FONT_SIZE_PRESETS].reverse().find((s) => s < readingFontSize) ?? FONT_SIZE_PRESETS[0];
        setReadingFontSize(prev);
        api.setPreferences({ font_size_reading: prev }).catch(() => {});
        return;
      }

      // Ctrl+P: previous chapter
      if (ctrl && e.code === "KeyP") {
        e.preventDefault();
        if (currentRef.chapter > 1) {
          setCurrentRef({ ...currentRef, chapter: currentRef.chapter - 1, verse: 1 });
        }
        return;
      }

      // Ctrl+N: next chapter
      if (ctrl && e.code === "KeyN") {
        e.preventDefault();
        setCurrentRef({ ...currentRef, chapter: currentRef.chapter + 1, verse: 1 });
        return;
      }

      // Alt+H: go to search history view (use code for macOS Option key)
      if (alt && e.code === "KeyH") {
        e.preventDefault();
        setView("history");
        return;
      }

      // Alt+P: previous search result (Option+P on Mac produces "π" but code is still KeyP)
      if (alt && e.code === "KeyP" && currentSearchResults.length > 0) {
        e.preventDefault();
        const idx = searchResultIndex <= 0 ? 0 : searchResultIndex - 1;
        const r = currentSearchResults[idx];
        if (r) {
          setSearchResultIndex(idx);
          const ref = { book: r.book, chapter: r.chapter, verse: r.verse };
          navTo(ref);
          setLastHistoryRef(ref);
        }
        return;
      }

      // Alt+N: next search result
      if (alt && e.code === "KeyN" && currentSearchResults.length > 0) {
        e.preventDefault();
        const idx = Math.min(searchResultIndex + 1, currentSearchResults.length - 1);
        const r = currentSearchResults[idx];
        if (r) {
          setSearchResultIndex(idx);
          const ref = { book: r.book, chapter: r.chapter, verse: r.verse };
          navTo(ref);
          setLastHistoryRef(ref);
        }
        return;
      }

      // Ctrl+Alt+Q: add the current verse to the service queue (Presentation workspace only)
      if (ctrl && alt && e.code === "KeyQ" && workspace === "presentation") {
        e.preventDefault();
        addCurrentVerseToQueue();
        return;
      }

      // Ctrl+Q: toggle service order panel (Presentation workspace only)
      if (ctrl && !alt && e.code === "KeyQ" && workspace === "presentation") {
        e.preventDefault();
        setServiceOrderOpen(!serviceOrderOpen);
        return;
      }

      // Ctrl+1–4: presentation verse context (only when presentation is active)
      if (ctrl && presentationActive) {
        const ctxMap: Record<string, 1 | 2 | 3 | 4> = {
          Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4,
          Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4,
        };
        if (e.code in ctxMap) {
          e.preventDefault();
          setDisplayPrefs({ presentationContext: ctxMap[e.code] });
          return;
        }
      }
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [
    isFullscreen, currentRef, currentSearchResults,
    searchResultIndex, readingFontSize, presentationActive,
    serviceOrderOpen, setServiceOrderOpen,
    setIsFullscreen, setCurrentRef, navTo,
    setSearchResultIndex, setView, setReadingFontSize, setLastHistoryRef,
    setDisplayPrefs, addCurrentVerseToQueue, workspace,
  ]);
}
