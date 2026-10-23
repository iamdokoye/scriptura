import { create } from "zustand";
import { emptySong, songsApi, type Song, type SongSummary } from "./api";

const AUTOSAVE_MS = 700;

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface SongsState {
  songs: SongSummary[];
  query: string;
  loading: boolean;
  /** Set when the library itself can't be read (e.g. songs.db failed to open). */
  libraryError: string | null;

  draft: Song | null;
  /** Changes whenever a different song is opened, so the editor remounts with fresh local state. */
  draftKey: number;
  status: SaveStatus;
  saveError: string | null;

  refresh: () => Promise<void>;
  setQuery: (q: string) => void;
  select: (id: number) => Promise<void>;
  newSong: () => Promise<void>;
  update: (patch: Partial<Song>) => void;
  flush: () => Promise<void>;
  remove: (id: number) => Promise<void>;
  /** Open a just-imported song and reload the list. */
  afterImport: (firstId?: number) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
// Guards against a slow response for an older query overwriting a newer one.
let listSeq = 0;
// One save at a time, so a debounce firing mid-save can't insert the same new song twice.
let saveInFlight = false;

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

export const useSongsStore = create<SongsState>((set, get) => ({
  songs: [],
  query: "",
  loading: false,
  libraryError: null,
  draft: null,
  draftKey: 0,
  status: "idle",
  saveError: null,

  refresh: async () => {
    const seq = ++listSeq;
    set({ loading: true });
    try {
      const songs = await songsApi.list(get().query);
      if (seq === listSeq) set({ songs, libraryError: null, loading: false });
    } catch (e) {
      if (seq === listSeq) set({ libraryError: msg(e), loading: false });
    }
  },

  setQuery: (query) => {
    set({ query });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void get().refresh(), 150);
  },

  select: async (id) => {
    if (get().draft?.id === id) return;
    await get().flush();
    try {
      const song = await songsApi.get(id);
      set({ draft: song, draftKey: get().draftKey + 1, status: "idle", saveError: null });
    } catch (e) {
      set({ saveError: msg(e) });
    }
  },

  newSong: async () => {
    await get().flush();
    set({ draft: emptySong(), draftKey: get().draftKey + 1, status: "idle", saveError: null });
  },

  update: (patch) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: { ...draft, ...patch }, status: "dirty" });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().flush(), AUTOSAVE_MS);
  },

  flush: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const { draft, status } = get();
    if (!draft || status !== "dirty") return;
    // A song needs a title before it can be stored; keep the edits until then.
    if (!draft.title.trim() || saveInFlight) return;
    saveInFlight = true;
    set({ status: "saving", saveError: null });
    try {
      const saved = await songsApi.save(draft);
      const current = get().draft;
      // Edits made while the save was in flight stay as typed; only adopt the
      // server-assigned identity so the next save updates rather than inserts.
      const stillSameSong = current && (current.id === draft.id || current.id === null);
      if (stillSameSong && current) {
        set({
          draft: { ...current, id: saved.id, updated_at: saved.updated_at },
          status: current === draft ? "saved" : "dirty",
        });
        if (current !== draft) {
          saveTimer = setTimeout(() => void get().flush(), AUTOSAVE_MS);
        }
      }
      await get().refresh();
    } catch (e) {
      set({ status: "error", saveError: msg(e) });
    } finally {
      saveInFlight = false;
    }
  },

  remove: async (id) => {
    try {
      await songsApi.remove(id);
      if (get().draft?.id === id) set({ draft: null, status: "idle" });
      await get().refresh();
    } catch (e) {
      set({ saveError: msg(e) });
    }
  },

  afterImport: async (firstId) => {
    await get().refresh();
    if (firstId !== undefined) await get().select(firstId);
  },
}));
