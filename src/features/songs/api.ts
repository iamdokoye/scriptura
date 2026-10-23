import { invoke } from "@tauri-apps/api/core";

export interface SongSection {
  key: string;
  label: string;
  lyrics: string;
}

export interface Song {
  id: number | null;
  title: string;
  author: string;
  copyright: string;
  ccli_number: string;
  key: string;
  tempo: string;
  tags: string[];
  notes: string;
  /** Section keys in playing order; empty means sections in stored order. */
  arrangement: string[];
  favourite: boolean;
  sections: SongSection[];
  updated_at: number;
}

export interface SongSummary {
  id: number;
  title: string;
  author: string;
  copyright: string;
  ccli_number: string;
  tags: string[];
  favourite: boolean;
  updated_at: number;
}

export interface ImportSummary {
  imported: SongSummary[];
  skipped: string[];
}

export const songsApi = {
  list: (query?: string) => invoke<SongSummary[]>("list_songs", { query: query?.trim() || null }),
  get: (id: number) => invoke<Song>("get_song", { id }),
  save: (song: Song) => invoke<Song>("save_song", { song }),
  remove: (id: number) => invoke<void>("delete_song", { id }),
  parseImport: (fileName: string, content: string) =>
    invoke<Song[]>("parse_song_import", { fileName, content }),
  importSongs: (songs: Song[]) => invoke<ImportSummary>("import_songs", { songs }),
};

export function emptySong(): Song {
  return {
    id: null, title: "", author: "", copyright: "", ccli_number: "", key: "", tempo: "",
    tags: [], notes: "", arrangement: [], favourite: false, sections: [], updated_at: 0,
  };
}
