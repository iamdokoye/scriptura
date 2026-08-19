import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type ChapterText, type TextSpan } from "../lib/tauri";
import { emitPresentation } from "../lib/presentation";
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

const FONT_SIZE_PRESETS = [14, 16, 32, 48, 64, 72, 98] as const;

export default function ReadingView() {
  const {
    currentRef, setCurrentRef, primaryModule, parallelModule, parallelMode,
    showStrongs, showCrossRefs, showRedLetter, showCommentary, showNotes,
    setSelectedStrongs, isFullscreen, setIsFullscreen,
    currentSearchResults, searchResultIndex, setSearchResultIndex, setCurrentRef: navTo,
    setView, readingFontSize, setReadingFontSize, setLastHistoryRef,
    displayPrefs, setDisplayPrefs, addToServiceOrder,
    presentationActive, setPresentationActive, selectedStrongs,
    serviceOrderOpen, setServiceOrderOpen,
  } = useAppStore();

  const [chapter, setChapter] = useState<ChapterText | null>(null);
  const [parallelChapter, setParallelChapter] = useState<ChapterText | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type VerseRef = { book: string; chapter: number; verse: number };
  const [crossRefVerse, setCrossRefVerse] = useState<VerseRef | null>(null);
  const [compareVerse, setCompareVerse] = useState<VerseRef | null>(null);
  const [commentaryVerse, setCommentaryVerse] = useState<VerseRef | null>(null);
  const [notesVerse, setNotesVerse] = useState<VerseRef | null>(null);
  const [fsSearchOpen, setFsSearchOpen] = useState(false);
  const fsSearchOpenRef = useRef(false);
  fsSearchOpenRef.current = fsSearchOpen;
  const fsScriptureRef = useRef<HTMLInputElement>(null);

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
    if (!primaryModule) return;
    setLoading(true);
    setError(null);
    api
      .getChapter(primaryModule, currentRef.book, currentRef.chapter)
      .then((ch) => {
        setChapter(ch);
        const prev = currentRef.chapter - 1;
        const next = currentRef.chapter + 1;
        if (prev >= 1) api.getChapter(primaryModule, currentRef.book, prev).catch(() => {});
        api.getChapter(primaryModule, currentRef.book, next).catch(() => {});
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [primaryModule, currentRef.book, currentRef.chapter]);

  useEffect(() => {
    if (!parallelMode || !parallelModule) { setParallelChapter(null); return; }
    api
      .getChapter(parallelModule, currentRef.book, currentRef.chapter)
      .then(setParallelChapter)
      .catch(() => setParallelChapter(null));
  }, [parallelMode, parallelModule, currentRef.book, currentRef.chapter]);

  // Broadcast state to the presentation window whenever anything changes
  useEffect(() => {
    if (!presentationActive || !primaryModule) return;
    emitPresentation({
      book: currentRef.book,
      chapter: currentRef.chapter,
      verse: currentRef.verse,
      primaryModule,
      parallelModule,
      parallelMode,
      selectedStrongs,
      displayPrefs,
      readingFontSize,
    });
  }, [presentationActive, currentRef, primaryModule, parallelModule, parallelMode, selectedStrongs, displayPrefs]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const alt = e.altKey;

      // Ctrl+F: toggle fullscreen
      if (ctrl && e.code === "KeyF") {
        e.preventDefault();
        setIsFullscreen(!isFullscreen);
        return;
      }

      // Escape: close fullscreen search palette first, then exit fullscreen.
      // Read from a ref (not the closure) so we always see the current value.
      if (e.code === "Escape") {
        if (fsSearchOpenRef.current) { setFsSearchOpen(false); return; }
        if (isFullscreen) { setIsFullscreen(false); return; }
      }

      // Ctrl+K in fullscreen: open word search palette
      if (ctrl && e.code === "KeyK" && isFullscreen) {
        e.preventDefault();
        setFsSearchOpen(true);
        return;
      }

      // Ctrl+L in fullscreen: focus scripture nav
      if (ctrl && e.code === "KeyL" && isFullscreen) {
        e.preventDefault();
        setTimeout(() => fsScriptureRef.current?.focus(), 30);
        return;
      }

      // Ctrl+= or Ctrl++: increase font size by 1px
      if (ctrl && !alt && (e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        const next = Math.min(98, readingFontSize + 1);
        setReadingFontSize(next);
        api.setPreferences({ font_size_reading: next }).catch(() => {});
        return;
      }

      // Ctrl+-: decrease font size by 1px
      if (ctrl && !alt && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        const next = Math.max(14, readingFontSize - 1);
        setReadingFontSize(next);
        api.setPreferences({ font_size_reading: next }).catch(() => {});
        return;
      }

      // Ctrl+Alt++ / Ctrl+Alt+=: jump to next preset size
      if (ctrl && alt && (e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        const next = FONT_SIZE_PRESETS.find((s) => s > readingFontSize) ?? FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
        setReadingFontSize(next);
        api.setPreferences({ font_size_reading: next }).catch(() => {});
        return;
      }

      // Ctrl+Alt+-: jump to previous preset size
      if (ctrl && alt && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        const prev = [...FONT_SIZE_PRESETS].reverse().find((s) => s < readingFontSize) ?? FONT_SIZE_PRESETS[0];
        setReadingFontSize(prev);
        api.setPreferences({ font_size_reading: prev }).catch(() => {});
        return;
      }

      // Ctrl+P: previous chapter
      if (ctrl && e.code === "KeyP") {
        e.preventDefault();
        if (currentRef.chapter > 1) {
          setCurrentRef({ ...currentRef, chapter: currentRef.chapter - 1, verse: 1 });
        }
        return;
      }

      // Ctrl+N: next chapter
      if (ctrl && e.code === "KeyN") {
        e.preventDefault();
        setCurrentRef({ ...currentRef, chapter: currentRef.chapter + 1, verse: 1 });
        return;
      }

      // Alt+H: go to search history view (use code for macOS Option key)
      if (alt && e.code === "KeyH") {
        e.preventDefault();
        setView("history");
        return;
      }

      // Alt+P: previous search result (Option+P on Mac produces "π" but code is still KeyP)
      if (alt && e.code === "KeyP" && currentSearchResults.length > 0) {
        e.preventDefault();
        const idx = searchResultIndex <= 0 ? 0 : searchResultIndex - 1;
        const r = currentSearchResults[idx];
        if (r) {
          setSearchResultIndex(idx);
          const ref = { book: r.book, chapter: r.chapter, verse: r.verse };
          navTo(ref);
          setLastHistoryRef(ref);
        }
        return;
      }

      // Alt+N: next search result
      if (alt && e.code === "KeyN" && currentSearchResults.length > 0) {
        e.preventDefault();
        const idx = Math.min(searchResultIndex + 1, currentSearchResults.length - 1);
        const r = currentSearchResults[idx];
        if (r) {
          setSearchResultIndex(idx);
          const ref = { book: r.book, chapter: r.chapter, verse: r.verse };
          navTo(ref);
          setLastHistoryRef(ref);
        }
        return;
      }

      // Ctrl+Q: toggle service order panel
      if (ctrl && e.code === "KeyQ") {
        e.preventDefault();
        setServiceOrderOpen(!serviceOrderOpen);
        return;
      }

      // Ctrl+1–4: presentation verse context (only when presentation is active)
      if (ctrl && presentationActive) {
        const ctxMap: Record<string, 1 | 2 | 3 | 4> = {
          Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4,
          Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4,
        };
        if (e.code in ctxMap) {
          e.preventDefault();
          setDisplayPrefs({ presentationContext: ctxMap[e.code] });
          return;
        }
      }
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [
    isFullscreen, currentRef, currentSearchResults,
    searchResultIndex, readingFontSize, presentationActive,
    serviceOrderOpen, setServiceOrderOpen,
    setIsFullscreen, setCurrentRef, navTo,
    setSearchResultIndex, setView, setReadingFontSize, setLastHistoryRef,
    setDisplayPrefs,
  ]);

  function handleStrongsClick(strongs: string) {
    setSelectedStrongs(strongs);
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

  // Shared bottom sheets — rendered once, fixed-positioned, always above any overlay
  const sheets = (
    <>
      <FullscreenSearchPalette isOpen={fsSearchOpen} onClose={() => setFsSearchOpen(false)} />
      <StrongsSheet />
      <CrossRefSheet
        isOpen={showCrossRefs && crossRefVerse !== null}
        book={crossRefVerse?.book ?? ""}
        chapter={crossRefVerse?.chapter ?? 1}
        verse={crossRefVerse?.verse ?? 1}
        onClose={() => setCrossRefVerse(null)}
      />
      <CompareSheet
        isOpen={compareVerse !== null}
        book={compareVerse?.book ?? ""}
        chapter={compareVerse?.chapter ?? 1}
        verse={compareVerse?.verse ?? 1}
        onClose={() => setCompareVerse(null)}
      />
      <CommentarySheet
        isOpen={showCommentary && commentaryVerse !== null}
        book={commentaryVerse?.book ?? ""}
        chapter={commentaryVerse?.chapter ?? 1}
        verse={commentaryVerse?.verse ?? 1}
        onClose={() => setCommentaryVerse(null)}
      />
      <NotesSheet
        isOpen={showNotes && notesVerse !== null}
        book={notesVerse?.book ?? ""}
        chapter={notesVerse?.chapter ?? 1}
        verse={notesVerse?.verse ?? 1}
        onClose={() => setNotesVerse(null)}
      />
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

            {/* Go Live / Stop */}
            <button
              onClick={async () => {
                if (presentationActive) {
                  await api.closePresentationWindow().catch(() => {});
                  setPresentationActive(false);
                } else {
                  await api.openPresentationWindow().catch(() => {});
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
            </button>

            {/* Exit fullscreen */}
            <button
              className="p-1.5 rounded text-secondary hover:bg-surface-container-low transition-colors"
              title="Exit fullscreen (Esc or Ctrl+F)"
              onClick={() => setIsFullscreen(false)}
            >
              <span className="material-symbols-outlined text-[18px]">fullscreen_exit</span>
            </button>
          </div>

          <div className="relative flex-1 overflow-y-auto">
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
              showBorder={false}
              showStrongs={showStrongs}
              showCrossRefs={showCrossRefs}
              showRedLetter={showRedLetter}
              showCommentary={showCommentary}
              showNotes={showNotes}
              readingFontSize={readingFontSize}
              displayPrefs={displayPrefs}
              fullscreen
            />
            <div className={`absolute right-0 top-0 h-full w-[300px] z-20 transition-transform duration-200 ease-in-out ${serviceOrderOpen ? "translate-x-0" : "translate-x-full"}`}>
              <ServiceOrderPanel />
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
            />

            {parallelMode && parallelChapter && (
              <>
                <div className="w-px bg-outline-variant shrink-0" />
                <ParallelPane chapter={parallelChapter} onStrongsClick={handleStrongsClick} showStrongs={showStrongs} readingFontSize={readingFontSize} displayPrefs={displayPrefs} />
              </>
            )}
          </div>
        </section>
      </main>

      {sheets}
    </div>
  );
}

const FONT_FAMILY_CSS: Record<string, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  serif:  `Georgia, "Palatino Linotype", Palatino, serif`,
  times:  `"Times New Roman", Times, serif`,
  mono:   `"Courier New", Courier, monospace`,
};

function PrimaryPane({
  chapter, loading, error, currentVerse, onStrongsClick, onVerseClick, onCrossRefClick, onCompareClick, onCommentaryClick, onNotesClick, onAddToServiceClick, showBorder, showStrongs, showCrossRefs, showRedLetter, showCommentary, showNotes, readingFontSize, displayPrefs, fullscreen,
}: {
  chapter: ChapterText | null;
  loading: boolean;
  error: string | null;
  currentVerse: number;
  onStrongsClick: (s: string) => void;
  onVerseClick: (verse: number) => void;
  onCrossRefClick: (verse: number) => void;
  onCompareClick: (verse: number) => void;
  onCommentaryClick: (verse: number) => void;
  onNotesClick: (verse: number) => void;
  onAddToServiceClick: (verse: number) => void;
  showBorder: boolean;
  showStrongs: boolean;
  showCrossRefs: boolean;
  showRedLetter: boolean;
  showCommentary: boolean;
  showNotes: boolean;
  readingFontSize: number;
  displayPrefs: import("../store/app").DisplayPrefs;
  fullscreen?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevChapterRef = useRef<ChapterText | null>(null);

  useEffect(() => {
    if (!chapter) return;
    const isNewChapter = chapter !== prevChapterRef.current;
    prevChapterRef.current = chapter;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-verse="${currentVerse}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: isNewChapter ? "start" : "nearest" });
  }, [chapter, currentVerse]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><span className="font-body-ui text-body-ui text-on-surface-variant">Loading…</span></div>;
  if (error) return <div className="flex-1 p-8"><p className="font-body-ui text-body-ui text-error">{error}</p></div>;
  if (!chapter) return <div className="flex-1 flex items-center justify-center"><span className="font-body-ui text-body-ui text-on-surface-variant">Select a module to begin reading.</span></div>;

  const maxWidth = fullscreen ? "100%" : "1100px";
  const horizPadding = `max(16px, ${displayPrefs.margins / 2}%)`;
  const textStyle: React.CSSProperties = {
    fontSize: `${readingFontSize}px`,
    lineHeight: 1 + displayPrefs.lineSpacing,
    letterSpacing: displayPrefs.letterSpacing === 0 ? undefined : `${(displayPrefs.letterSpacing * 0.1).toFixed(3)}em`,
    textAlign: displayPrefs.textAlign,
    fontFamily: FONT_FAMILY_CSS[displayPrefs.fontFamily],
  };

  return (
    <div ref={scrollRef} className={`flex-1 overflow-y-auto ${showBorder ? "border-r border-outline-variant" : ""}`}>
      <div className="mx-auto w-full py-8 space-y-4" style={{ maxWidth, paddingLeft: horizPadding, paddingRight: horizPadding }}>
        {chapter.verses.map((v) => (
          <VerseRow
            key={v.verse}
            verse={v.verse}
            spans={v.spans}
            active={v.verse === currentVerse}
            onStrongsClick={onStrongsClick}
            onVerseClick={() => onVerseClick(v.verse)}
            onCrossRefClick={() => onCrossRefClick(v.verse)}
            onCompareClick={() => onCompareClick(v.verse)}
            onCommentaryClick={() => onCommentaryClick(v.verse)}
            onNotesClick={() => onNotesClick(v.verse)}
            onAddToServiceClick={() => onAddToServiceClick(v.verse)}
            showStrongs={showStrongs}
            showCrossRefs={showCrossRefs}
            showRedLetter={showRedLetter}
            showCommentary={showCommentary}
            showNotes={showNotes}
            textStyle={textStyle}
          />
        ))}
      </div>
    </div>
  );
}

function ParallelPane({ chapter, onStrongsClick, showStrongs, readingFontSize, displayPrefs }: { chapter: ChapterText; onStrongsClick: (s: string) => void; showStrongs: boolean; readingFontSize: number; displayPrefs: import("../store/app").DisplayPrefs }) {
  const horizPadding = `max(16px, ${displayPrefs.margins / 2}%)`;
  const textStyle: React.CSSProperties = {
    fontSize: `${readingFontSize}px`,
    lineHeight: 1 + displayPrefs.lineSpacing,
    letterSpacing: displayPrefs.letterSpacing === 0 ? undefined : `${(displayPrefs.letterSpacing * 0.1).toFixed(3)}em`,
    textAlign: displayPrefs.textAlign,
    fontFamily: FONT_FAMILY_CSS[displayPrefs.fontFamily],
  };
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto w-full py-8 space-y-4" style={{ paddingLeft: horizPadding, paddingRight: horizPadding }}>
        <h2 className="font-headline-md text-headline-md text-primary mb-4 border-b border-outline-variant pb-2">
          {chapter.module_id}
        </h2>
        {chapter.verses.map((v) => (
          <VerseRow
            key={v.verse}
            verse={v.verse}
            spans={v.spans}
            active={false}
            onStrongsClick={onStrongsClick}
            onVerseClick={() => {}}
            onCrossRefClick={() => {}}
            onCompareClick={() => {}}
            onCommentaryClick={() => {}}
            onNotesClick={() => {}}
            onAddToServiceClick={() => {}}
            showStrongs={showStrongs}
            showCrossRefs={false}
            showRedLetter={false}
            showCommentary={false}
            showNotes={false}
            textStyle={textStyle}
          />
        ))}
      </div>
    </div>
  );
}

const VerseRow = memo(function VerseRow({
  verse, spans, active, onStrongsClick, onVerseClick, onCrossRefClick, onCompareClick, onCommentaryClick, onNotesClick, onAddToServiceClick, showStrongs, showCrossRefs, showRedLetter, showCommentary, showNotes, textStyle,
}: {
  verse: number;
  spans: TextSpan[];
  active: boolean;
  onStrongsClick: (s: string) => void;
  onVerseClick: () => void;
  onCrossRefClick: () => void;
  onCompareClick: () => void;
  onCommentaryClick: () => void;
  onNotesClick: () => void;
  onAddToServiceClick: () => void;
  showStrongs: boolean;
  showCrossRefs: boolean;
  showRedLetter: boolean;
  showCommentary: boolean;
  showNotes: boolean;
  textStyle: React.CSSProperties;
}) {
  return (
    <div
      data-verse={verse}
      className={`verse-container relative group flex gap-3 p-verse-padding rounded-DEFAULT transition-colors cursor-pointer ${
        active
          ? "bg-surface-container-lowest border border-outline-variant shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
          : "hover:bg-surface-container-low"
      }`}
      onClick={onVerseClick}
    >
      <span
        className={`font-verse-number text-verse-number mt-2 w-6 text-right select-none shrink-0 ${
          active ? "text-primary font-bold" : "text-secondary"
        }`}
      >
        {verse}
      </span>
      <p
        className="font-body-reading text-on-surface flex-1 select-text"
        style={textStyle}
      >
        {spans.map((span, i) => {
          const red = showRedLetter && span.is_red_letter;
          if (span.strongs && showStrongs) {
            return (
              <span
                key={i}
                className={`strongs-word relative group/word border-b border-dashed hover:bg-secondary/10 pb-0.5 ${red ? "text-red-600 dark:text-red-400 border-red-400" : "border-primary"}`}
                title="Double-click to look up in concordance"
                onDoubleClick={(e) => { e.stopPropagation(); onStrongsClick(span.strongs!); }}
              >
                <span className="strongs-tag absolute -top-3 left-1/2 -translate-x-1/2 font-metadata-mono text-[9px] text-secondary opacity-0 transition-opacity">
                  {span.strongs}
                </span>
                {span.text}
              </span>
            );
          }
          if (span.is_added) {
            return <em key={i} className={red ? "text-red-600 dark:text-red-400" : undefined}>{span.text}</em>;
          }
          return <span key={i} className={red ? "text-red-600 dark:text-red-400" : undefined}>{span.text}</span>;
        })}
      </p>

      <div className="verse-actions absolute -right-2 top-2 opacity-0 pointer-events-none flex flex-col gap-1 bg-surface border border-outline-variant shadow-sm rounded p-1 transition-opacity z-10">
        <button className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded" title="Copy">
          <span className="material-symbols-outlined text-[16px]">content_copy</span>
        </button>
        {showNotes && (
          <button
            className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
            title="Add note"
            onClick={(e) => { e.stopPropagation(); onNotesClick(); }}
          >
            <span className="material-symbols-outlined text-[16px]">edit_note</span>
          </button>
        )}
        <button className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded" title="Bookmark">
          <span className="material-symbols-outlined text-[16px]">bookmark_add</span>
        </button>
        {showCommentary && (
          <button
            className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
            title="Commentary"
            onClick={(e) => { e.stopPropagation(); onCommentaryClick(); }}
          >
            <span className="material-symbols-outlined text-[16px]">library_books</span>
          </button>
        )}
        {showCrossRefs && (
          <button
            className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
            title="Cross-references"
            onClick={(e) => { e.stopPropagation(); onCrossRefClick(); }}
          >
            <span className="material-symbols-outlined text-[16px]">link</span>
          </button>
        )}
        <button
          className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
          title="Compare translations"
          onClick={(e) => { e.stopPropagation(); onCompareClick(); }}
        >
          <span className="material-symbols-outlined text-[16px]">compare</span>
        </button>
        <button
          className="p-1 text-secondary hover:text-primary hover:bg-secondary-container rounded"
          title="Add to service queue"
          onClick={(e) => { e.stopPropagation(); onAddToServiceClick(); }}
        >
          <span className="material-symbols-outlined text-[16px]">playlist_add</span>
        </button>
      </div>
    </div>
  );
});
