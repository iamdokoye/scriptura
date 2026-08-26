import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore, type VerseRef, type ServiceItem } from "../store/app";
import { api, type MonitorInfo } from "../lib/tauri";
import SideNav from "../components/SideNav";
import { useChapterData } from "../hooks/useChapterData";
import { usePresentationSync } from "../hooks/usePresentationSync";
import { usePresentationCloseSync } from "../hooks/usePresentationCloseSync";

function verseText(chapterVerses: { verse: number; spans: { text: string }[] }[] | undefined, verse: number): string {
  return chapterVerses?.find((v) => v.verse === verse)?.spans.map((s) => s.text).join("") ?? "";
}

function sameRef(a: VerseRef, b: VerseRef) {
  return a.book === b.book && a.chapter === b.chapter && a.verse === b.verse;
}

function refLabel(ref: VerseRef) {
  return `${ref.book} ${ref.chapter}:${ref.verse}`;
}

export default function LiveShowRunner() {
  const {
    serviceOrder, currentRef, setCurrentRef, primaryModule,
    presentationActive, setPresentationActive,
    parallelModule, parallelMode, selectedStrongs, displayPrefs, readingFontSize,
    activePresentationTheme,
    liveBlack, setLiveBlack, liveEmergency, setLiveEmergency,
    liveHistory, pushLiveHistory, popLiveHistory,
  } = useAppStore();

  // Defaults to whatever's live/current already, so opening the console never
  // silently changes what's on screen — the operator always previews before
  // anything moves.
  const [previewRef, setPreviewRef] = useState<VerseRef>(
    () => serviceOrder[0] ?? currentRef,
  );
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [showMonitorPicker, setShowMonitorPicker] = useState(false);
  const monitorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listMonitors().then(setMonitors).catch(() => {});
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (monitorPickerRef.current && !monitorPickerRef.current.contains(e.target as Node)) {
        setShowMonitorPicker(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  usePresentationCloseSync(setPresentationActive);
  usePresentationSync({
    presentationActive, primaryModule, currentRef, parallelModule, parallelMode,
    selectedStrongs, displayPrefs, readingFontSize, presentationTheme: activePresentationTheme,
    black: liveBlack, emergency: liveEmergency,
  });

  const { chapter: previewChapter } = useChapterData(primaryModule, previewRef.book, previewRef.chapter, false, null);
  const { chapter: liveChapter } = useChapterData(primaryModule, currentRef.book, currentRef.chapter, false, null);

  const previewQueueIndex = serviceOrder.findIndex((item) => sameRef(item, previewRef));
  const liveQueueIndex = serviceOrder.findIndex((item) => sameRef(item, currentRef));
  const nextItem: ServiceItem | null = liveQueueIndex >= 0 ? serviceOrder[liveQueueIndex + 1] ?? null : null;

  const goLive = useCallback(() => {
    if (sameRef(previewRef, currentRef)) return;
    pushLiveHistory(currentRef);
    setCurrentRef(previewRef);
  }, [previewRef, currentRef, pushLiveHistory, setCurrentRef]);

  const goBack = useCallback(() => {
    const prev = popLiveHistory();
    if (prev) setCurrentRef(prev);
  }, [popLiveHistory, setCurrentRef]);

  const selectQueueItem = useCallback((item: ServiceItem) => {
    setPreviewRef({ book: item.book, chapter: item.chapter, verse: item.verse });
  }, []);

  const stepQueue = useCallback((delta: number) => {
    if (serviceOrder.length === 0) return;
    const from = previewQueueIndex >= 0 ? previewQueueIndex : -1;
    const next = Math.min(Math.max(from + delta, 0), serviceOrder.length - 1);
    const item = serviceOrder[next];
    if (item) selectQueueItem(item);
  }, [serviceOrder, previewQueueIndex, selectQueueItem]);

  // Steps by verse inside the current chapter, crossing into the adjacent
  // chapter at either boundary rather than stopping dead at verse 1 / the
  // last verse — the whole point of keyboard-driven verse nav is not having
  // to reach for the mouse right at a chapter break.
  const stepVerse = useCallback(async (delta: number) => {
    if (!previewChapter || !primaryModule) return;
    const idx = previewChapter.verses.findIndex((v) => v.verse === previewRef.verse);
    const nextIdx = idx + delta;
    if (idx >= 0 && nextIdx >= 0 && nextIdx < previewChapter.verses.length) {
      setPreviewRef({ ...previewRef, verse: previewChapter.verses[nextIdx].verse });
      return;
    }
    const nextChapterNum = previewRef.chapter + (delta > 0 ? 1 : -1);
    if (nextChapterNum < 1) return;
    try {
      const ch = await api.getChapter(primaryModule, previewRef.book, nextChapterNum);
      if (ch.verses.length === 0) return;
      const verse = delta > 0 ? ch.verses[0].verse : ch.verses[ch.verses.length - 1].verse;
      setPreviewRef({ book: previewRef.book, chapter: nextChapterNum, verse });
    } catch {
      // Likely past the start/end of the book — nothing to step into.
    }
  }, [previewChapter, previewRef, primaryModule]);

  async function togglePresentationWindow(monitorIndex?: number) {
    if (presentationActive) {
      await api.closePresentationWindow().catch(() => {});
      setPresentationActive(false);
      return;
    }
    if (monitorIndex === undefined && monitors.length > 1) {
      setShowMonitorPicker(true);
      return;
    }
    setShowMonitorPicker(false);
    await api.openPresentationWindow(monitorIndex ?? monitors[0]?.index).catch(() => {});
    setPresentationActive(true);
  }

  // Keyboard shortcuts, scoped to this console only (not the global reading
  // shortcuts) — an operator running a live show wants Up/Down/Left/Right/
  // Enter to behave predictably without colliding with reading-view bindings.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setLiveEmergency(!liveEmergency);
        return;
      }
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          stepQueue(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          stepQueue(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          stepVerse(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          stepVerse(1);
          break;
        case "Enter":
          e.preventDefault();
          goLive();
          break;
        case "Backspace":
          e.preventDefault();
          goBack();
          break;
        case "c":
        case "C":
          e.preventDefault();
          setLiveBlack(!liveBlack);
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepQueue, stepVerse, goLive, goBack, liveBlack, setLiveBlack, liveEmergency, setLiveEmergency]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
        <header className="px-8 py-5 border-b border-outline-variant bg-surface shrink-0 flex items-center justify-between gap-5">
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Live Show</h1>
            <p className="font-body-ui text-[13px] text-on-surface-variant mt-0.5">
              Preview what's next, then send it live — browsing here never changes what the room sees until you press Go.
            </p>
          </div>

          <div ref={monitorPickerRef} className="relative flex items-center">
            <button
              onClick={() => togglePresentationWindow()}
              title={presentationActive ? "Stop presentation" : "Open the presentation output window"}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-DEFAULT text-[13px] font-body-ui font-semibold transition-colors ${
                presentationActive ? "bg-error text-on-error hover:bg-error/90" : "bg-primary text-on-primary hover:bg-primary/90"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{presentationActive ? "stop_circle" : "slideshow"}</span>
              {presentationActive ? "● LIVE OUTPUT" : "Open Output"}
              {!presentationActive && monitors.length > 1 && <span className="material-symbols-outlined text-[14px]">expand_more</span>}
            </button>
            {showMonitorPicker && monitors.length > 1 && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-outline-variant rounded-DEFAULT shadow-lg min-w-[220px] overflow-hidden">
                <div className="px-3 py-1.5 bg-surface-container-low border-b border-outline-variant">
                  <span className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Present on…</span>
                </div>
                {monitors.map((m) => (
                  <button
                    key={m.index}
                    onClick={() => togglePresentationWindow(m.index)}
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
        </header>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Queue */}
          <aside className="w-[260px] shrink-0 border-r border-outline-variant overflow-y-auto">
            {serviceOrder.length === 0 ? (
              <div className="p-5 text-center">
                <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
                  No items in the service queue yet — add verses from the reading view, or just browse with the arrow keys below.
                </p>
              </div>
            ) : (
              <ul className="py-2">
                {serviceOrder.map((item, idx) => {
                  const isPreview = idx === previewQueueIndex;
                  const isLive = idx === liveQueueIndex;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => selectQueueItem(item)}
                        className={`w-full text-left px-3 py-2 mx-2 mb-1 rounded-DEFAULT border transition-colors ${
                          isPreview
                            ? "border-primary bg-primary/8"
                            : "border-transparent hover:bg-surface-container-low"
                        }`}
                        style={{ width: "calc(100% - 1rem)" }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-metadata-mono text-[10px] text-on-surface-variant">{idx + 1}</span>
                          <span className={`font-body-ui text-[13px] font-semibold ${isPreview ? "text-primary" : "text-on-surface"}`}>
                            {refLabel(item)}
                          </span>
                          {isLive && <span className="font-metadata-mono text-[9px] uppercase tracking-widest text-error ml-auto shrink-0">Live</span>}
                        </div>
                        <p className="font-body-ui text-[11px] text-on-surface-variant leading-snug mt-0.5 line-clamp-2">{item.text}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Preview / Live / Next */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 grid grid-cols-2 gap-px bg-outline-variant overflow-hidden">
              <PreviewPane
                verseRef={previewRef}
                text={verseText(previewChapter?.verses, previewRef.verse)}
                onStepQueue={stepQueue}
                onStepVerse={stepVerse}
              />
              <LivePane
                verseRef={currentRef}
                text={verseText(liveChapter?.verses, currentRef.verse)}
                black={liveBlack}
                emergency={liveEmergency}
                presentationActive={presentationActive}
              />
            </div>
            {nextItem && (
              <div className="shrink-0 border-t border-outline-variant px-6 py-3 flex items-center gap-3 bg-surface-container-lowest">
                <span className="font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant">Next in queue</span>
                <span className="font-body-ui text-[13px] font-semibold text-on-surface">{refLabel(nextItem)}</span>
                <span className="font-body-ui text-[12px] text-on-surface-variant truncate">{nextItem.text}</span>
                <button
                  onClick={() => selectQueueItem(nextItem)}
                  className="ml-auto font-body-ui text-[12px] text-primary hover:underline shrink-0"
                >
                  Preview this
                </button>
              </div>
            )}

            {/* Controls */}
            <div className="shrink-0 border-t border-outline-variant px-6 py-4 flex items-center gap-3 bg-surface">
              <button
                onClick={goLive}
                disabled={sameRef(previewRef, currentRef)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-DEFAULT bg-primary text-on-primary font-body-ui text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                title="Send the previewed verse live (Enter)"
              >
                <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                GO
                <kbd className="font-metadata-mono text-[10px] opacity-70 border border-current rounded px-1">⏎</kbd>
              </button>
              <button
                onClick={goBack}
                disabled={liveHistory.length === 0}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-DEFAULT border border-outline-variant text-on-surface font-body-ui text-[13px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                title="Return to the previously-live verse (Backspace)"
              >
                <span className="material-symbols-outlined text-[18px]">undo</span>
                Back
              </button>
              <button
                onClick={() => setLiveBlack(!liveBlack)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-DEFAULT font-body-ui text-[13px] font-semibold transition-colors ${
                  liveBlack ? "bg-on-surface text-surface" : "border border-outline-variant text-on-surface hover:bg-surface-container-low"
                }`}
                title="Cut the live output to black without losing your place (C)"
              >
                <span className="material-symbols-outlined text-[18px]">{liveBlack ? "brightness_7" : "brightness_1"}</span>
                {liveBlack ? "Clear" : "Black"}
              </button>
              <button
                onClick={() => setLiveEmergency(!liveEmergency)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-DEFAULT font-body-ui text-[13px] font-bold transition-colors ml-auto ${
                  liveEmergency ? "bg-error text-on-error" : "border-2 border-error text-error hover:bg-error-container/30"
                }`}
                title="Override the output with a safe standby screen (Ctrl+Shift+E)"
              >
                <span className="material-symbols-outlined text-[18px]">emergency</span>
                {liveEmergency ? "End emergency" : "Emergency"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PreviewPane({ verseRef, text, onStepQueue, onStepVerse }: {
  verseRef: VerseRef;
  text: string;
  onStepQueue: (delta: number) => void;
  onStepVerse: (delta: number) => void;
}) {
  return (
    <div className="bg-surface flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 py-2.5 flex items-center justify-between border-b border-outline-variant">
        <span className="font-metadata-mono text-[10px] uppercase tracking-widest text-secondary">Preview</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onStepVerse(-1)} className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low" title="Previous verse (←)">
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          <button onClick={() => onStepVerse(1)} className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low" title="Next verse (→)">
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
          <button onClick={() => onStepQueue(-1)} className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low ml-1" title="Previous queue item (↑)">
            <span className="material-symbols-outlined text-[16px]">expand_less</span>
          </button>
          <button onClick={() => onStepQueue(1)} className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low" title="Next queue item (↓)">
            <span className="material-symbols-outlined text-[16px]">expand_more</span>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col justify-center">
        <p className="font-metadata-mono text-[11px] text-on-surface-variant mb-2">{refLabel(verseRef)}</p>
        <p className="font-body-reading text-[20px] leading-relaxed text-on-surface">{text || "—"}</p>
      </div>
    </div>
  );
}

function LivePane({ verseRef, text, black, emergency, presentationActive }: {
  verseRef: VerseRef;
  text: string;
  black: boolean;
  emergency: boolean;
  presentationActive: boolean;
}) {
  const overridden = black || emergency;
  return (
    <div className="bg-black flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 py-2.5 flex items-center gap-2 border-b border-white/10">
        <span className={`w-2 h-2 rounded-full ${presentationActive ? "bg-error animate-pulse" : "bg-white/20"}`} />
        <span className="font-metadata-mono text-[10px] uppercase tracking-widest text-error">Live</span>
        {emergency && <span className="font-metadata-mono text-[10px] uppercase tracking-widest text-white/50 ml-auto">Emergency screen showing</span>}
        {!emergency && black && <span className="font-metadata-mono text-[10px] uppercase tracking-widest text-white/50 ml-auto">Blacked out</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col justify-center">
        {overridden ? (
          <p className="font-body-ui text-[13px] text-white/30 text-center">
            {emergency ? "Standby screen is showing instead of this." : "Black screen is showing instead of this."}
          </p>
        ) : (
          <>
            <p className="font-metadata-mono text-[11px] text-white/40 mb-2">{refLabel(verseRef)}</p>
            <p className="font-body-reading text-[20px] leading-relaxed text-white">{text || "—"}</p>
          </>
        )}
      </div>
    </div>
  );
}
