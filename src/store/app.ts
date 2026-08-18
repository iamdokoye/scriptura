import { create } from "zustand";
import type { SearchResult } from "../lib/tauri";

export type View = "reading" | "search" | "modules" | "bookmarks" | "notes" | "history";

export interface ServiceItem {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;   // plain-text preview (first ~100 chars of verse)
  module: string; // module ID active when added
}
export type Theme = "light" | "dark" | "system";
export type SearchMode = "word" | "scripture";

export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
  /** The verse the user navigated to from this search, if any */
  selectedRef?: { book: string; chapter: number; verse: number };
}

const HISTORY_KEY = "scriptura-search-history";
function loadHistory(): SearchHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}
function saveHistory(h: SearchHistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 100))); } catch {}
}

const STUDY_UI_KEY = "scriptura-study-ui-v2";

export type FontFamily = "system" | "serif" | "times" | "mono";
export type TextAlign = "left" | "justify";

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
}

const SERVICE_ORDER_KEY = "scriptura-service-order-v1";
function loadServiceOrder(): ServiceItem[] {
  try { return JSON.parse(localStorage.getItem(SERVICE_ORDER_KEY) ?? "[]"); } catch { return []; }
}
function saveServiceOrder(items: ServiceItem[]) {
  try { localStorage.setItem(SERVICE_ORDER_KEY, JSON.stringify(items)); } catch {}
}

const DISPLAY_PREFS_KEY = "scriptura-display-prefs-v2";
const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  fontFamily: "system",
  textAlign: "left",
  margins: 0,
  lineSpacing: 0.6,
  letterSpacing: 0,
  strongsSheetHeight: 360,
  presentationContext: 1,
};
function loadDisplayPrefs(): DisplayPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(DISPLAY_PREFS_KEY) ?? "{}");
    return {
      ...DEFAULT_DISPLAY_PREFS,
      ...p,
      // Guard against stale string values from previous schema
      lineSpacing: typeof p.lineSpacing === "number" && p.lineSpacing >= 0 && p.lineSpacing <= 1
        ? p.lineSpacing : DEFAULT_DISPLAY_PREFS.lineSpacing,
      letterSpacing: typeof p.letterSpacing === "number" && p.letterSpacing >= 0 && p.letterSpacing <= 1
        ? p.letterSpacing : DEFAULT_DISPLAY_PREFS.letterSpacing,
      presentationContext: [1, 2, 3, 4].includes(p.presentationContext)
        ? p.presentationContext
        : p.presentationLayout === "scroll" ? 4 : DEFAULT_DISPLAY_PREFS.presentationContext,
    };
  } catch { return DEFAULT_DISPLAY_PREFS; }
}
function saveDisplayPrefs(p: DisplayPrefs) {
  try { localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(p)); } catch {}
}
function loadStudyUi() {
  try {
    const p = JSON.parse(localStorage.getItem(STUDY_UI_KEY) ?? "{}");
    return {
      showCommentary: p.showCommentary !== false,
      showNotes: p.showNotes !== false,
      showCrossRefs: p.showCrossRefs !== false,
      showRedLetter: p.showRedLetter !== false,
    };
  } catch { return { showCommentary: true, showNotes: true, showCrossRefs: true, showRedLetter: true }; }
}
function saveStudyUi(prefs: { showCommentary: boolean; showNotes: boolean; showCrossRefs: boolean; showRedLetter: boolean }) {
  try { localStorage.setItem(STUDY_UI_KEY, JSON.stringify(prefs)); } catch {}
}

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

interface AppState {
  // Navigation
  view: View;
  setView: (v: View) => void;

  // Current reading position
  currentRef: VerseRef;
  setCurrentRef: (ref: VerseRef) => void;

  // Active modules
  primaryModule: string | null;
  parallelModule: string | null;
  setPrimaryModule: (id: string | null) => void;
  setParallelModule: (id: string | null) => void;

  // UI state
  theme: Theme;
  setTheme: (t: Theme) => void;
  parallelMode: boolean;
  setParallelMode: (v: boolean) => void;
isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;

  // Reading font size (persisted to backend prefs via Settings/Ctrl+/-))
  readingFontSize: number;
  setReadingFontSize: (n: number) => void;

  // Study tool visibility (from preferences)
  showStrongs: boolean;
  setShowStrongs: (v: boolean) => void;

  // Study panel section visibility (localStorage)
  showCommentary: boolean;
  setShowCommentary: (v: boolean) => void;
  showNotes: boolean;
  setShowNotes: (v: boolean) => void;
  showCrossRefs: boolean;
  setShowCrossRefs: (v: boolean) => void;
  showRedLetter: boolean;
  setShowRedLetter: (v: boolean) => void;

  // Selected word for Strong's sheet
  selectedStrongs: string | null;
  setSelectedStrongs: (n: string | null) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchMode: SearchMode;
  setSearchMode: (m: SearchMode) => void;

  // Search result navigation (Alt+P / Alt+N)
  currentSearchResults: SearchResult[];
  setCurrentSearchResults: (r: SearchResult[]) => void;
  searchResultIndex: number;  // -1 = not navigating
  setSearchResultIndex: (i: number) => void;

  // Search history
  searchHistory: SearchHistoryEntry[];
  addToSearchHistory: (q: string) => void;
  setLastHistoryRef: (ref: { book: string; chapter: number; verse: number }) => void;
  clearSearchHistory: () => void;

  // Settings sheet
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;

  // Presentation
  presentationActive: boolean;
  setPresentationActive: (v: boolean) => void;

  // Service order
  serviceOrder: ServiceItem[];
  serviceOrderOpen: boolean;
  setServiceOrderOpen: (v: boolean) => void;
  addToServiceOrder: (item: Omit<ServiceItem, "id">) => void;
  removeFromServiceOrder: (id: string) => void;
  reorderServiceOrder: (fromIdx: number, toIdx: number) => void;
  clearServiceOrder: () => void;

  // Display preferences (font, spacing, margins)
  displayPrefs: DisplayPrefs;
  setDisplayPrefs: (p: Partial<DisplayPrefs>) => void;

  // First-run
  hasModules: boolean;
  setHasModules: (v: boolean) => void;
}

const studyUi = loadStudyUi();

export const useAppStore = create<AppState>((set) => ({
  view: "reading",
  setView: (view) => set({ view }),

  currentRef: { book: "John", chapter: 3, verse: 16 },
  setCurrentRef: (currentRef) => set({ currentRef }),

  primaryModule: null,
  parallelModule: null,
  setPrimaryModule: (primaryModule) => set({ primaryModule }),
  setParallelModule: (parallelModule) => set({ parallelModule }),

  theme: "light",
  setTheme: (theme) => set({ theme }),
  parallelMode: false,
  setParallelMode: (parallelMode) => set({ parallelMode }),
isFullscreen: false,
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),

  readingFontSize: 18,
  setReadingFontSize: (readingFontSize) => set({ readingFontSize }),

  showStrongs: true,
  setShowStrongs: (showStrongs) => set({ showStrongs }),

  showCommentary: studyUi.showCommentary,
  setShowCommentary: (showCommentary) =>
    set((s) => {
      saveStudyUi({ showCommentary, showNotes: s.showNotes, showCrossRefs: s.showCrossRefs, showRedLetter: s.showRedLetter });
      return { showCommentary };
    }),
  showNotes: studyUi.showNotes,
  setShowNotes: (showNotes) =>
    set((s) => {
      saveStudyUi({ showCommentary: s.showCommentary, showNotes, showCrossRefs: s.showCrossRefs, showRedLetter: s.showRedLetter });
      return { showNotes };
    }),
  showCrossRefs: studyUi.showCrossRefs,
  setShowCrossRefs: (showCrossRefs) =>
    set((s) => {
      saveStudyUi({ showCommentary: s.showCommentary, showNotes: s.showNotes, showCrossRefs, showRedLetter: s.showRedLetter });
      return { showCrossRefs };
    }),
  showRedLetter: studyUi.showRedLetter,
  setShowRedLetter: (showRedLetter) =>
    set((s) => {
      saveStudyUi({ showCommentary: s.showCommentary, showNotes: s.showNotes, showCrossRefs: s.showCrossRefs, showRedLetter });
      return { showRedLetter };
    }),

  selectedStrongs: null,
  setSelectedStrongs: (selectedStrongs) => set({ selectedStrongs }),

  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  searchMode: "word",
  setSearchMode: (searchMode) => set({ searchMode }),

  currentSearchResults: [],
  setCurrentSearchResults: (currentSearchResults) => set({ currentSearchResults }),
  searchResultIndex: -1,
  setSearchResultIndex: (searchResultIndex) => set({ searchResultIndex }),

  searchHistory: loadHistory(),
  addToSearchHistory: (q) =>
    set((s) => {
      const trimmed = q.trim();
      if (!trimmed) return s;
      const deduped = s.searchHistory.filter((e) => e.query !== trimmed);
      const next = [{ query: trimmed, timestamp: Date.now() }, ...deduped];
      saveHistory(next);
      return { searchHistory: next };
    }),
  setLastHistoryRef: (ref) =>
    set((s) => {
      if (s.searchHistory.length === 0) return s;
      const [first, ...rest] = s.searchHistory;
      const next = [{ ...first, selectedRef: ref }, ...rest];
      saveHistory(next);
      return { searchHistory: next };
    }),
  clearSearchHistory: () => {
    saveHistory([]);
    set({ searchHistory: [] });
  },

  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  presentationActive: false,
  setPresentationActive: (presentationActive) => set({ presentationActive }),

  serviceOrder: loadServiceOrder(),
  serviceOrderOpen: false,
  setServiceOrderOpen: (serviceOrderOpen) => set({ serviceOrderOpen }),
  addToServiceOrder: (item) =>
    set((s) => {
      // Deduplicate by same book+chapter+verse+module
      const exists = s.serviceOrder.some(
        (x) => x.book === item.book && x.chapter === item.chapter && x.verse === item.verse && x.module === item.module
      );
      if (exists) return s;
      const next = [...s.serviceOrder, { ...item, id: crypto.randomUUID() }];
      saveServiceOrder(next);
      return { serviceOrder: next };
    }),
  removeFromServiceOrder: (id) =>
    set((s) => {
      const next = s.serviceOrder.filter((x) => x.id !== id);
      saveServiceOrder(next);
      return { serviceOrder: next };
    }),
  reorderServiceOrder: (fromIdx, toIdx) =>
    set((s) => {
      const next = [...s.serviceOrder];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      saveServiceOrder(next);
      return { serviceOrder: next };
    }),
  clearServiceOrder: () => {
    saveServiceOrder([]);
    set({ serviceOrder: [] });
  },

  displayPrefs: loadDisplayPrefs(),
  setDisplayPrefs: (patch) =>
    set((s) => {
      const next = { ...s.displayPrefs, ...patch };
      saveDisplayPrefs(next);
      return { displayPrefs: next };
    }),

  hasModules: false,
  setHasModules: (hasModules) => set({ hasModules }),
}));
