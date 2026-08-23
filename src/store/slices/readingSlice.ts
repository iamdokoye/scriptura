import type { StateCreator } from "zustand";
import type { AppState, VerseRef } from "../app";

export interface ReadingSlice {
  currentRef: VerseRef;
  setCurrentRef: (ref: VerseRef) => void;

  primaryModule: string | null;
  parallelModule: string | null;
  setPrimaryModule: (id: string | null) => void;
  setParallelModule: (id: string | null) => void;
  parallelMode: boolean;
  setParallelMode: (v: boolean) => void;

  // Persisted to backend prefs via Settings/Ctrl+/-
  readingFontSize: number;
  setReadingFontSize: (n: number) => void;

  // Selected word for Strong's sheet
  selectedStrongs: string | null;
  setSelectedStrongs: (n: string | null) => void;
}

export const createReadingSlice: StateCreator<AppState, [], [], ReadingSlice> = (set) => ({
  currentRef: { book: "John", chapter: 3, verse: 16 },
  setCurrentRef: (currentRef) => set({ currentRef }),

  primaryModule: null,
  parallelModule: null,
  setPrimaryModule: (primaryModule) => set({ primaryModule }),
  setParallelModule: (parallelModule) => set({ parallelModule }),
  parallelMode: false,
  setParallelMode: (parallelMode) => set({ parallelMode }),

  readingFontSize: 18,
  setReadingFontSize: (readingFontSize) => set({ readingFontSize }),

  selectedStrongs: null,
  setSelectedStrongs: (selectedStrongs) => set({ selectedStrongs }),
});
