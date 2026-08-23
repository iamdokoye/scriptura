import type { StateCreator } from "zustand";
import { api, type SearchResult, type SearchHistoryEntry as BackendSearchHistoryEntry } from "../../lib/tauri";
import type { AppState, SearchMode, SearchHistoryEntry } from "../app";

function fromBackend(e: BackendSearchHistoryEntry): SearchHistoryEntry {
  return {
    query: e.query,
    timestamp: e.timestamp,
    selectedRef: e.ref_book !== null && e.ref_chapter !== null && e.ref_verse !== null
      ? { book: e.ref_book, chapter: e.ref_chapter, verse: e.ref_verse }
      : undefined,
  };
}

export interface SearchSlice {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchMode: SearchMode;
  setSearchMode: (m: SearchMode) => void;

  // Search result navigation (Alt+P / Alt+N)
  currentSearchResults: SearchResult[];
  setCurrentSearchResults: (r: SearchResult[]) => void;
  searchResultIndex: number; // -1 = not navigating
  setSearchResultIndex: (i: number) => void;

  // Search history — persisted to SQLite (see displayPrefsSlice for why, same
  // reasoning: no schema/validation/transactions and silently-swallowed errors
  // in localStorage, especially risky for a list that keeps growing).
  searchHistory: SearchHistoryEntry[];
  addToSearchHistory: (q: string) => void;
  setLastHistoryRef: (ref: { book: string; chapter: number; verse: number }) => void;
  clearSearchHistory: () => void;
  /** Populates from the backend at startup. */
  hydrateSearchHistory: (entries: BackendSearchHistoryEntry[]) => void;
}

export const createSearchSlice: StateCreator<AppState, [], [], SearchSlice> = (set) => ({
  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  searchMode: "word",
  setSearchMode: (searchMode) => set({ searchMode }),

  currentSearchResults: [],
  setCurrentSearchResults: (currentSearchResults) => set({ currentSearchResults }),
  searchResultIndex: -1,
  setSearchResultIndex: (searchResultIndex) => set({ searchResultIndex }),

  searchHistory: [],
  addToSearchHistory: (q) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    set((s) => {
      const deduped = s.searchHistory.filter((e) => e.query !== trimmed);
      return { searchHistory: [{ query: trimmed, timestamp: Date.now() }, ...deduped] };
    });
    api.addSearchHistoryEntry(trimmed).catch((e) => console.error("[searchHistory] failed to persist", e));
  },
  setLastHistoryRef: (ref) => {
    set((s) => {
      if (s.searchHistory.length === 0) return s;
      const [first, ...rest] = s.searchHistory;
      return { searchHistory: [{ ...first, selectedRef: ref }, ...rest] };
    });
    api.setLastSearchHistoryRef(ref.book, ref.chapter, ref.verse)
      .catch((e) => console.error("[searchHistory] failed to persist", e));
  },
  clearSearchHistory: () => {
    set({ searchHistory: [] });
    api.clearSearchHistory().catch((e) => console.error("[searchHistory] failed to clear", e));
  },

  hydrateSearchHistory: (entries) => set({ searchHistory: entries.map(fromBackend) }),
});
