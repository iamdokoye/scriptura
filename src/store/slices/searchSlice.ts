import type { StateCreator } from "zustand";
import type { SearchResult } from "../../lib/tauri";
import type { AppState, SearchMode, SearchHistoryEntry } from "../app";

const HISTORY_KEY = "scriptura-search-history";
function loadHistory(): SearchHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}
function saveHistory(h: SearchHistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 100))); } catch {}
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

  // Search history
  searchHistory: SearchHistoryEntry[];
  addToSearchHistory: (q: string) => void;
  setLastHistoryRef: (ref: { book: string; chapter: number; verse: number }) => void;
  clearSearchHistory: () => void;
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
});
