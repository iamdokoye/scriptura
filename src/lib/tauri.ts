import { invoke } from "@tauri-apps/api/core";

// ── Types mirroring Rust structs ─────────────────────────────────────────────

export interface TextSpan {
  text: string;
  strongs?: string;     // e.g. "G25"
  morph?: string;       // morphology tag
  is_added?: boolean;   // italics / added words
  is_footnote?: boolean;
  is_red_letter?: boolean; // words of Jesus (red letter)
}

export interface VerseText {
  book: string;
  chapter: number;
  verse: number;
  spans: TextSpan[];
}

export interface ChapterText {
  module_id: string;
  book: string;
  chapter: number;
  verses: VerseText[];
}

export interface StrongsEntry {
  number: string;      // "G25"
  lemma: string;       // "ἀγαπάω"
  transliteration: string;
  part_of_speech: string;
  short_def: string;
  long_def: string;
  usage_count: number;
  usage_by_book: BookUsage[];
}

export interface BookUsage {
  book: string;
  count: number;
}

export interface SearchResult {
  module_id: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  highlights: [number, number][]; // [start, end] byte ranges
}

export interface SearchOptions {
  modules: string[];
  testament?: "OT" | "NT" | "all";
  book_filter?: string[];
  page?: number;
  page_size?: number;
}

export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  language: string;
  version: string;
  category: "Bible" | "Commentary" | "Lexicon" | "Dictionary" | "Devotional" | "Other";
  installed: boolean;
  requires_key: boolean;
  has_strongs: boolean;
  size_bytes?: number;
}

export interface InstalledModule extends ModuleInfo {
  install_path: string;
  index_built: boolean;
}

export interface Bookmark {
  id: number;
  book: string;
  chapter: number;
  verse: number;
  module_id: string;
  created_at: string;
  note?: string;
}

export interface Note {
  id: number;
  book: string;
  chapter: number;
  verse: number | null;
  module_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Preferences {
  theme: "light" | "dark" | "system";
  font_size_reading: number;
  show_strongs: boolean;
  show_morph: boolean;
  verse_display: "paragraph" | "verse-per-line";
  default_commentary: string | null;
}

export interface ReadingPosition {
  book: string;
  chapter: number;
  verse: number;
  module_id: string;
}

export interface CrossReference {
  book: string;
  chapter: number;
  verse: number;
  end_verse?: number;
}

// ── Command wrappers ─────────────────────────────────────────────────────────

// Tauri 2.0 renames snake_case Rust command params to camelCase in invoke().
// Nested struct fields (e.g. SearchOptions) use plain serde and stay snake_case.
export const api = {
  getChapter: (module_id: string, book: string, chapter: number) =>
    invoke<ChapterText>("get_chapter", { moduleId: module_id, book, chapter }),

  getVerse: (module_id: string, book: string, chapter: number, verse: number) =>
    invoke<VerseText>("get_verse", { moduleId: module_id, book, chapter, verse }),

  getStrongsEntry: (module_id: string, strongs_number: string, bible_module_id: string) =>
    invoke<StrongsEntry>("get_strongs_entry", {
      moduleId: module_id,
      strongsNumber: strongs_number,
      bibleModuleId: bible_module_id,
    }),

  search: (query: string, options: SearchOptions) =>
    invoke<SearchResult[]>("search", { query, options }),

  searchStrongs: (strongs_number: string, modules: string[]) =>
    invoke<SearchResult[]>("search", {
      query: strongs_number,
      options: { modules, strongs_filter: strongs_number },
    }),

  getCommentary: (module_id: string, book: string, chapter: number, verse: number) =>
    invoke<string>("get_commentary", { moduleId: module_id, book, chapter, verse }),

  getCrossReferences: (book: string, chapter: number, verse: number) =>
    invoke<CrossReference[]>("get_cross_references", { book, chapter, verse }),

  listInstalledModules: () =>
    invoke<InstalledModule[]>("list_installed_modules"),

  rebuildSearchIndex: (module_id: string) =>
    invoke<void>("rebuild_search_index", { moduleId: module_id }),

  listAvailableModules: () =>
    invoke<ModuleInfo[]>("list_available_modules"),

  installModule: (module_id: string) =>
    invoke<void>("install_module", { moduleId: module_id }),

  installModuleWithKey: (module_id: string, key: string) =>
    invoke<void>("install_module_with_key", { moduleId: module_id, key }),

  addBookmark: (book: string, chapter: number, verse: number, module_id: string) =>
    invoke<Bookmark>("add_bookmark", { book, chapter, verse, moduleId: module_id }),

  removeBookmark: (id: number) =>
    invoke<void>("remove_bookmark", { id }),

  listBookmarks: () =>
    invoke<Bookmark[]>("list_bookmarks"),

  addNote: (book: string, chapter: number, verse: number | null, module_id: string, content: string) =>
    invoke<Note>("add_note", { book, chapter, verse, moduleId: module_id, content }),

  updateNote: (id: number, content: string) =>
    invoke<Note>("update_note", { id, content }),

  deleteNote: (id: number) =>
    invoke<void>("delete_note", { id }),

  listNotes: () =>
    invoke<Note[]>("list_notes"),

  getReadingPosition: () =>
    invoke<ReadingPosition | null>("get_reading_position"),

  setReadingPosition: (pos: ReadingPosition) =>
    invoke<void>("set_reading_position", { ...pos }),

  getPreferences: () =>
    invoke<Preferences>("get_preferences"),

  setPreferences: (prefs: Partial<Preferences>) =>
    invoke<void>("set_preferences", { prefs }),

  openPresentationWindow: () =>
    invoke<void>("open_presentation_window"),

  closePresentationWindow: () =>
    invoke<void>("close_presentation_window"),
};
