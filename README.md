# Scriptura

Open-source desktop Bible study app — an alternative to e-Sword/Xiphos with a modern UI.

Built with Tauri 2.0 (Rust backend) + React + Vite + Tailwind CSS.

## Prerequisites

- Rust 1.77+ (`rustup` — already installed)
- Node 18+ / npm
- Xcode (macOS) — already present

## Running in development

```bash
source "$HOME/.cargo/env"   # if Rust isn't in PATH yet
npm install
npm run tauri dev
```

The first `tauri dev` will compile the Rust backend (~2–3 min). Subsequent runs reuse the cache.

## Adding a test module for local dev

1. Download the KJV zip from CrossWire:
   ```
   https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip
   ```
2. Unzip it into `~/.local/share/com.scriptura.app/modules/KJV/` (macOS: `~/Library/Application Support/com.scriptura.app/modules/KJV/`)
3. Relaunch the app — it will find the module on startup.

Or use the in-app module manager (the Modules view) which downloads and installs automatically.

## Project structure

```
src/                       Frontend (React + Vite)
├── components/
│   ├── TopBar.tsx         Global top bar (logo, ref breadcrumb, search, icons)
│   ├── SideNav.tsx        Left nav — "icon-rail" (64px, reading views) or "full" (280px)
│   ├── BookNavigator.tsx  Book/chapter accordion pane (reading views only)
│   └── StudyPanel/        Right study panel: Lexicon, Commentary, Notes tabs
├── views/                 One file per top-level screen
├── store/app.ts           Zustand global state
└── lib/tauri.ts           Typed invoke() wrappers for all Tauri commands

src-tauri/src/
├── commands/mod.rs        All #[tauri::command] handlers
├── sword/
│   ├── bible.rs           RawText + zText Bible reader (verse-keyed)
│   ├── lexicon.rs         RawLD lexicon reader (string-keyed, Strong's)
│   └── conf.rs            .conf file parser
├── markup/
│   ├── osis.rs            OSIS XML → TextSpan (primary)
│   ├── gbf.rs             GBF → TextSpan (fallback, basic)
│   └── thml.rs            ThML → TextSpan (fallback, basic)
├── db/mod.rs              SQLite: FTS5 search, bookmarks, notes, prefs, position
├── modules/mod.rs         Module download, install, registry
├── versification.rs       KJV verse ordinal tables
└── types.rs               All shared Rust structs + AppError
```

## What's fully working

- Full UI shell: all screens (Reading, Search, Modules, Bookmarks/Notes, Settings)
- SQLite: bookmarks, notes, preferences, reading position — all persistent
- FTS5 search — indexes module text after install, searches across modules
- Module manager: download + install from CrossWire, progress events, cipher key modal
- OSIS markup parser: text + Strong's numbers + morphology + italics as structured data
- GBF parser: text + Strong's (basic, no formatting)
- ThML parser: text + Strong's sync tags (basic)
- Light/dark/system theme toggle, font-size preference, verse layout preference
- RawText Bible reader (uncompressed modules, e.g. KJV)
- zText Bible reader (compressed modules, e.g. ESV) — index parsing implemented
- RawLD lexicon reader (uncompressed Strong's dictionaries)
- Sidebar: collapsed 64px icon rail in reading views, full 280px in utility views

## Known gaps / TODOs

| Area | Status |
|---|---|
| **zText byte layout** | Fixed: 10 bytes/verse (`u32 block_num` + `u32 verse_start` + `u16 verse_size`), matching SWORD `ztext.cpp` packed struct. Block table (`.bzs`) was already correct at 12 bytes. |
| **zLD lexicon** | Implemented. Binary search on `.idx`/`.dat` (same as RawLD), block reference after key\0 decoded via `.bzs`/`.bdt` (same block layout as zText). Unvalidated — needs a real zLD module to confirm the 12-byte block-reference layout. |
| **KJV verse ordinal table** | NT section has placeholder values; only OT + Matthew verified against SWORD source. Replace `versification.rs` `VERSE_COUNTS` with authoritative values from SWORD's `kjv.h`. |
| **Cross-references** | `get_cross_references` returns empty. Needs bundled TSK (Treasury of Scripture Knowledge) data file. |
| **Commentary** | `get_commentary` calls `BibleReader::get_verse` and returns plain text — works for any Bible module used as commentary, but real commentary modules (MHC) have different internal structure. Needs commentary-specific reader. |
| **Strong's usage counts** | Implemented. `build_fts_index` now tallies `span.strongs` per book into `strongs_counts` table (same pass as FTS). `get_strongs_entry` accepts a `bible_module_id` param and populates `usage_count` + `usage_by_book` from the DB. |
| **FTS index building** | Implemented. `build_fts_index()` runs as Phase 2 of install (60–95%), iterating all books/chapters via `BibleReader`, then bulk-inserting into FTS5 via `db.replace_module_index()`. |
| **GBF parser** | Handles the most common tag patterns (`<WT…>` for Strong's). Unknown tags are silently skipped — this is correct behavior, not a bug. |
| **Versification mismatch** | Only KJV versification is implemented. Modules with different versification will silently misalign chapter/verse offsets. The conf parser reads the `Versification` field and stores it, but no alternate table is used. |
| **Font bundling** | Done. Text fonts via `@fontsource-variable` npm packages; Material Symbols Outlined WOFF2 (variable, all axes) downloaded to `src/assets/fonts/`. All resolved and hashed by Vite at build time. App works fully offline. |
| **Icon** | Placeholder 32×32 green PNG. Replace with a proper `.icns` (macOS) and `.ico` (Windows). |
| **Sync & Backup** | Disabled stub in Settings. Not scoped for this version. |
