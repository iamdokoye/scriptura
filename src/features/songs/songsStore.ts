import { create } from "zustand";
import { emptySong, songsApi, type Song, type SongSummary } from "./api";
import { newSection, SECTION_KINDS } from "./sections";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

interface SongsState {
  songs: SongSummary[];
  query: string;
  loading: boolean;
  /** Set when the library itself can't be read (e.g. songs.db failed to open). */
  libraryError: string | null;
  /** Row highlighted in the list. */
  selectedId: number | null;

  /** The song open in the editor dialog, edited in memory until Apply / OK. */
  editing: boolean;
  draft: Song | null;
  /** JSON of the last saved/loaded draft; the editor is dirty when it differs. */
  baseline: string;
  /** Changes whenever a different song is opened, so the editor remounts fresh. */
  draftKey: number;
  saving: boolean;
  saveError: string | null;

  refresh: () => Promise<void>;
  setQuery: (q: string) => void;
  selectRow: (id: number | null) => void;
  openEditor: (id: number) => Promise<void>;
  newSong: () => void;
  update: (patch: Partial<Song>) => void;
  /** Save and keep the editor open. Returns false if it couldn't be saved. */
  apply: () => Promise<boolean>;
  /** Save and close. */
  ok: () => Promise<void>;
  /** Close without saving. */
  cancel: () => void;
  remove: (id: number) => Promise<void>;
  toggleFavourite: (id: number) => Promise<void>;
  afterImport: (firstId?: number) => Promise<void>;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
// Stops a slow response for an older query overwriting a newer one.
let listSeq = 0;

export const useSongsStore = create<SongsState>((set, get) => ({
  songs: [],
  query: "",
  loading: false,
  libraryError: null,
  selectedId: null,
  editing: false,
  draft: null,
  baseline: "",
  draftKey: 0,
  saving: false,
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

  selectRow: (selectedId) => set({ selectedId }),

  openEditor: async (id) => {
    try {
      const song = await songsApi.get(id);
      set({
        editing: true, draft: song, baseline: JSON.stringify(song),
        draftKey: get().draftKey + 1, saveError: null, selectedId: id,
      });
    } catch (e) {
      set({ saveError: msg(e) });
    }
  },

  newSong: () => {
    // A new song always starts with an empty first verse to type into.
    const song = { ...emptySong(), sections: [newSection(SECTION_KINDS[0], [])] };
    set({ editing: true, draft: song, baseline: JSON.stringify(song), draftKey: get().draftKey + 1, saveError: null });
  },

  update: (patch) => {
    const draft = get().draft;
    if (draft) set({ draft: { ...draft, ...patch } });
  },

  apply: async () => {
    const { draft, saving } = get();
    if (!draft || saving) return false;
    if (!draft.title.trim()) {
      set({ saveError: "Give the song a title first" });
      return false;
    }
    set({ saving: true, saveError: null });
    try {
      const saved = await songsApi.save(draft);
      const current = get().draft;
      if (current === draft) {
        // Nothing changed while saving: adopt the stored version (it may have
        // normalised keys), and the editor is clean again.
        set({ draft: saved, baseline: JSON.stringify(saved), selectedId: saved.id });
      } else if (current) {
        // Typed during the save: keep those edits, take only the new identity.
        set({
          draft: { ...current, id: saved.id, updated_at: saved.updated_at },
          baseline: JSON.stringify({ ...draft, id: saved.id, updated_at: saved.updated_at }),
          selectedId: saved.id,
        });
      }
      await get().refresh();
      return true;
    } catch (e) {
      set({ saveError: msg(e) });
      return false;
    } finally {
      set({ saving: false });
    }
  },

  ok: async () => {
    if (await get().apply()) set({ editing: false, draft: null });
  },

  cancel: () => set({ editing: false, draft: null, saveError: null }),

  remove: async (id) => {
    try {
      await songsApi.remove(id);
      if (get().selectedId === id) set({ selectedId: null });
      await get().refresh();
    } catch (e) {
      set({ libraryError: msg(e) });
    }
  },

  toggleFavourite: async (id) => {
    try {
      const song = await songsApi.get(id);
      await songsApi.save({ ...song, favourite: !song.favourite });
      await get().refresh();
    } catch (e) {
      set({ libraryError: msg(e) });
    }
  },

  afterImport: async (firstId) => {
    await get().refresh();
    if (firstId !== undefined) set({ selectedId: firstId });
  },
}));

/** True when the open draft differs from what's stored. */
export function selectDirty(s: Pick<SongsState, "draft" | "baseline">): boolean {
  return !!s.draft && JSON.stringify(s.draft) !== s.baseline;
}
