import type { StateCreator } from "zustand";
import type { AppState } from "../app";

export interface PresentationSlice {
  presentationActive: boolean;
  setPresentationActive: (v: boolean) => void;
}

export const createPresentationSlice: StateCreator<AppState, [], [], PresentationSlice> = (set) => ({
  presentationActive: false,
  setPresentationActive: (presentationActive) => set({ presentationActive }),
});
