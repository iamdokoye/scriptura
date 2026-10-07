import type { StateCreator } from "zustand";
import type { AppState, Theme } from "../app";
import type { AccentId } from "../../lib/accents";

export interface UiSlice {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: AccentId;
  setAccent: (a: AccentId) => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  theme: "light",
  setTheme: (theme) => set({ theme }),
  accent: "indigo",
  setAccent: (accent) => set({ accent }),
  isFullscreen: false,
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
});
