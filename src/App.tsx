import { useEffect } from "react";
import { useAppStore } from "./store/app";
import { api } from "./lib/tauri";
import TopBar from "./components/TopBar";
import ReadingView from "./views/ReadingView";
import EmptyLibrary from "./views/EmptyLibrary";
import ModuleManager from "./views/ModuleManager";
import SearchResults from "./views/SearchResults";
import SearchHistory from "./views/SearchHistory";
import BookmarksNotes from "./views/BookmarksNotes";
import ServiceOrderPanel from "./components/ServiceOrderPanel";

export default function App() {
  const { view, theme, setTheme, hasModules, setHasModules, setPrimaryModule, setCurrentRef, setView, setShowStrongs, setReadingFontSize, isFullscreen, serviceOrderOpen } =
    useAppStore();

  // Apply theme class to root element
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      root.classList.add(mq.matches ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  // On launch: load preferences + reading position + check for installed modules
  useEffect(() => {
    async function init() {
      try {
        const [modules, pos, prefs] = await Promise.all([
          api.listInstalledModules(),
          api.getReadingPosition(),
          api.getPreferences(),
        ]);

        setTheme(prefs.theme);
        setShowStrongs(prefs.show_strongs);
        setReadingFontSize(prefs.font_size_reading);

        // Auto-install reference modules silently — always, even on first launch
        const installedIds = new Set(modules.map((m) => m.id));
        for (const id of ["StrongsGreek", "StrongsHebrew", "TSK"]) {
          if (!installedIds.has(id)) {
            api.installModule(id).catch(() => {});
          }
        }

        if (modules.length === 0) {
          setHasModules(false);
          setView("modules");
          return;
        }

        setHasModules(true);
        const bible = modules.find((m) => m.category === "Bible") ?? modules[0];
        setPrimaryModule(bible.id);

        if (pos) {
          setCurrentRef({ book: pos.book, chapter: pos.chapter, verse: pos.verse });
        }

        // Rebuild FTS index for any module that wasn't indexed
        for (const m of modules) {
          if (!m.index_built) {
            api.rebuildSearchIndex(m.id).catch((e) => console.error("[fts rebuild]", m.id, e));
          }
        }
      } catch {
        // Backend not yet available (dev mode without Tauri) — show modules view
        setView("modules");
      }
    }
    init();
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-on-background font-body-ui text-body-ui selection:bg-secondary-container selection:text-on-secondary-container">
      {!isFullscreen && <TopBar />}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {view === "reading" && (hasModules ? <ReadingView /> : <EmptyLibrary />)}
          {view === "modules" && <ModuleManager />}
          {view === "search" && <SearchResults />}
          {view === "history" && <SearchHistory />}
          {(view === "bookmarks" || view === "notes") && <BookmarksNotes />}
        </div>
        {serviceOrderOpen && <ServiceOrderPanel />}
      </div>
    </div>
  );
}
