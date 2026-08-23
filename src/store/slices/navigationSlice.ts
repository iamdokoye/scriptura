import type { StateCreator } from "zustand";
import type { AppState, View } from "../app";

export interface NavigationSlice {
  view: View;
  setView: (v: View) => void;

  // First-run
  hasModules: boolean;
  setHasModules: (v: boolean) => void;
}

export const createNavigationSlice: StateCreator<AppState, [], [], NavigationSlice> = (set) => ({
  view: "reading",
  setView: (view) => set({ view }),

  hasModules: false,
  setHasModules: (hasModules) => set({ hasModules }),
});
