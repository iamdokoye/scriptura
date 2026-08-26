import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type InstalledModule, type MonitorInfo, type PresentationTheme } from "../lib/tauri";
import BookNavigator from "../components/BookNavigator";
import SideNav from "../components/SideNav";
import StrongsSheet from "../components/StrongsSheet";
import CrossRefSheet from "../components/CrossRefSheet";
import CompareSheet from "../components/CompareSheet";
import CommentarySheet from "../components/CommentarySheet";
import NotesSheet from "../components/NotesSheet";
import FullscreenSearchPalette from "../components/FullscreenSearchPalette";
import ScriptureNav from "../components/ScriptureNav";
import ServiceOrderPanel from "../components/ServiceOrderPanel";
import ErrorBoundary from "../components/ErrorBoundary";
import { PrimaryPane, ParallelPane } from "../components/VersePanes";
import { useReadingShortcuts } from "../hooks/useReadingShortcuts";
import { useScrollSync } from "../hooks/useScrollSync";
import { useChapterData } from "../hooks/useChapterData";
import { usePresentationSync } from "../hooks/usePresentationSync";
import { usePresentationCloseSync } from "../hooks/usePresentationCloseSync";
import { useReadingPositionPersistence } from "../hooks/useReadingPositionPersistence";

export default function ReadingView() {
  const {
    currentRef, setCurrentRef, primaryModule, parallelModule, parallelMode,
    setParallelMode, setParallelModule,
    showStrongs, showCrossRefs, showRedLetter, showCommentary, showNotes,
    setSelectedStrongs, setStrongsGroup, isFullscreen, setIsFullscreen,
    currentSearchResults, searchResultIndex, setSearchResultIndex, setCurrentRef: navTo,
    setView, readingFontSize, setReadingFontSize, setLastHistoryRef,
    displayPrefs, setDisplayPrefs, addToServiceOrder,
    presentationActive, setPresentationActive, selectedStrongs,
    activePresentationTheme, presentationThemes, serviceOrder,
    serviceOrderOpen, setServiceOrderOpen,
    liveBlack, liveEmergency,
  } = useAppStore();

  type VerseRefLocal = { book: string; chapter: number; verse: number };
  const [crossRefVerse, setCrossRefVerse] = useState<VerseRefLocal | null>(null);
  const [compareVerse, setCompareVerse] = useState<VerseRefLocal | null>(null);
  const [commentaryVerse, setCommentaryVerse] = useState<VerseRefLocal | null>(null);
  const [notesVerse, setNotesVerse] = useState<VerseRefLocal | null>(null);
  const [fsSearchOpen, setFsSearchOpen] = useState(false);
  const fsSearchOpenRef = useRef(false);
  fsSearchOpenRef.current = fsSearchOpen;
  const fsScriptureRef = useRef<HTMLInputElement>(null);
  const [bibleModules, setBibleModules] = useState<InstalledModule[]>([]);
  const [showFsParallelPicker, setShowFsParallelPicker] = useState(false);
  const fsParallelPickerRef = useRef<HTMLDivElement>(null);
  const [syncScroll, setSyncScroll] = useState(false);
  const primaryScrollRef = useRef<HTMLDivElement>(null);
  const parallelScrollRef = useRef<HTMLDivElement>(null);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [showMonitorPicker, setShowMonitorPicker] = useState(false);
  const monitorPickerRef = useRef<HTMLDivElement>(null);

  const openCrossRef = useCallback((verse: number) => {
    setCrossRefVerse({ book: currentRef.book, chapter: currentRef.chapter, verse });
  }, [currentRef.book, currentRef.chapter]);

  const openCompare = useCallback((verse: number) => {
    setCompareVerse({ book: currentRef.book, chapter: currentRef.chapter, verse });
  }, [currentRef.book, currentRef.chapter]);

  const openCommentary = useCallback((verse: number) => {
    setCommentaryVerse({ book: currentRef.book, chapter: currentRef.chapter, verse });
  }, [currentRef.book, currentRef.chapter]);

  const openNotes = useCallback((verse: number) => {
    setNotesVerse({ book: currentRef.book, chapter: currentRef.chapter, verse });
  }, [currentRef.book, currentRef.chapter]);

  useEffect(() => {
    api.listInstalledModules()
      .then((mods) => setBibleModules(mods.filter((m) => m.category === "Bible")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.listMonitors().then(setMonitors).catch(() => {});
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (fsParallelPickerRef.current && !fsParallelPickerRef.current.contains(e.target as Node)) {
        setShowFsParallelPicker(false);
      }
      if (monitorPickerRef.current && !monitorPickerRef.current.contains(e.target as Node)) {
        setShowMonitorPicker(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const { chapter, parallelChapter, loading, error } = useChapterData(
    primaryModule, currentRef.book, currentRef.chapter, parallelMode, parallelModule,
  );

  useScrollSync(syncScroll, primaryScrollRef, parallelScrollRef, parallelChapter);

  useReadingPositionPersistence(primaryModule, currentRef);

  // A queued service item may point at another saved theme and then layer only
  // the properties that need a one-off adjustment. Normal Bible navigation
  // remains on the active global theme.
  const effectivePresentationTheme = useMemo(() => {
    const item = serviceOrder.find((candidate) => candidate.book === currentRef.book
      && candidate.chapter === currentRef.chapter && candidate.verse === currentRef.verse
      && candidate.module === primaryModule);
    const override = item?.presentation_override;
    if (!override) return activePresentationTheme;
    const base = override.theme_id
      ? presentationThemes.find((theme) => theme.id === override.theme_id) ?? activePresentationTheme
      : activePresentationTheme;
    if (!base) return null;
    const { theme_id: _themeId, ...properties } = override;
    return { ...base, ...properties } as PresentationTheme;
  }, [activePresentationTheme, currentRef.book, currentRef.chapter, currentRef.verse, presentationThemes, primaryModule, serviceOrder]);

  // black/emergency are set from the Live Show console, but broadcast from
  // wherever presentationActive happens to be true — otherwise switching
  // back to this view while either is engaged would silently clear it on
  // this effect's next fire, since it wouldn't know to keep sending it.
  usePresentationSync({
    presentationActive, primaryModule, currentRef, parallelModule,
    parallelMode, selectedStrongs, displayPrefs, readingFontSize, presentationTheme: effectivePresentationTheme,
    black: liveBlack, emergency: liveEmergency,
  });
  usePresentationCloseSync(setPresentationActive);

  useReadingShortcuts({
    isFullscreen, setIsFullscreen, fsSearchOpenRef, setFsSearchOpen, fsScriptureRef,
    readingFontSize, setReadingFontSize, currentRef, setCurrentRef,
    currentSearchResults, searchResultIndex, setSearchResultIndex, navTo, setLastHistoryRef,
    setView, serviceOrderOpen, setServiceOrderOpen, presentationActive, setDisplayPrefs,
    addCurrentVerseToQueue: () => handleAddToService(currentRef.verse),
  });

  function handleStrongsClick(numbers: string[]) {
    setSelectedStrongs(numbers[0] ?? null);
    setStrongsGroup(numbers.length > 1 ? numbers : null);
  }

  function handleVerseClick(verse: number) {
    setCurrentRef({ book: currentRef.book, chapter: currentRef.chapter, verse });
  }

  function handleAddToService(verse: number) {
    if (!primaryModule || !chapter) return;
    const verseData = chapter.verses.find((v) => v.verse === verse);
    if (!verseData) return;
    const text = verseData.spans.map((s) => s.text).join("").trim();
    addToServiceOrder({
      book: currentRef.book,
      chapter: currentRef.chapter,
      verse,
      text,
      module: primaryModule,
    });
  }

  // Shared bottom sheets — rendered once, fixed-positioned, always above any overlay.
  // Each gets its own error boundary so a crash in one (e.g. cross-references) can't
  // blank the whole reading view — see ErrorBoundary.tsx. Keyed on isOpen + the verse
  // reference so closing and reopening (even to the same verse) remounts a fresh,
  // un-errored instance rather than staying stuck showing the fallback forever.
  const sheets = (
    <>
      <ErrorBoundary compact label="Search">
        <FullscreenSearchPalette isOpen={fsSearchOpen} onClose={() => setFsSearchOpen(false)} />
      </ErrorBoundary>
      <ErrorBoundary compact label="Strong's lookup" key={`strongs-${selectedStrongs ?? "closed"}`}>
        <StrongsSheet />
      </ErrorBoundary>
      <ErrorBoundary
        compact
        label="Cross-references"
        key={`crossref-${showCrossRefs && crossRefVerse !== null}-${crossRefVerse?.book}-${crossRefVerse?.chapter}-${crossRefVerse?.verse}`}
      >
        <CrossRefSheet
          isOpen={showCrossRefs && crossRefVerse !== null}
          book={crossRefVerse?.book ?? ""}
          chapter={crossRefVerse?.chapter ?? 1}
          verse={crossRefVerse?.verse ?? 1}
          onClose={() => setCrossRefVerse(null)}
        />
      </ErrorBoundary>
      <ErrorBoundary
        compact
        label="Compare translations"
        key={`compare-${compareVerse !== null}-${compareVerse?.book}-${compareVerse?.chapter}-${compareVerse?.verse}`}
      >
        <CompareSheet
          isOpen={compareVerse !== null}
          book={compareVerse?.book ?? ""}
          chapter={compareVerse?.chapter ?? 1}
          verse={compareVerse?.verse ?? 1}
          onClose={() => setCompareVerse(null)}
        />
      </ErrorBoundary>
      <ErrorBoundary
        compact
        label="Commentary"
        key={`commentary-${showCommentary && commentaryVerse !== null}-${commentaryVerse?.book}-${commentaryVerse?.chapter}-${commentaryVerse?.verse}`}
      >
        <CommentarySheet
          isOpen={showCommentary && commentaryVerse !== null}
          book={commentaryVerse?.book ?? ""}
          chapter={commentaryVerse?.chapter ?? 1}
          verse={commentaryVerse?.verse ?? 1}
          onClose={() => setCommentaryVerse(null)}
        />
      </ErrorBoundary>
      <ErrorBoundary
        compact
        label="Notes"
        key={`notes-${showNotes && notesVerse !== null}-${notesVerse?.book}-${notesVerse?.chapter}-${notesVerse?.verse}`}
      >
        <NotesSheet
          isOpen={showNotes && notesVerse !== null}
          book={notesVerse?.book ?? ""}
          chapter={notesVerse?.chapter ?? 1}
          verse={notesVerse?.verse ?? 1}
          onClose={() => setNotesVerse(null)}
        />
      </ErrorBoundary>
    </>
  );

  if (isFullscreen) {
    return (
      <>
        <div className="fixed inset-0 z-30 bg-surface flex flex-col overflow-hidden">
          {/* Minimal fullscreen toolbar */}
          <div className="flex items-center gap-3 px-6 py-2 border-b border-outline-variant/40 shrink-0">
            {/* Scripture nav */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                className="p-1 rounded text-secondary hover:bg-surface-container-low transition-colors"
                title="Previous chapter (Ctrl+P)"
                onClick={() => currentRef.chapter > 1 && setCurrentRef({ ...currentRef, chapter: currentRef.chapter - 1, verse: 1 })}
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <ScriptureNav inputRef={fsScriptureRef} />
              <button
                className="p-1 rounded text-secondary hover:bg-surface-container-low transition-colors"
                title="Next chapter (Ctrl+N)"
                onClick={() => setCurrentRef({ ...currentRef, chapter: currentRef.chapter + 1, verse: 1 })}
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>

            <div className="flex-1" />

            {/* Parallel module picker */}
            <div ref={fsParallelPickerRef} className="relative flex items-center gap-1">
              <button
                onClick={() => {
                  const next = !parallelMode;
                  setParallelMode(next);
                  if (next && !parallelModule) setShowFsParallelPicker(true);
                }}
                title="Toggle parallel view"
                className={`p-1.5 rounded transition-colors ${
                  parallelMode ? "bg-secondary-container text-on-secondary-container" : "text-secondary hover:bg-surface-container-low"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">splitscreen</span>
              </button>
              {parallelMode && (
                <button
                  onClick={() => setShowFsParallelPicker((v) => !v)}
                  className="flex items-center gap-0.5 px-2 py-1 rounded text-secondary hover:bg-surface-container-low transition-colors max-w-[120px]"
                  title="Switch parallel translation"
                >
                  <span className="font-metadata-mono text-[11px] truncate">
                    {parallelModule ?? "Pick…"}
                  </span>
                  <span className="material-symbols-outlined text-[12px] shrink-0">expand_more</span>
                </button>
              )}
              {showFsParallelPicker && bibleModules.length > 0 && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-outline-variant rounded-DEFAULT shadow-lg min-w-[160px] max-h-48 overflow-y-auto">
                  {parallelModule && (
                    <button
                      onClick={() => { setParallelModule(null); setShowFsParallelPicker(false); }}
                      className="w-full text-left px-3 py-2 font-body-ui text-body-ui text-secondary hover:bg-surface-container-high"
                    >
                      — None
                    </button>
                  )}
                  {bibleModules.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setParallelModule(m.id); setShowFsParallelPicker(false); }}
                      className={`w-full text-left px-3 py-2 font-body-ui text-body-ui transition-colors ${
                        m.id === parallelModule
                          ? "bg-secondary-container text-on-secondary-container font-medium"
                          : "hover:bg-surface-container-high text-on-surface"
                      }`}
                    >
                      {m.id}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sync scroll toggle (fullscreen, only when parallel is on) */}
            {parallelMode && (
              <button
                title={syncScroll ? "Unsync scroll" : "Sync scroll between panes"}
                onClick={() => setSyncScroll((v) => !v)}
                className={`p-1.5 rounded transition-colors ${
                  syncScroll ? "bg-secondary-container text-on-secondary-container" : "text-secondary hover:bg-surface-container-low"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">sync</span>
              </button>
            )}

            {/* Word search */}
            <button
              onClick={() => setFsSearchOpen(true)}
              title="Word search (Ctrl+K)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT border border-outline-variant bg-surface-container-low hover:bg-surface-container transition-colors text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[16px]">search</span>
              <span className="font-body-ui text-[13px]">Search</span>
              <kbd className="font-metadata-mono text-[10px] border border-outline-variant rounded px-1 py-0.5 ml-1">⌘K</kbd>
            </button>

            {/* Set from the Live Show console — surfaced here too so reading
                normally never hides that the actual output is overridden. */}
            {presentationActive && (liveEmergency || liveBlack) && (
              <span
                className="flex items-center gap-1 px-2.5 py-1 rounded-DEFAULT bg-error text-on-error font-metadata-mono text-[10px] uppercase tracking-widest font-bold"
                title={liveEmergency ? "The output window is showing the emergency standby screen" : "The output window is blacked out"}
              >
                <span className="material-symbols-outlined text-[14px]">{liveEmergency ? "emergency" : "brightness_1"}</span>
                {liveEmergency ? "Emergency" : "Black"}
              </span>
            )}

            {/* Go Live / Stop */}
            <div ref={monitorPickerRef} className="relative flex items-center">
              <button
                onClick={async () => {
                  if (presentationActive) {
                    await api.closePresentationWindow().catch(() => {});
                    setPresentationActive(false);
                  } else if (monitors.length > 1) {
                    setShowMonitorPicker((v) => !v);
                  } else {
                    await api.openPresentationWindow(monitors[0]?.index).catch(() => {});
                    setPresentationActive(true);
                  }
                }}
                title={presentationActive ? "Stop presentation" : "Go live — open presentation window"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT text-[13px] font-body-ui font-semibold transition-colors ${
                  presentationActive
                    ? "bg-error text-on-error hover:bg-error/90"
                    : "bg-primary text-on-primary hover:bg-primary/90"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {presentationActive ? "stop_circle" : "slideshow"}
                </span>
                {presentationActive ? "● LIVE" : "Go Live"}
                {!presentationActive && monitors.length > 1 && (
                  <span className="material-symbols-outlined text-[14px]">expand_more</span>
                )}
              </button>
              {showMonitorPicker && monitors.length > 1 && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-outline-variant rounded-DEFAULT shadow-lg min-w-[220px] overflow-hidden">
                  <div className="px-3 py-1.5 bg-surface-container-low border-b border-outline-variant">
                    <span className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest">
                      Present on…
                    </span>
                  </div>
                  {monitors.map((m) => (
                    <button
                      key={m.index}
                      onClick={async () => {
                        setShowMonitorPicker(false);
                        await api.openPresentationWindow(m.index).catch(() => {});
                        setPresentationActive(true);
                      }}
                      className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 font-body-ui text-body-ui text-on-surface hover:bg-surface-container-high transition-colors"
                    >
                      <span>{m.name ?? `Display ${m.index + 1}`}</span>
                      <span className="font-metadata-mono text-[11px] text-on-surface-variant shrink-0">
                        {m.is_primary ? "Primary · " : ""}{m.width}×{m.height}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Exit fullscreen */}
            <button
              className="p-1.5 rounded text-secondary hover:bg-surface-container-low transition-colors"
              title="Exit fullscreen (Esc or Ctrl+F)"
              onClick={() => setIsFullscreen(false)}
            >
              <span className="material-symbols-outlined text-[18px]">fullscreen_exit</span>
            </button>
          </div>

          <div className="relative flex-1 flex overflow-hidden">
            <PrimaryPane
              chapter={chapter}
              loading={loading}
              error={error}
              currentVerse={currentRef.verse}
              onStrongsClick={handleStrongsClick}
              onVerseClick={handleVerseClick}
              onCrossRefClick={openCrossRef}
              onCompareClick={openCompare}
              onCommentaryClick={openCommentary}
              onNotesClick={openNotes}
              onAddToServiceClick={handleAddToService}
              showBorder={parallelMode}
              showStrongs={showStrongs}
              showCrossRefs={showCrossRefs}
              showRedLetter={showRedLetter}
              showCommentary={showCommentary}
              showNotes={showNotes}
              readingFontSize={readingFontSize}
              displayPrefs={displayPrefs}
              fullscreen
              scrollContainerRef={primaryScrollRef}
            />
            {parallelMode && (
              <>
                <div className="w-px bg-outline-variant shrink-0" />
                {parallelChapter ? (
                  <ParallelPane chapter={parallelChapter} onStrongsClick={handleStrongsClick} showStrongs={showStrongs} readingFontSize={readingFontSize} displayPrefs={displayPrefs} scrollContainerRef={parallelScrollRef} />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-on-surface-variant px-8">
                    <span className="material-symbols-outlined text-[40px] opacity-40">splitscreen</span>
                    <p className="font-body-ui text-body-ui text-center opacity-60">
                      Select a parallel translation using the splitscreen button above.
                    </p>
                  </div>
                )}
              </>
            )}
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
          </div>
        </div>
        {sheets}
      </>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="icon-rail" />

      <main className="flex flex-1 overflow-hidden ml-[64px]">
        <BookNavigator />

        {/* Center reading pane(s) */}
        <section className="flex-1 bg-surface flex flex-col h-full overflow-hidden">
          {/* Reading toolbar */}
          <div className="sticky top-0 bg-surface/95 backdrop-blur-sm border-b border-outline-variant px-content-margin py-2 flex items-center justify-between z-10 shrink-0">
            <h1 className="font-display-lg text-display-lg text-on-surface">
              {currentRef.book} {currentRef.chapter}
            </h1>
            <div className="flex items-center gap-1">
              <button
                title="Previous chapter (Ctrl+P)"
                onClick={() => currentRef.chapter > 1 && setCurrentRef({ ...currentRef, chapter: currentRef.chapter - 1, verse: 1 })}
                className="p-1 rounded text-secondary hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <button
                title="Next chapter (Ctrl+N)"
                onClick={() => setCurrentRef({ ...currentRef, chapter: currentRef.chapter + 1, verse: 1 })}
                className="p-1 rounded text-secondary hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
              {parallelMode && (
                <button
                  title={syncScroll ? "Unsync scroll" : "Sync scroll between panes"}
                  onClick={() => setSyncScroll((v) => !v)}
                  className={`p-1 rounded transition-colors ${
                    syncScroll ? "bg-secondary-container text-on-secondary-container" : "text-secondary hover:bg-surface-container-low"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">sync</span>
                </button>
              )}
              <button
                title="Focus mode (Ctrl+F)"
                onClick={() => setIsFullscreen(true)}
                className="p-1 rounded text-secondary hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">fullscreen</span>
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <PrimaryPane
              chapter={chapter}
              loading={loading}
              error={error}
              currentVerse={currentRef.verse}
              onStrongsClick={handleStrongsClick}
              onVerseClick={handleVerseClick}
              onCrossRefClick={openCrossRef}
              onCompareClick={openCompare}
              onCommentaryClick={openCommentary}
              onNotesClick={openNotes}
              onAddToServiceClick={handleAddToService}
              showBorder={parallelMode}
              showStrongs={showStrongs}
              showCrossRefs={showCrossRefs}
              showRedLetter={showRedLetter}
              showCommentary={showCommentary}
              showNotes={showNotes}
              readingFontSize={readingFontSize}
              displayPrefs={displayPrefs}
              scrollContainerRef={primaryScrollRef}
            />

            {parallelMode && (
              <>
                <div className="w-px bg-outline-variant shrink-0" />
                {parallelChapter ? (
                  <ParallelPane chapter={parallelChapter} onStrongsClick={handleStrongsClick} showStrongs={showStrongs} readingFontSize={readingFontSize} displayPrefs={displayPrefs} scrollContainerRef={parallelScrollRef} />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-on-surface-variant px-8">
                    <span className="material-symbols-outlined text-[40px] opacity-40">splitscreen</span>
                    <p className="font-body-ui text-body-ui text-center opacity-60">
                      Select a parallel translation from the Study Library sidebar.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      {sheets}
    </div>
  );
}
