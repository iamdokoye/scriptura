import { useEffect, useRef } from "react";
import { useAppStore } from "./store/app";
import { api } from "./lib/tauri";
import { applyAccent, isAccentId } from "./lib/accents";
import { importLegacyLocalStorageIfNeeded } from "./lib/legacyImport";
import TopBar from "./components/TopBar";
import PresentationTopBar from "./components/PresentationTopBar";
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
import { ResizeHandle, useResizable } from "./hooks/useResizable";

export default function App() {
  const {
    view, theme, setTheme, hasModules, setHasModules, setPrimaryModule, setCurrentRef, setView,
    setShowStrongs, setReadingFontSize, isFullscreen, serviceOrderOpen, setServiceOrderOpen,
    hydrateDisplayPrefs, hydrateStudyTools, hydrateSearchHistory, hydrateServiceOrder, hydratePresentationThemes,
    hydrateWorkspace, workspace, accent, setAccent, setMarkerStrongs,
  } = useAppStore();
  const presenting = workspace === "presentation";
  const queueDrawerW = useResizable({
    storageKey: "scriptura.queueDrawerWidth", initial: 324, min: 280, axis: "x", invert: true,
    max: () => Math.round(window.innerWidth * 0.7),
  });

  // Presentation-only views can't be *reached* in Study mode any more (no nav
  // entry, no Present button to get there), but if the workspace toggle
  // flips while one is already open, get out of it immediately rather than
  // leaving the user stranded on a screen Study mode says shouldn't exist.
  useEffect(() => {
    if (!presenting && (view === "live" || view === "customize")) {
      setView("reading");
    }
  }, [presenting, view, setView]);

  // Accent colour preset (indigo = no attribute)
  useEffect(() => { applyAccent(accent); }, [accent]);

  // Apply theme class to root element
  const themeAppliedOnce = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    const next = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    const other = next === "dark" ? "light" : "dark";
    if (root.classList.contains(next) && !root.classList.contains(other)) {
      themeAppliedOnce.current = true;
      return;
    }
    const swap = () => {
      root.classList.remove("light", "dark");
      root.classList.add(next);
    };
    // Cross-fade between palettes — but not on the very first paint, and not
    // for people who've asked their OS for reduced motion. The browser fades a
    // snapshot of the old screen into the new one on the GPU, so it stays
    // smooth even with the frosted-glass panels; animating every element's
    // colours (the earlier approach) repainted the blurred layers each frame
    // and stuttered. Without the API the theme simply switches instantly.
    const animate = themeAppliedOnce.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    themeAppliedOnce.current = true;
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (animate && vt) vt.call(document, swap);
    else swap();
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
        if (isAccentId(prefs.accent)) setAccent(prefs.accent);
        setShowStrongs(prefs.show_strongs);
        setReadingFontSize(prefs.font_size_reading);
        hydrateDisplayPrefs(prefs);
        hydrateStudyTools(prefs);
        hydrateSearchHistory(searchHistory);
        hydrateServiceOrder(serviceOrder);
        hydratePresentationThemes(presentationThemes);
        hydrateWorkspace(prefs.workspace);

        // Auto-install reference modules silently — always, even on first
        // launch. On a fresh install with no Bible at all, also fetch the
        // KJV so the app opens to something readable instead of an empty
        // library. Install failures (offline, blocked) are logged, not
        // fatal — the Modules screen is still there to retry from.
        const installedIds = new Set(modules.map((m) => m.id));
        const hadBible = modules.some((m) => m.category === "Bible");
        const wanted = hadBible ? ["StrongsGreek", "StrongsHebrew", "TSK"] : ["KJV", "StrongsGreek", "StrongsHebrew", "TSK"];
        const missing = wanted.filter((id) => !installedIds.has(id));
        const installsPromise = (async () => {
          for (const id of missing) {
            try {
              await api.installModule(id);
            } catch (e) {
              console.error(`[auto-install ${id}]`, e);
            }
          }
        })();

        // Grammatical markers (G3588, H853…) are left out of the clickable
        // Strong's tags. On a first launch the lexicons are still being
        // installed, so look again once those installs settle.
        const loadMarkers = () => api.listMarkerStrongs().then(setMarkerStrongs).catch(() => {});
        loadMarkers();
        if (missing.length > 0) installsPromise.then(loadMarkers);

        // STEPBible-Data's richer companion lexicons (see the Strong's sheet's
        // pill switcher) aren't SWORD modules, so they don't go through
        // installModule — pre-fetch the two smaller ones now so the first
        // pill click doesn't have to wait on a multi-second download. The
        // full LSJ lexicon (~32MB, opt-in "deep dive" tier) stays lazy —
        // fetched on first actual use instead.
        api.ensureStepBibleLexicon("TBESG").catch(() => {});
        api.ensureStepBibleLexicon("TBESH").catch(() => {});

        // Only a Bible can be the reading module. A library holding just
        // lexicons (StrongsGreek, TSK…) used to fall back to modules[0] and
        // try to read John 3 out of a dictionary.
        const start = (installed: typeof modules) => {
          const bible = installed.find((m) => m.category === "Bible");
          if (!bible) return false;
          setHasModules(true);
          setPrimaryModule(bible.id);
          // Presentation-mode operators land straight in the Live Show console
          // instead of the reading view — study mode keeps today's default.
          setView(prefs.workspace === "presentation" ? "live" : "reading");
          if (pos) {
            setCurrentRef({ book: pos.book, chapter: pos.chapter, verse: pos.verse });
          }
          // Rebuild FTS index for any module that wasn't indexed
          for (const m of installed) {
            if (!m.index_built) {
              api.rebuildSearchIndex(m.id).catch((e) => console.error("[fts rebuild]", m.id, e));
            }
          }
          return true;
        };

        if (!start(modules)) {
          setHasModules(false);
          setView("modules");
          // First launch: once the KJV (and lexicons) finish installing, open
          // straight into reading.
          installsPromise.then(async () => {
            const after = await api.listInstalledModules().catch(() => []);
            start(after);
          });
        }
      } catch {
        // Backend not yet available (dev mode without Tauri) — show modules view
        setView("modules");
      }
    }
    init();
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden ambient text-on-background font-body-ui text-body-ui selection:bg-secondary-container selection:text-on-secondary-container">
      {!isFullscreen && (presenting ? <PresentationTopBar /> : <TopBar />)}

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
              style={{ width: queueDrawerW.size }}
              className={`relative p-3 h-full ${queueDrawerW.dragging ? "" : "transition-transform duration-200 ease-in-out"} ${serviceOrderOpen ? "translate-x-0" : "translate-x-full"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
                <ResizeHandle axis="x" label="service queue" dragging={queueDrawerW.dragging} handleProps={queueDrawerW.handleProps} />
              </div>
              <ServiceOrderPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
