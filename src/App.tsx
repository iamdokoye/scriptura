import { useEffect } from "react";
import { useAppStore } from "./store/app";
import { api } from "./lib/tauri";
import { importLegacyLocalStorageIfNeeded } from "./lib/legacyImport";
import TopBar from "./components/TopBar";
import ReadingView from "./views/ReadingView";
import EmptyLibrary from "./views/EmptyLibrary";
import ModuleManager from "./views/ModuleManager";
import SearchResults from "./views/SearchResults";
import SearchHistory from "./views/SearchHistory";
import BookmarksNotes from "./views/BookmarksNotes";
import ServiceOrderPanel from "./components/ServiceOrderPanel";
import ErrorBoundary from "./components/ErrorBoundary";
import CustomizationStudio from "./views/CustomizationStudio";
import LiveShowRunner from "./views/LiveShowRunner";

export default function App() {
  const {
    view, theme, setTheme, hasModules, setHasModules, setPrimaryModule, setCurrentRef, setView,
    setShowStrongs, setReadingFontSize, isFullscreen, serviceOrderOpen, setServiceOrderOpen,
    hydrateDisplayPrefs, hydrateStudyTools, hydrateSearchHistory, hydrateServiceOrder, hydratePresentationThemes,
    hydrateWorkspace, workspace,
  } = useAppStore();
  const presenting = workspace === "presentation";

  // Presentation-only views can't be *reached* in Study mode any more (no nav
  // entry, no Present button to get there), but if the workspace toggle
  // flips while one is already open, get out of it immediately rather than
  // leaving the user stranded on a screen Study mode says shouldn't exist.
  useEffect(() => {
    if (!presenting && (view === "live" || view === "customize")) {
      setView("reading");
    }
  }, [presenting, view, setView]);

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

  // On launch: import any pre-consolidation localStorage data (one-time, see
  // lib/legacyImport.ts), then load preferences + reading position + search
  // history + service order + check for installed modules. The import must
  // finish before the hydration fetches below run, so a device upgrading from
  // an older version sees its imported data immediately instead of only after
  // a second launch.
  useEffect(() => {
    async function init() {
      try {
        await importLegacyLocalStorageIfNeeded();

        const [modules, pos, prefs, searchHistory, serviceOrder, presentationThemes] = await Promise.all([
          api.listInstalledModules(),
          api.getReadingPosition(),
          api.getPreferences(),
          api.listSearchHistory(),
          api.listServiceOrder(),
          api.listPresentationThemes(),
        ]);

        setTheme(prefs.theme);
        setShowStrongs(prefs.show_strongs);
        setReadingFontSize(prefs.font_size_reading);
        hydrateDisplayPrefs(prefs);
        hydrateStudyTools(prefs);
        hydrateSearchHistory(searchHistory);
        hydrateServiceOrder(serviceOrder);
        hydratePresentationThemes(presentationThemes);
        hydrateWorkspace(prefs.workspace);

        // Auto-install reference modules silently — always, even on first launch
        const installedIds = new Set(modules.map((m) => m.id));
        for (const id of ["StrongsGreek", "StrongsHebrew", "TSK"]) {
          if (!installedIds.has(id)) {
            api.installModule(id).catch(() => {});
          }
        }

        // STEPBible-Data's richer companion lexicons (see the Strong's sheet's
        // pill switcher) aren't SWORD modules, so they don't go through
        // installModule — pre-fetch the two smaller ones now so the first
        // pill click doesn't have to wait on a multi-second download. The
        // full LSJ lexicon (~32MB, opt-in "deep dive" tier) stays lazy —
        // fetched on first actual use instead.
        api.ensureStepBibleLexicon("TBESG").catch(() => {});
        api.ensureStepBibleLexicon("TBESH").catch(() => {});

        if (modules.length === 0) {
          setHasModules(false);
          setView("modules");
          return;
        }

        setHasModules(true);
        const bible = modules.find((m) => m.category === "Bible") ?? modules[0];
        setPrimaryModule(bible.id);
        // Presentation-mode operators land straight in the Live Show console
        // instead of the reading view — study mode keeps today's default.
        if (prefs.workspace === "presentation") {
          setView("live");
        }

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

      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Each view gets its own boundary so a crash in one (e.g. Modules) can't
              take TopBar and the rest of the shell down with it — "Go back" just
              switches views, which unmounts the crashed tree instead of reloading. */}
          {view === "reading" && (
            <ErrorBoundary label="Reading" onReset={() => setView("modules")} resetLabel="Go to Modules">
              {hasModules ? <ReadingView /> : <EmptyLibrary />}
            </ErrorBoundary>
          )}
          {view === "modules" && (
            <ErrorBoundary label="Modules" onReset={() => setView("reading")} resetLabel="Go to Reading">
              <ModuleManager />
            </ErrorBoundary>
          )}
          {view === "search" && (
            <ErrorBoundary label="Search" onReset={() => setView("reading")} resetLabel="Go to Reading">
              <SearchResults />
            </ErrorBoundary>
          )}
          {view === "history" && (
            <ErrorBoundary label="History" onReset={() => setView("reading")} resetLabel="Go to Reading">
              <SearchHistory />
            </ErrorBoundary>
          )}
          {presenting && view === "customize" && (
            <ErrorBoundary label="Customization Studio" onReset={() => setView("reading")} resetLabel="Go to Reading">
              <CustomizationStudio />
            </ErrorBoundary>
          )}
          {presenting && view === "live" && (
            <ErrorBoundary label="Live Show" onReset={() => setView("reading")} resetLabel="Go to Reading">
              <LiveShowRunner />
            </ErrorBoundary>
          )}
          {(view === "bookmarks" || view === "notes") && (
            <ErrorBoundary key={view} label={view === "bookmarks" ? "Bookmarks" : "Notes"} onReset={() => setView("reading")} resetLabel="Go to Reading">
              <BookmarksNotes />
            </ErrorBoundary>
          )}
        </div>
        {!isFullscreen && presenting && (
          <div
            className={`absolute inset-0 z-20 flex justify-end transition-all duration-200 ${serviceOrderOpen ? "pointer-events-auto" : "pointer-events-none"}`}
            onClick={() => setServiceOrderOpen(false)}
          >
            <div
              className={`w-[300px] h-full transition-transform duration-200 ease-in-out ${serviceOrderOpen ? "translate-x-0" : "translate-x-full"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <ServiceOrderPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
