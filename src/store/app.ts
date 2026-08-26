//! Global app state, organized as Zustand slices.
//
// This used to be one 337-line create() call with every domain's state and actions
// mixed together — navigation, reading position, theme, study-tool visibility,
// search, presentation, service order, and display preferences all as siblings in
// one flat object, with no boundary saying which piece belongs to which feature.
// Every one of the 18+ consuming components was implicitly coupled to the entire
// shape rather than to the slice it actually uses.
//
// Split into one file per domain under slices/, combined here into a single store
// (Zustand's official "slices pattern" — see https://zustand.docs.pmnd.rs/guides/slices-pattern).
// This is purely internal organization: useAppStore's shape, every field name, and
// every consuming component's `useAppStore()` call are unchanged. The only thing
// that moved is *where the code that owns each field lives*.

import { create } from "zustand";
import { createNavigationSlice, type NavigationSlice } from "./slices/navigationSlice";
import { createReadingSlice, type ReadingSlice } from "./slices/readingSlice";
import { createUiSlice, type UiSlice } from "./slices/uiSlice";
import { createStudyToolsSlice, type StudyToolsSlice } from "./slices/studyToolsSlice";
import { createSearchSlice, type SearchSlice } from "./slices/searchSlice";
import { createPresentationSlice, type PresentationSlice } from "./slices/presentationSlice";
import { createServiceOrderSlice, type ServiceOrderSlice } from "./slices/serviceOrderSlice";
import { createDisplayPrefsSlice, type DisplayPrefsSlice } from "./slices/displayPrefsSlice";
import { createPresentationThemeSlice, type PresentationThemeSlice } from "./slices/presentationThemeSlice";
import { createLiveShowSlice, type LiveShowSlice } from "./slices/liveShowSlice";
import type { PresentationItemOverride } from "../lib/tauri";

// ── Shared types (used by more than one slice, or by consumers outside the store) ──

export type View = "reading" | "search" | "modules" | "bookmarks" | "notes" | "history" | "customize" | "live";
export type Theme = "light" | "dark" | "system";
export type SearchMode = "word" | "scripture";
export type FontFamily = "system" | "serif" | "times" | "mono";
export type TextAlign = "left" | "justify";

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

export interface ServiceItem {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;   // plain-text preview (first ~100 chars of verse)
  module: string; // module ID active when added
  presentation_override?: PresentationItemOverride | null;
}

export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
  /** The verse the user navigated to from this search, if any */
  selectedRef?: { book: string; chapter: number; verse: number };
}

export interface DisplayPrefs {
  fontFamily: FontFamily;
  textAlign: TextAlign;
  /** 0–20: total horizontal margin as % of container (applied as value/2 each side) */
  margins: number;
  /** 0.0–1.0 in 0.1 steps; CSS line-height = 1 + lineSpacing */
  lineSpacing: number;
  /** 0.0–1.0 in 0.1 steps; CSS letter-spacing = letterSpacing * 0.1em */
  letterSpacing: number;
  /** Height in px for the Strongs concordance sheet (draggable) */
  strongsSheetHeight: number;
  /** Presentation verse context: 1=active only, 2=active+next, 3=prev+active+next, 4=full chapter scroll */
  presentationContext: 1 | 2 | 3 | 4;
  /** Which lexicon the Strong's sheet opens to by default — the pill switcher can still override per-lookup */
  defaultLexiconSource: "ours" | "rich" | "lsj";
}

// ── Combined state ──────────────────────────────────────────────────────────────

export type AppState = NavigationSlice &
  ReadingSlice &
  UiSlice &
  StudyToolsSlice &
  SearchSlice &
  PresentationSlice &
  ServiceOrderSlice &
  DisplayPrefsSlice &
  PresentationThemeSlice &
  LiveShowSlice;

export const useAppStore = create<AppState>()((...a) => ({
  ...createNavigationSlice(...a),
  ...createReadingSlice(...a),
  ...createUiSlice(...a),
  ...createStudyToolsSlice(...a),
  ...createSearchSlice(...a),
  ...createPresentationSlice(...a),
  ...createServiceOrderSlice(...a),
  ...createDisplayPrefsSlice(...a),
  ...createPresentationThemeSlice(...a),
  ...createLiveShowSlice(...a),
}));
