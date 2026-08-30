import type { StateCreator } from "zustand";
import type { AppState } from "../app";

export interface PresentationSlice {
  presentationActive: boolean;
  setPresentationActive: (v: boolean) => void;
  /** 0-indexed part of the active verse to display (0 = "a", 1 = "b", …). */
  versePart: number;
  setVersePart: (n: number) => void;
}

export const createPresentationSlice: StateCreator<AppState, [], [], PresentationSlice> = (set) => ({
  presentationActive: false,
  setPresentationActive: (presentationActive) => set({ presentationActive }),
  versePart: 0,
  setVersePart: (versePart) => set({ versePart }),
});
