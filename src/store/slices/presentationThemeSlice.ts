import type { StateCreator } from "zustand";
import type { PresentationTheme } from "../../lib/tauri";
import type { AppState } from "../app";

export interface PresentationThemeSlice {
  presentationThemes: PresentationTheme[];
  activePresentationTheme: PresentationTheme | null;
  hydratePresentationThemes: (themes: PresentationTheme[]) => void;
  setActivePresentationTheme: (theme: PresentationTheme | null) => void;
}

export const createPresentationThemeSlice: StateCreator<AppState, [], [], PresentationThemeSlice> = (set) => ({
  presentationThemes: [],
  activePresentationTheme: null,
  hydratePresentationThemes: (themes) => set({
    presentationThemes: themes,
    activePresentationTheme: themes.find((theme) => theme.is_default) ?? themes[0] ?? null,
  }),
  setActivePresentationTheme: (activePresentationTheme) => set({ activePresentationTheme }),
});
