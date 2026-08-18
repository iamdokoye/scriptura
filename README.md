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
