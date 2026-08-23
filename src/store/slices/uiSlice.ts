import type { StateCreator } from "zustand";
import type { AppState, Theme } from "../app";

export interface UiSlice {
  theme: Theme;
  setTheme: (t: Theme) => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  theme: "light",
  setTheme: (theme) => set({ theme }),
  isFullscreen: false,
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
});
