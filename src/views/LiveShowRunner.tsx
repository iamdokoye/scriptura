import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, type VerseRef, type ServiceItem } from "../store/app";
import { api, type MonitorInfo, type TextSpan } from "../lib/tauri";
import { useChapterData } from "../hooks/useChapterData";
import { usePresentationSync } from "../hooks/usePresentationSync";
import { measureVersePartsDOM } from "../lib/verseSplit";
import { FONT_FAMILY_CSS } from "../components/VersePanes";
import StrongsSheet from "../components/StrongsSheet";
import PresentationSearchBar, { type PresentationSearchBarHandle } from "../components/PresentationSearchBar";
import { ResizeHandle, useResizable } from "../hooks/useResizable";

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
    serviceOrder, clearServiceOrder, addToServiceOrder, setServiceOrderOpen, currentRef, setCurrentRef, primaryModule,
    presentationActive,
    parallelModule, parallelMode, selectedStrongs, strongsGroup, strongsSource, displayPrefs, readingFontSize,
    activePresentationTheme,
    liveBlack, liveEmergency,
    liveHistory, pushLiveHistory, popLiveHistory,
    versePart, setVersePart,
    setSelectedStrongs, setStrongsGroup, showStrongs, showRedLetter,
  } = useAppStore();

  // Same click contract as ReadingView's handleStrongsClick — StrongsSheet
  // (mounted below) picks up selectedStrongs/strongsGroup itself and, since
  // that state is already relayed to the output window, also broadcasts the
  // lookup to the congregation screen.
  const handleStrongsClick = useCallback((numbers: string[]) => {
    setSelectedStrongs(numbers[0] ?? null);
    setStrongsGroup(numbers.length > 1 ? numbers : null);
  }, [setSelectedStrongs, setStrongsGroup]);

  // Defaults to whatever's live/current already, so opening the console never
  // silently changes what's on screen — the operator always previews before
  // anything moves.
  const [previewRef, setPreviewRef] = useState<VerseRef>(
    () => serviceOrder[0] ?? currentRef,
  );
  // Which split part (0-indexed) of previewRef is selected — mirrors
  // `versePart` (the live/global equivalent) but stays local until Go
  // carries it over, same as previewRef itself.
  const [previewPart, setPreviewPart] = useState(0);
  useEffect(() => setPreviewPart(0), [previewRef.book, previewRef.chapter, previewRef.verse]);

  const searchBarRef = useRef<PresentationSearchBarHandle>(null);

  // Every major panel is user-resizable; sizes persist across restarts and
  // double-clicking a divider restores its default.
  const asideW = useResizable({
    storageKey: "scriptura.live.asideWidth", initial: 320, min: 240, axis: "x", invert: true,
    max: () => Math.round(window.innerWidth * 0.6),
  });
  const outputH = useResizable({
    storageKey: "scriptura.live.outputHeight", initial: 186, min: 80, axis: "y",
    max: () => Math.round((asideW.size - 32) * (9 / 16)) + 24,
  });
  const bottomH = useResizable({
    storageKey: "scriptura.live.bottomHeight", initial: Math.round(window.innerHeight * 0.38), min: 200, axis: "y", invert: true,
    max: () => window.innerHeight - 260,
  });
  const previewW = useResizable({
    storageKey: "scriptura.live.previewWidth", initial: 300, min: 220, axis: "x", invert: true,
    max: () => Math.round(window.innerWidth * 0.5),
  });

  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  useEffect(() => {
    api.listMonitors().then(setMonitors).catch(() => {});
  }, []);

  usePresentationSync({
    presentationActive, primaryModule, currentRef, parallelModule, parallelMode,
    selectedStrongs, strongsGroup, strongsSource, displayPrefs, readingFontSize,
    presentationTheme: activePresentationTheme,
    black: liveBlack, emergency: liveEmergency,
    versePart: displayPrefs.splitLongVerses ? versePart : undefined,
  });

  const { chapter: previewChapter } = useChapterData(primaryModule, previewRef.book, previewRef.chapter, false, null);
  const { chapter: liveChapter } = useChapterData(primaryModule, currentRef.book, currentRef.chapter, false, null);

  // Splits verse text into presentation-sized parts by measuring against the
  // actual presentation box dimensions — same approach as ReadingView.tsx, so
  // this console and the output screen always agree on where a verse splits.
  const splitBox = useMemo(() => {
    const ctx = displayPrefs.presentationContext ?? 1;
    const theme = activePresentationTheme;
    const hPadPct = theme?.safe_margin ?? (5 + displayPrefs.margins / 2);
    const screenW = monitors.find((m) => m.is_primary)?.width ?? monitors[0]?.width ?? 1920;
    const screenH = monitors.find((m) => m.is_primary)?.height ?? monitors[0]?.height ?? 1080;

    let boxW: number;
    let boxH: number;
    if (ctx === 1 && theme) {
      boxW = (theme.verse_box_width / 100) * screenW;
      boxH = (theme.verse_box_height / 100) * screenH;
    } else if (ctx === 2 || ctx === 3) {
      boxW = ((100 - 2 * hPadPct) / 100) * screenW;
      boxH = screenH * (ctx === 3 ? 0.5 : 0.6);
    } else {
      boxW = ((100 - 2 * hPadPct - 6) / 100) * screenW;
      boxH = screenH * 0.75;
    }

    const fontFamily = FONT_FAMILY_CSS[theme?.font_family ?? displayPrefs.fontFamily] ?? FONT_FAMILY_CSS.system;
    return {
      boxW, boxH,
      style: {
        fontFamily,
        fontSizePx: readingFontSize * (theme?.font_scale ?? 1),
        lineHeight: 1 + displayPrefs.lineSpacing,
        fontWeight: theme?.text_font_weight ?? 600,
        textAlign: theme?.text_align ?? displayPrefs.textAlign,
      },
    };
  }, [
    displayPrefs.presentationContext, displayPrefs.margins, displayPrefs.fontFamily,
    displayPrefs.lineSpacing, displayPrefs.textAlign, activePresentationTheme, readingFontSize, monitors,
  ]);

  const splitParts = useCallback((text: string) => measureVersePartsDOM(text.trim(), splitBox.boxW, splitBox.boxH, splitBox.style), [splitBox]);

  const previewPartsMap = useMemo(() => {
    const map = new Map<number, string[]>();
    if (!displayPrefs.splitLongVerses || !previewChapter) return map;
    for (const v of previewChapter.verses) {
      map.set(v.verse, splitParts(v.spans.map((s) => s.text).join("")));
    }
    return map;
  }, [displayPrefs.splitLongVerses, previewChapter, splitParts]);

  const previewQueueIndex = serviceOrder.findIndex((item) => sameRef(item, previewRef));
  const liveQueueIndex = serviceOrder.findIndex((item) => sameRef(item, currentRef));
  const nextItem: ServiceItem | null = liveQueueIndex >= 0 ? serviceOrder[liveQueueIndex + 1] ?? null : null;

  const goLive = useCallback(() => {
    const sameVerse = sameRef(previewRef, currentRef);
    if (sameVerse && previewPart === versePart) return;
    if (!sameVerse) pushLiveHistory(currentRef);
    setCurrentRef(previewRef);
    setVersePart(previewPart);
  }, [previewRef, currentRef, previewPart, versePart, pushLiveHistory, setCurrentRef, setVersePart]);

  const goBack = useCallback(() => {
    const prev = popLiveHistory();
    if (prev) setCurrentRef(prev);
  }, [popLiveHistory, setCurrentRef]);

  const selectQueueItem = useCallback((item: ServiceItem) => {
    setPreviewRef({ book: item.book, chapter: item.chapter, verse: item.verse });
  }, []);

  const previewInQueue = previewQueueIndex >= 0;

  // Same Ctrl+Alt+Q binding ReadingView uses to queue the verse it's showing —
  // here it queues whatever's in Preview instead, since that's this console's
  // equivalent of "the verse I'm currently looking at".
  const addPreviewToQueue = useCallback(() => {
    if (!primaryModule || previewInQueue) return;
    addToServiceOrder({
      book: previewRef.book,
      chapter: previewRef.chapter,
      verse: previewRef.verse,
      text: verseText(previewChapter?.verses, previewRef.verse),
      module: primaryModule,
    });
  }, [primaryModule, previewInQueue, previewRef, previewChapter, addToServiceOrder]);

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

  // Keyboard shortcuts, scoped to this console only (not the global reading
  // shortcuts) — an operator running a live show wants Up/Down/Left/Right/
  // Enter to behave predictably without colliding with reading-view bindings.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (e.ctrlKey && e.altKey && e.code === "KeyQ") {
        e.preventDefault();
        addPreviewToQueue();
        return;
      }
      if (e.ctrlKey && !e.altKey && e.code === "KeyL") {
        e.preventDefault();
        searchBarRef.current?.focus("scripture");
        return;
      }
      if (e.ctrlKey && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        searchBarRef.current?.focus("word");
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
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepQueue, stepVerse, goLive, goBack, addPreviewToQueue]);

  const liveText = verseText(liveChapter?.verses, currentRef.verse);
  const liveParts = displayPrefs.splitLongVerses ? splitParts(liveText) : [liveText];
  const liveActiveText = liveParts[versePart] ?? liveParts[0] ?? liveText;
  const liveSplit = liveParts.length > 1;

  const previewText = verseText(previewChapter?.verses, previewRef.verse);
  const previewParts = previewPartsMap.get(previewRef.verse) ?? [previewText];
  const previewActiveText = previewParts[previewPart] ?? previewParts[0] ?? previewText;
  const previewSplit = previewParts.length > 1;

  const overridden = liveBlack || liveEmergency;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3 gap-3">
      {/* Live display + Main Output / Queue */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        <section className="flex-1 min-w-0 flex flex-col overflow-hidden panel rounded-3xl">
          <PanelHeader icon="tv" label="Live display" />
          <div className="flex-1 min-h-0 overflow-y-auto p-6 flex items-start">
            {overridden ? (
              <div className="w-full px-5 py-8 text-center ctl rounded-xl">
                <p className="font-body-ui text-[13px] text-on-surface-variant">
                  {liveEmergency ? "Standby screen is showing on the output." : "Output is cut to black."}
                </p>
              </div>
            ) : (
              <div className="w-full rounded-xl row-selected panel px-6 py-5">
                <p className="font-metadata-mono text-[11px] uppercase tracking-widest text-primary mb-1.5 flex items-center gap-2">
                  {refLabel(currentRef)} {primaryModule ? `(${primaryModule})` : ""}
                  {liveSplit && (
                    <span className="px-1.5 rounded-full border border-primary text-primary normal-case">
                      {versePart + 1}/{liveParts.length}
                    </span>
                  )}
                </p>
                <p className="font-body-reading text-[20px] leading-relaxed text-on-surface">{liveActiveText || "—"}</p>
              </div>
            )}
          </div>
        </section>

        <ResizeHandle axis="x" label="main output and queue" dragging={asideW.dragging} handleProps={asideW.handleProps} />

        <aside style={{ width: asideW.size }} className="shrink-0 flex flex-col overflow-hidden glass rounded-3xl">
          <div className="shrink min-h-0 flex flex-col p-4">
            <PanelHeader icon="monitor" label="Main Output" compact />
            <div className="mt-2 flex justify-center min-h-0" style={{ height: Math.min(outputH.size, Math.round((asideW.size - 32) * (9 / 16)) + 24) }}>
            <div className="h-full aspect-video max-w-full rounded-xl bg-black overflow-hidden flex items-center justify-center p-3">
              {!presentationActive ? (
                <span className="font-body-ui text-[11px] text-white/30">Output closed</span>
              ) : overridden ? (
                <span className="font-body-ui text-[11px] text-white/30">
                  {liveEmergency ? "Standby" : "Black"}
                </span>
              ) : (
                <div className="w-full">
                  <p className="font-metadata-mono text-[8px] text-white/40 mb-1 truncate">
                    {refLabel(currentRef)}{liveSplit ? ` · ${versePart + 1}/${liveParts.length}` : ""}
                  </p>
                  <p className="font-body-reading text-[9px] leading-tight text-white line-clamp-3">{liveActiveText || "—"}</p>
                </div>
              )}
            </div>
            </div>
          </div>
          <div className="px-4">
            <ResizeHandle axis="y" label="main output preview" dragging={outputH.dragging} handleProps={outputH.handleProps} />
          </div>

          <div className="flex-1 min-h-[120px] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-2">
              <span className="font-body-ui text-[13px] font-bold text-on-surface">Queue</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setServiceOrderOpen(true)}
                  className="flex items-center gap-1 font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                  title="Reorder or remove queue items (Ctrl+Q)"
                >
                  <span className="material-symbols-outlined text-[14px]">reorder</span>
                  Edit
                </button>
                {serviceOrder.length > 0 && (
                  <button
                    onClick={clearServiceOrder}
                    className="px-1.5 py-1 -my-1 rounded-md font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-error ghost"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {serviceOrder.length === 0 ? (
                <div className="p-5 text-center">
                  <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
                    No items in the service queue yet — add verses from the reading view, or just browse below.
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
                          className={`w-full text-left px-3 py-2 mx-2 mb-1 rounded-md border border-transparent transition-colors ${
                            isPreview ? "row-selected" : "border-transparent hover:bg-surface-container-low"
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
            </div>
          </div>
        </aside>
      </div>

      {nextItem && (
        <div className="shrink-0 px-6 py-2.5 flex items-center gap-3 glass rounded-2xl">
          <span className="font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant">Next in queue</span>
          <span className="font-body-ui text-[13px] font-semibold text-on-surface">{refLabel(nextItem)}</span>
          <span className="font-body-ui text-[12px] text-on-surface-variant truncate">{nextItem.text}</span>
          <button
            onClick={() => selectQueueItem(nextItem)}
            className="ml-auto px-2 py-1 rounded-md font-body-ui text-[12px] text-primary ghost shrink-0"
          >
            Preview this
          </button>
        </div>
      )}

      <ResizeHandle axis="y" label="verse picker" dragging={bottomH.dragging} handleProps={bottomH.handleProps} />

      {/* Reference picker + verse list + preview */}
      <div style={{ height: bottomH.size }} className="shrink-0 panel rounded-3xl flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5">
          {primaryModule && (
            <span className="font-metadata-mono text-[11px] font-bold text-on-surface-variant field px-2.5 py-1 rounded-lg shrink-0">
              {primaryModule}
            </span>
          )}
          <span className="font-body-ui text-[13px] font-semibold text-on-surface shrink-0">{refLabel(previewRef)}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => stepVerse(-1)} className="p-1 rounded-md ctl text-on-surface-variant" title="Previous verse (←)">
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <button onClick={() => stepVerse(1)} className="p-1 rounded-md ctl text-on-surface-variant" title="Next verse (→)">
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
          <div className="w-px h-4 bg-outline-variant shrink-0" />
          <div className="flex-1 min-w-0 max-w-xl">
            <PresentationSearchBar
              ref={searchBarRef}
              baseRef={previewRef}
              onNavigate={(ref) => setPreviewRef(ref)}
              onStrongs={(number) => handleStrongsClick([number])}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-w-0 overflow-y-auto px-2 py-2">
            {(previewChapter?.verses ?? []).map((v) => {
              const text = v.spans.map((s) => s.text).join("");
              const parts = previewPartsMap.get(v.verse) ?? [text];
              const split = parts.length > 1;
              return (
                <div key={v.verse} className="mb-1">
                  {parts.map((part, i) => {
                    const active = v.verse === previewRef.verse && i === previewPart;
                    return (
                      <div key={i} className={i > 0 ? "pl-6 relative mt-1" : ""}>
                        {i > 0 && (
                          <span
                            className="material-symbols-outlined absolute left-1 top-1.5 text-[14px] text-on-surface-variant/40 pointer-events-none"
                            aria-hidden
                          >
                            subdirectory_arrow_right
                          </span>
                        )}
                        {/* A plain div, not a button — the unsplit case nests clickable
                            Strong's-number buttons inside, which a <button> can't legally contain. */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => { setPreviewRef({ ...previewRef, verse: v.verse }); setPreviewPart(i); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreviewRef({ ...previewRef, verse: v.verse }); setPreviewPart(i); } }}
                          className={`w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-md border border-transparent transition-colors cursor-pointer ${
                            active
                              ? "row-selected"
                              : i === 0
                              ? "border-transparent hover:bg-surface-container-low"
                              : "border-outline-variant/50 hover:bg-surface-container-low"
                          }`}
                        >
                          <span className={`font-metadata-mono text-[12px] shrink-0 mt-0.5 ${active ? "text-primary font-bold" : "text-on-surface-variant"}`}>
                            {i === 0 ? v.verse : `p${i + 1}`}
                          </span>
                          {i === 0 && split && (
                            <span className={`shrink-0 mt-0.5 px-1.5 rounded-full border font-metadata-mono text-[10px] ${active ? "border-primary text-primary" : "border-outline-variant text-on-surface-variant"}`}>
                              1/{parts.length}
                            </span>
                          )}
                          <span className="font-body-reading text-[14px] leading-snug text-on-surface">
                            {i === 0 && !split
                              ? <VerseSpans spans={v.spans} showStrongs={showStrongs} showRedLetter={showRedLetter} onStrongsClick={handleStrongsClick} />
                              : part}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <ResizeHandle axis="x" label="preview" dragging={previewW.dragging} handleProps={previewW.handleProps} />
          <div style={{ width: previewW.size }} className="shrink-0 flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 pt-3">
              <PanelHeader icon="visibility" label="Preview" compact />
              <button
                onClick={addPreviewToQueue}
                disabled={previewInQueue}
                className="flex items-center gap-1 font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={previewInQueue ? "Already in the queue" : "Add to queue (Ctrl+Alt+Q)"}
              >
                <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                Queue
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <p className="font-metadata-mono text-[11px] text-on-surface-variant mb-1.5 flex items-center gap-2">
                {refLabel(previewRef)}
                {previewSplit && (
                  <span className="px-1.5 text-on-surface-variant ctl rounded-lg">
                    {previewPart + 1}/{previewParts.length}
                  </span>
                )}
              </p>
              <p className="font-body-reading text-[15px] leading-relaxed text-on-surface">
                {previewActiveText || "—"}
              </p>
            </div>
            <div className="shrink-0 border-t border-outline-variant p-3 flex items-center gap-2">
              <button
                onClick={goLive}
                disabled={sameRef(previewRef, currentRef) && previewPart === versePart}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md btn-primary font-body-ui text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                title="Send the previewed verse live (Enter)"
              >
                <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                GO
              </button>
              <button
                onClick={goBack}
                disabled={liveHistory.length === 0}
                className="flex items-center gap-1.5 px-3 py-2.5 text-on-surface font-body-ui text-[13px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity ctl rounded-lg"
                title="Return to the previously-live verse (Backspace)"
              >
                <span className="material-symbols-outlined text-[18px]">undo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <StrongsSheet />
    </div>
  );
}

function PanelHeader({ icon, label, compact }: { icon: string; label: string; compact?: boolean }) {
  return (
    <div className={`shrink-0 flex items-center gap-2 ${compact ? "" : "px-6 py-3"}`}>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{icon}</span>
      <h2 className="font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide">{label}</h2>
    </div>
  );
}

/** Renders verse spans with the same clickable Strong's-number treatment as
 * VersePanes.tsx's VerseRow — double-click (or tap a number) to look it up,
 * which also broadcasts to the presentation output via the shared
 * selectedStrongs/strongsGroup state. Only used for unsplit verses (see
 * split-verse handling above) since split parts are plain measured
 * substrings with no span boundaries to render markup against. */
function VerseSpans({ spans, showStrongs, showRedLetter, onStrongsClick }: {
  spans: TextSpan[];
  showStrongs: boolean;
  showRedLetter: boolean;
  onStrongsClick: (numbers: string[]) => void;
}) {
  return (
    <>
      {spans.map((span, i) => {
        const red = showRedLetter && span.is_red_letter;
        const strongsNumbers = span.strongs ?? [];
        if (strongsNumbers.length > 0 && showStrongs) {
          return (
            <span
              key={i}
              className={`strongs-word relative group/word border-b border-dashed hover:bg-secondary/10 pb-0.5 ${span.is_title ? "font-bold" : ""} ${red ? "text-red-600 dark:text-red-400 border-red-400" : "border-primary"}`}
              title={strongsNumbers.length === 1 ? "Double-click to look up in concordance" : "Double-click to look up this phrase's Strong's numbers"}
              onDoubleClick={(e) => { e.stopPropagation(); onStrongsClick(strongsNumbers); }}
            >
              <span className="strongs-tag absolute -top-3 left-1/2 -translate-x-1/2 flex gap-1 whitespace-nowrap font-metadata-mono text-[9px] text-secondary opacity-0 transition-opacity">
                {strongsNumbers.map((strongs) => (
                  <button
                    key={strongs}
                    type="button"
                    className="hover:text-primary hover:underline"
                    title={`Look up ${strongs}`}
                    onClick={(e) => { e.stopPropagation(); onStrongsClick([strongs]); }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    {strongs}
                  </button>
                ))}
              </span>
              {span.text}
            </span>
          );
        }
        if (span.is_title) {
          return <strong key={i} className={`font-bold ${red ? "text-red-600 dark:text-red-400" : ""}`}>{span.text}</strong>;
        }
        if (span.is_added) {
          return <em key={i} className={red ? "text-red-600 dark:text-red-400" : undefined}>{span.text}</em>;
        }
        return <span key={i} className={red ? "text-red-600 dark:text-red-400" : undefined}>{span.text}</span>;
      })}
    </>
  );
}
