import { create } from "zustand";
import { songsApi, type Song, type SongSummary } from "./api";
import { readMaxLines } from "./prefs";
import { buildSlides, type Slide } from "./slides";

/** What's on the output: a frozen copy of a song's slides, so edits don't change it mid-service. */
export interface LiveSong {
  songId: number;
  title: string;
  copyright: string;
  slides: Slide[];
  index: number;
}

interface LiveState {
  schedule: SongSummary[];
  /** The scheduled song shown in Preview. */
  previewId: number | null;
  previewSong: Song | null;
  previewIndex: number;
  live: LiveSong | null;

  load: () => Promise<void>;
  /** Re-read the schedule and preview after the library changed (edit, delete, import). */
  syncWithLibrary: () => Promise<void>;
  addToSchedule: (id: number) => Promise<void>;
  removeFromSchedule: (id: number) => Promise<void>;
  moveInSchedule: (id: number, dir: -1 | 1) => Promise<void>;
  clearSchedule: () => Promise<void>;
  preview: (id: number) => Promise<void>;
  setPreviewIndex: (i: number) => void;
  /** Send a slide of the previewed song to the output (defaults to the previewed slide). */
  goLive: (index?: number) => void;
  stepLive: (delta: number) => void;
  setLiveIndex: (i: number) => void;
  /** Take the song off the live panel without touching the output. */
  clearLive: () => void;
}

function slidesFor(song: Song): Slide[] {
  return buildSlides(song, readMaxLines());
}

async function persist(ids: number[]) {
  try { await songsApi.setSchedule(ids); } catch (e) { console.error("[songs] failed to save schedule", e); }
}

export const useSongsLive = create<LiveState>((set, get) => ({
  schedule: [],
  previewId: null,
  previewSong: null,
  previewIndex: 0,
  live: null,

  load: async () => {
    try {
      const schedule = await songsApi.schedule();
      set({ schedule });
      const first = schedule[0];
      if (first && get().previewId === null) await get().preview(first.id);
    } catch (e) {
      console.error("[songs] failed to load schedule", e);
    }
  },

  syncWithLibrary: async () => {
    try {
      const schedule = await songsApi.schedule();
      set({ schedule });
      const { previewId, previewSong } = get();
      if (previewId === null) return;
      const entry = schedule.find((s) => s.id === previewId);
      if (!entry) {
        set({ previewId: null, previewSong: null, previewIndex: 0 });
        if (schedule[0]) await get().preview(schedule[0].id);
      } else if (!previewSong || entry.updated_at !== previewSong.updated_at) {
        const song = await songsApi.get(previewId);
        set({ previewSong: song, previewIndex: 0 });
      }
    } catch (e) {
      console.error("[songs] failed to sync schedule", e);
    }
  },

  addToSchedule: async (id) => {
    const { schedule } = get();
    if (!schedule.some((s) => s.id === id)) {
      await persist([...schedule.map((s) => s.id), id]);
      set({ schedule: await songsApi.schedule().catch(() => schedule) });
    }
    await get().preview(id);
  },

  removeFromSchedule: async (id) => {
    const ids = get().schedule.map((s) => s.id).filter((x) => x !== id);
    await persist(ids);
    set({ schedule: get().schedule.filter((s) => s.id !== id) });
    if (get().previewId === id) {
      set({ previewId: null, previewSong: null, previewIndex: 0 });
      const next = get().schedule[0];
      if (next) await get().preview(next.id);
    }
  },

  moveInSchedule: async (id, dir) => {
    const list = [...get().schedule];
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ schedule: list });
    await persist(list.map((s) => s.id));
  },

  clearSchedule: async () => {
    await persist([]);
    set({ schedule: [], previewId: null, previewSong: null, previewIndex: 0 });
  },

  preview: async (id) => {
    try {
      const song = await songsApi.get(id);
      set({ previewId: id, previewSong: song, previewIndex: 0 });
    } catch (e) {
      console.error("[songs] failed to load song", e);
    }
  },

  setPreviewIndex: (previewIndex) => set({ previewIndex }),

  goLive: (index) => {
    const { previewSong, previewIndex } = get();
    if (!previewSong || previewSong.id === null) return;
    const slides = slidesFor(previewSong);
    if (slides.length === 0) return;
    const i = Math.min(Math.max(index ?? previewIndex, 0), slides.length - 1);
    set({
      previewIndex: i,
      live: { songId: previewSong.id, title: previewSong.title, copyright: previewSong.copyright, slides, index: i },
    });
  },

  stepLive: (delta) => {
    const { live } = get();
    if (!live) return;
    const index = Math.min(Math.max(live.index + delta, 0), live.slides.length - 1);
    if (index !== live.index) set({ live: { ...live, index } });
  },

  setLiveIndex: (index) => {
    const { live } = get();
    if (live && index >= 0 && index < live.slides.length) set({ live: { ...live, index } });
  },

  clearLive: () => set({ live: null }),
}));

/** Slides for the previewed song, using the saved lines-per-slide setting. */
export function previewSlides(song: Song | null): Slide[] {
  return song ? slidesFor(song) : [];
}
