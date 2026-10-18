import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, itemEndVerse, serviceItemLabel, type VerseRef, type ServiceItem } from "../store/app";
import { api, type TextSpan } from "../lib/tauri";
import { useChapterData } from "../hooks/useChapterData";
import { usePresentationSync } from "../hooks/usePresentationSync";
import { measureVersePartsDOM, sliceSpansForPart, PART_LABELS } from "../lib/verseSplit";
import { animateScrollBy } from "../lib/animateScroll";
import { contentStrongs } from "../lib/strongsMarkers";
import { FONT_FAMILY_CSS } from "../components/VersePanes";
import StrongsSheet from "../components/StrongsSheet";
import { liveDisplayPrefs, liveFontSize, liveSafeMargin } from "../lib/liveText";
import OutputPreview from "../components/OutputPreview";
import { usePresentationStage } from "../hooks/usePresentationStage";
import type { PresentState } from "../lib/presentation";
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

function itemContainsRef(item: ServiceItem, ref: VerseRef) {
  if (item.book !== ref.book || item.chapter !== ref.chapter) return false;
  const end = itemEndVerse(item);
  return ref.verse >= item.verse && ref.verse <= end;
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

  // Active scheduled item in the Schedule list (if any)
  const [activeQueueItemId, setActiveQueueItemId] = useState<string | null>(
    () => serviceOrder[0]?.id ?? null,
  );

  // Active slide index in the Preview column (0-indexed)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

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
  // Which split verse (book|chapter|verse) has its parts unfolded in the list.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const verseListRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPreviewPart(0), [previewRef.book, previewRef.chapter, previewRef.verse]);

  // Anchor verse for shift-click range selection.
  const [selectionAnchor, setSelectionAnchor] = useState<number>(
    () => serviceOrder[0]?.verse ?? currentRef.verse,
  );
  // Selected verse range [start, end] inclusive in the current preview chapter.
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number }>(() => {
    const first = serviceOrder[0];
    if (first) {
      return { start: first.verse, end: itemEndVerse(first) };
    }
    return { start: currentRef.verse, end: currentRef.verse };
  });

  // Reset range and anchor when preview book or chapter changes
  useEffect(() => {
    setSelectionAnchor(previewRef.verse);
    setSelectedRange({ start: previewRef.verse, end: previewRef.verse });
  }, [previewRef.book, previewRef.chapter]);

  // Keep activeQueueItemId in sync if serviceOrder changes
  useEffect(() => {
    if (activeQueueItemId && !serviceOrder.some((it) => it.id === activeQueueItemId)) {
      setActiveQueueItemId(serviceOrder[0]?.id ?? null);
    }
  }, [serviceOrder, activeQueueItemId]);

  const searchBarRef = useRef<PresentationSearchBarHandle>(null);

  // The real output screen's size in CSS px — splits are measured against it
  // and the Main Output preview is laid out at it, so the console always
  // agrees with what the output window shows.
  const stage = usePresentationStage(presentationActive);

  // Every major panel is user-resizable; sizes persist across restarts and
  // double-clicking a divider restores its default.
  const queueW = useResizable({
    storageKey: "scriptura.live.queueWidth", initial: Math.round(window.innerWidth * 0.24), min: 180, axis: "x",
    max: () => Math.round(window.innerWidth * 0.4),
  });
  const liveW = useResizable({
    storageKey: "scriptura.live.liveWidth", initial: Math.round(window.innerWidth * 0.3), min: 240, axis: "x", invert: true,
    max: () => Math.round(window.innerWidth * 0.5),
  });
  const bottomH = useResizable({
    storageKey: "scriptura.live.bottomHeight", initial: Math.round(window.innerHeight * 0.38), min: 200, axis: "y", invert: true,
    max: () => window.innerHeight - 260,
  });

  usePresentationSync({
    presentationActive, primaryModule, currentRef, parallelModule, parallelMode,
    selectedStrongs, strongsGroup, strongsSource, displayPrefs, readingFontSize,
    presentationTheme: activePresentationTheme,
    black: liveBlack, emergency: liveEmergency,
    versePart: displayPrefs.splitLongVerses ? versePart : undefined,
  });

  const { chapter: previewChapter } = useChapterData(primaryModule, previewRef.book, previewRef.chapter, false, null);
  const { chapter: liveChapter, parallelChapter: liveParallelChapter } = useChapterData(primaryModule, currentRef.book, currentRef.chapter, parallelMode, parallelModule);

  // Splits verse text into presentation-sized parts by measuring against the
  // actual presentation box dimensions — same approach as ReadingView.tsx, so
  // this console and the output screen always agree on where a verse splits.
  const splitBox = useMemo(() => {
    const ctx = displayPrefs.presentationContext ?? 1;
    const theme = activePresentationTheme;
    const live = liveDisplayPrefs(displayPrefs, theme);
    const hPadPct = liveSafeMargin(theme);
    const screenW = stage.w;
    const screenH = stage.h;

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

    // Live text is styled by the theme alone (see lib/liveText.ts), so the
    // split here is measured with the same font the output window will use.
    const fontFamily = FONT_FAMILY_CSS[live.fontFamily] ?? FONT_FAMILY_CSS.system;
    return {
      boxW, boxH,
      style: {
        fontFamily,
        fontSizePx: liveFontSize(theme) * (theme?.font_scale ?? 1),
        lineHeight: 1 + live.lineSpacing,
        fontWeight: theme?.text_font_weight ?? 600,
        textAlign: live.textAlign,
      },
    };
  }, [displayPrefs, activePresentationTheme, stage.w, stage.h]);

  const splitParts = useCallback((text: string) => measureVersePartsDOM(text.trim(), splitBox.boxW, splitBox.boxH, splitBox.style), [splitBox]);

  const previewPartsMap = useMemo(() => {
    const map = new Map<number, string[]>();
    if (!displayPrefs.splitLongVerses || !previewChapter) return map;
    for (const v of previewChapter.verses) {
      map.set(v.verse, splitParts(v.spans.map((s) => s.text).join("")));
    }
    return map;
  }, [displayPrefs.splitLongVerses, previewChapter, splitParts]);

  // Keep the selected verse in view however it was chosen (jump, word search,
  // arrow keys, queue item). Waits for the right chapter to be loaded, since
  // the preview ref changes a moment before its chapter's verses arrive.
  const loadedChapterMatches = previewChapter?.book === previewRef.book && previewChapter?.chapter === previewRef.chapter;
  useEffect(() => {
    const list = verseListRef.current;
    if (!list || !loadedChapterMatches) return;
    const el = list.querySelector<HTMLElement>(`[data-verse="${previewRef.verse}"]`);
    if (!el) return;
    const listRect = list.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const delta = rect.top - listRect.top - (list.clientHeight - rect.height) / 2;
    return animateScrollBy(list, delta);
  }, [previewRef.book, previewRef.chapter, previewRef.verse, loadedChapterMatches]);

  // Unfolding a split verse can push its parts below the fold.
  useEffect(() => {
    if (!expandedKey) return;
    let cancel = () => {};
    const timer = setTimeout(() => {
      const list = verseListRef.current;
      const el = list?.querySelector<HTMLElement>(`[data-verse="${previewRef.verse}"]`);
      if (!list || !el) return;
      const l = list.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const delta = r.bottom > l.bottom ? r.bottom - l.bottom + 8 : r.top < l.top ? r.top - l.top - 8 : 0;
      if (delta !== 0) cancel = animateScrollBy(list, delta);
    }, 220);
    return () => { clearTimeout(timer); cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKey]);

  const previewQueueIndex = serviceOrder.findIndex((item) =>
    activeQueueItemId ? item.id === activeQueueItemId : itemContainsRef(item, previewRef)
  );

  // Sends a specific verse/part to the output. Takes the target explicitly so
  // a double-click can send the row it landed on without waiting for the
  // preview state its first click set to settle.
  const sendLive = useCallback((ref: VerseRef, part: number) => {
    const sameVerse = sameRef(ref, currentRef);
    if (sameVerse && part === versePart) return;
    if (!sameVerse) pushLiveHistory(currentRef);
    setCurrentRef(ref);
    setVersePart(part);
  }, [currentRef, versePart, pushLiveHistory, setCurrentRef, setVersePart]);

  const selectQueueItem = useCallback((item: ServiceItem) => {
    setActiveQueueItemId(item.id);
    const end = itemEndVerse(item);
    setPreviewRef({ book: item.book, chapter: item.chapter, verse: item.verse });
    setSelectionAnchor(item.verse);
    setSelectedRange({ start: item.verse, end });
    setActiveSlideIndex(0);
    setPreviewPart(0);
  }, []);

  // Verses within the current selected range
  const selectedVerses = useMemo(() => {
    if (!previewChapter?.verses) return [];
    const min = Math.min(selectedRange.start, selectedRange.end);
    const max = Math.max(selectedRange.start, selectedRange.end);
    return previewChapter.verses.filter((v) => v.verse >= min && v.verse <= max);
  }, [previewChapter?.verses, selectedRange]);

  const selectedCount = selectedVerses.length > 0 ? selectedVerses.length : 1;
  const isMultiSelect = selectedRange.start !== selectedRange.end && selectedVerses.length > 1;

  // Formatted citation: e.g. "John 3:4–6" or "John 3:4"
  const rangeCitation = useMemo(() => {
    const min = Math.min(selectedRange.start, selectedRange.end);
    const max = Math.max(selectedRange.start, selectedRange.end);
    if (min !== max) {
      return `${previewRef.book} ${previewRef.chapter}:${min}–${max}`;
    }
    return refLabel(previewRef);
  }, [selectedRange, previewRef]);

  // Check if current range/verse selection is already queued in serviceOrder
  const allSelectedInQueue = useMemo(() => {
    if (!primaryModule) return false;
    const min = Math.min(selectedRange.start, selectedRange.end);
    const max = Math.max(selectedRange.start, selectedRange.end);
    return serviceOrder.some(
      (item) =>
        item.book === previewRef.book &&
        item.chapter === previewRef.chapter &&
        item.verse === min &&
        itemEndVerse(item) === max &&
        item.module === primaryModule,
    );
  }, [primaryModule, selectedRange, previewRef, serviceOrder]);

  // Adds either the single active preview verse or the selected range of verses as a grouped item to the schedule
  const addSelectedToQueue = useCallback(() => {
    if (!primaryModule || !previewChapter?.verses) return;
    const versesToQueue = selectedVerses.length > 0
      ? selectedVerses
      : previewChapter.verses.filter((v) => v.verse === previewRef.verse);

    if (versesToQueue.length === 0) return;

    if (versesToQueue.length === 1) {
      const v = versesToQueue[0];
      addToServiceOrder({
        book: previewRef.book,
        chapter: previewRef.chapter,
        verse: v.verse,
        text: v.spans.map((s) => s.text).join(""),
        module: primaryModule,
      });
    } else {
      const first = versesToQueue[0];
      const last = versesToQueue[versesToQueue.length - 1];
      addToServiceOrder({
        book: previewRef.book,
        chapter: previewRef.chapter,
        verse: first.verse,
        verse_end: last.verse,
        text: first.spans.map((s) => s.text).join(""),
        module: primaryModule,
      });
    }
  }, [primaryModule, previewChapter?.verses, selectedVerses, previewRef, addToServiceOrder]);

  const stepQueue = useCallback((delta: number) => {
    if (serviceOrder.length === 0) return;
    const currentIdx = activeQueueItemId
      ? serviceOrder.findIndex((it) => it.id === activeQueueItemId)
      : previewQueueIndex >= 0
      ? previewQueueIndex
      : -1;
    const next = Math.min(Math.max(currentIdx + delta, 0), serviceOrder.length - 1);
    const item = serviceOrder[next];
    if (item) selectQueueItem(item);
  }, [serviceOrder, activeQueueItemId, previewQueueIndex, selectQueueItem]);

  // Individual slide entry for the Preview column
  interface PreviewSlide {
    ref: VerseRef;
    part: number;
    totalParts: number;
    spans: TextSpan[];
    text: string;
    label: string;
  }

  const previewText = verseText(previewChapter?.verses, previewRef.verse);
  const previewParts = previewPartsMap.get(previewRef.verse) ?? [previewText];
  const previewSplit = previewParts.length > 1;

  // Compute all preview slides: When a range is selected or a range schedule item is active,
  // each verse in the range separates into its own slide (with split long verses if enabled).
  const previewSlides: PreviewSlide[] = useMemo(() => {
    if (!previewChapter?.verses || previewChapter.book !== previewRef.book || previewChapter.chapter !== previewRef.chapter) {
      return [{
        ref: previewRef,
        part: 0,
        totalParts: 1,
        spans: [],
        text: previewText || "",
        label: refLabel(previewRef),
      }];
    }

    const minVerse = Math.min(selectedRange.start, selectedRange.end);
    const maxVerse = Math.max(selectedRange.start, selectedRange.end);

    const targetVerses = previewChapter.verses.filter((v) => v.verse >= minVerse && v.verse <= maxVerse);
    const versesToMap = targetVerses.length > 0
      ? targetVerses
      : (previewChapter.verses.filter((v) => v.verse === previewRef.verse) ?? []);

    const slides: PreviewSlide[] = [];
    for (const v of versesToMap) {
      const vRef: VerseRef = { book: previewRef.book, chapter: previewRef.chapter, verse: v.verse };
      const rawText = v.spans.map((s) => s.text).join("");
      const parts = previewPartsMap.get(v.verse) ?? [rawText];
      if (displayPrefs.splitLongVerses && parts.length > 1) {
        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
          slides.push({
            ref: vRef,
            part: pIdx,
            totalParts: parts.length,
            spans: sliceSpansForPart(v.spans, parts, pIdx),
            text: parts[pIdx],
            label: slideLabel(vRef, pIdx, primaryModule),
          });
        }
      } else {
        slides.push({
          ref: vRef,
          part: 0,
          totalParts: 1,
          spans: v.spans,
          text: rawText,
          label: slideLabel(vRef, null, primaryModule),
        });
      }
    }
    return slides;
  }, [previewChapter, previewRef, selectedRange, previewText, previewPartsMap, displayPrefs.splitLongVerses, primaryModule]);

  const currentPreviewSlide = previewSlides[activeSlideIndex] ?? previewSlides[0];

  useEffect(() => {
    if (activeSlideIndex >= previewSlides.length) {
      setActiveSlideIndex(0);
    }
  }, [previewSlides.length, activeSlideIndex]);

  const goLive = useCallback(() => {
    if (currentPreviewSlide) {
      sendLive(currentPreviewSlide.ref, currentPreviewSlide.part);
    } else {
      sendLive(previewRef, previewPart);
    }
  }, [sendLive, currentPreviewSlide, previewRef, previewPart]);

  const goBack = useCallback(() => {
    const prev = popLiveHistory();
    if (prev) setCurrentRef(prev);
  }, [popLiveHistory, setCurrentRef]);

  // Steps by verse inside the current chapter, crossing into the adjacent
  // chapter at either boundary rather than stopping dead at verse 1 / the
  // last verse.
  const stepVerse = useCallback(async (delta: number) => {
    if (!previewChapter || !primaryModule) return;
    const idx = previewChapter.verses.findIndex((v) => v.verse === previewRef.verse);
    const nextIdx = idx + delta;
    if (idx >= 0 && nextIdx >= 0 && nextIdx < previewChapter.verses.length) {
      const vNum = previewChapter.verses[nextIdx].verse;
      setActiveQueueItemId(null);
      setPreviewRef({ ...previewRef, verse: vNum });
      setSelectionAnchor(vNum);
      setSelectedRange({ start: vNum, end: vNum });
      setActiveSlideIndex(0);
      return;
    }
    const nextChapterNum = previewRef.chapter + (delta > 0 ? 1 : -1);
    if (nextChapterNum < 1) return;
    try {
      const ch = await api.getChapter(primaryModule, previewRef.book, nextChapterNum);
      if (ch.verses.length === 0) return;
      const verse = delta > 0 ? ch.verses[0].verse : ch.verses[ch.verses.length - 1].verse;
      setActiveQueueItemId(null);
      setPreviewRef({ book: previewRef.book, chapter: nextChapterNum, verse });
      setSelectionAnchor(verse);
      setSelectedRange({ start: verse, end: verse });
      setActiveSlideIndex(0);
    } catch {
      // Likely past the start/end of the book — nothing to step into.
    }
  }, [previewChapter, previewRef, primaryModule]);

  // Extends or shrinks the range selection when holding Shift + arrows
  const stepVerseRange = useCallback((delta: number) => {
    if (!previewChapter?.verses || previewChapter.verses.length === 0) return;
    const currentTarget = previewRef.verse;
    const idx = previewChapter.verses.findIndex((v) => v.verse === currentTarget);
    const nextIdx = Math.min(Math.max(idx + delta, 0), previewChapter.verses.length - 1);
    const nextVerse = previewChapter.verses[nextIdx].verse;
    const anchor = selectionAnchor ?? previewRef.verse;
    const start = Math.min(anchor, nextVerse);
    const end = Math.max(anchor, nextVerse);
    setActiveQueueItemId(null);
    setSelectedRange({ start, end });
    setPreviewRef((prev) => ({ ...prev, verse: nextVerse }));
    const slideIdx = nextVerse >= start && nextVerse <= end ? nextVerse - start : 0;
    setActiveSlideIndex(slideIdx);
  }, [previewChapter?.verses, previewRef.verse, selectionAnchor]);

  // Ctrl+P / Ctrl+N: previous/next chapter, same as the reading view.
  const stepChapter = useCallback(async (delta: number) => {
    if (!primaryModule) return;
    const chapter = previewRef.chapter + delta;
    if (chapter < 1) return;
    try {
      const ch = await api.getChapter(primaryModule, previewRef.book, chapter);
      if (ch.verses.length === 0) return;
      const vNum = ch.verses[0].verse;
      setActiveQueueItemId(null);
      setPreviewRef({ book: previewRef.book, chapter, verse: vNum });
      setSelectionAnchor(vNum);
      setSelectedRange({ start: vNum, end: vNum });
      setActiveSlideIndex(0);
    } catch {
      // Past the end of the book — nothing to step into.
    }
  }, [primaryModule, previewRef]);

  const handleVerseClick = useCallback((verseNum: number, shiftKey: boolean) => {
    setActiveQueueItemId(null);
    if (shiftKey) {
      const anchor = selectionAnchor ?? previewRef.verse;
      const start = Math.min(anchor, verseNum);
      const end = Math.max(anchor, verseNum);
      setSelectedRange({ start, end });
      setPreviewRef((prev) => ({ ...prev, verse: verseNum }));
      setPreviewPart(0);
      setExpandedKey(null);
      const idx = verseNum >= start && verseNum <= end ? verseNum - start : 0;
      setActiveSlideIndex(idx);
    } else {
      setSelectionAnchor(verseNum);
      setSelectedRange({ start: verseNum, end: verseNum });
      setPreviewRef((prev) => ({ ...prev, verse: verseNum }));
      setPreviewPart(0);
      setActiveSlideIndex(0);
      const parts = previewPartsMap.get(verseNum) ?? [];
      const split = parts.length > 1;
      if (split) {
        const key = `${previewRef.book}|${previewRef.chapter}|${verseNum}`;
        setExpandedKey((prev) => (prev === key ? null : key));
      } else {
        setExpandedKey(null);
      }
    }
  }, [selectionAnchor, previewRef, previewPartsMap]);

  // Keyboard shortcuts, scoped to this console only (not the global reading
  // shortcuts) — an operator running a live show wants Up/Down/Left/Right/
  // Enter to behave predictably without colliding with reading-view bindings.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;

      // Modifier shortcuts work even while a text field has focus — the jump
      // input keeps focus after use and used to swallow every shortcut.
      // Ctrl+Q / Cmd+Q (or Ctrl+Alt+Q): Add preview verse / selected range to schedule
      if (mod && !e.shiftKey && e.code === "KeyQ") {
        e.preventDefault();
        addSelectedToQueue();
        return;
      }
      if (mod && e.altKey && e.code === "KeyQ") {
        e.preventDefault();
        addSelectedToQueue();
        return;
      }
      if (mod && !e.altKey && e.code === "KeyL") {
        e.preventDefault();
        searchBarRef.current?.focus("scripture");
        return;
      }
      if (mod && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        searchBarRef.current?.focus("word");
        return;
      }
      if (mod && !e.altKey && (e.code === "KeyP" || e.code === "KeyN")) {
        e.preventDefault();
        stepChapter(e.code === "KeyN" ? 1 : -1);
        return;
      }
      if (mod && !e.altKey && (e.code === "ArrowDown" || e.code === "ArrowUp")) {
        e.preventDefault();
        if (e.shiftKey) {
          stepVerseRange(e.code === "ArrowDown" ? 1 : -1);
        } else {
          stepVerse(e.code === "ArrowDown" ? 1 : -1);
        }
        return;
      }

      if (typing || mod || e.altKey) return;

      // Shift + Arrows to extend/shrink range selection in the library
      if (e.shiftKey) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          stepVerseRange(1);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          stepVerseRange(-1);
          return;
        }
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
  }, [stepQueue, stepVerse, stepVerseRange, stepChapter, goLive, goBack, addSelectedToQueue]);

  // Exactly what usePresentationSync sends the output window.
  const outputState: PresentState = useMemo(() => ({
    book: currentRef.book,
    chapter: currentRef.chapter,
    verse: currentRef.verse,
    primaryModule: primaryModule ?? "",
    parallelModule,
    parallelMode,
    selectedStrongs: null,
    strongsGroup: null,
    strongsSource: null,
    displayPrefs,
    readingFontSize,
    presentationTheme: activePresentationTheme,
    black: liveBlack,
    emergency: liveEmergency,
    versePart: displayPrefs.splitLongVerses ? versePart : undefined,
  }), [currentRef, primaryModule, parallelModule, parallelMode, displayPrefs, readingFontSize, activePresentationTheme, liveBlack, liveEmergency, versePart]);

  // What the Preview Output thumbnail shows: the previewed slide,
  // laid out exactly as it would go out (never black/emergency, no parallel).
  const previewOutputState: PresentState = useMemo(() => {
    const sRef = currentPreviewSlide?.ref ?? previewRef;
    const sPart = currentPreviewSlide?.part ?? previewPart;
    return {
      ...outputState,
      book: sRef.book,
      chapter: sRef.chapter,
      verse: sRef.verse,
      parallelMode: false,
      black: false,
      emergency: false,
      versePart: displayPrefs.splitLongVerses ? sPart : undefined,
    };
  }, [outputState, currentPreviewSlide, previewRef, previewPart, displayPrefs.splitLongVerses]);

  const liveText = verseText(liveChapter?.verses, currentRef.verse);
  const liveParts = displayPrefs.splitLongVerses ? splitParts(liveText) : [liveText];
  const liveSplit = liveParts.length > 1;

  const overridden = liveBlack || liveEmergency;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-2.5 gap-2.5">
      {/* Schedule | Preview | Live — each column ends in an output strip */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── Schedule (queue) ── */}
        <section style={{ width: queueW.size }} className="shrink-0 flex flex-col overflow-hidden panel rounded-3xl">
          <div className="shrink-0 flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-outline-variant">
            <h2 className="font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide shrink-0">Schedule</h2>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <button
                onClick={() => setServiceOrderOpen(true)}
                className="flex items-center gap-1 font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                title="Reorder or remove queue items (Ctrl+Shift+Q)"
              >
                <span className="material-symbols-outlined text-[15px]">reorder</span>
                <span className="hidden min-[1100px]:inline">Edit</span>
              </button>
              {serviceOrder.length > 0 && (
                <button
                  onClick={clearServiceOrder}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-error ghost"
                  title="Clear the whole schedule"
                >
                  <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
                  <span className="hidden min-[1100px]:inline">Clear</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
            {serviceOrder.length === 0 ? (
              <div className="p-4 text-center">
                <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
                  Nothing scheduled yet. Add verses from the library below with Queue (Ctrl+Q).
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {serviceOrder.map((item, idx) => {
                  const isSelected = activeQueueItemId ? item.id === activeQueueItemId : idx === previewQueueIndex;
                  const isLive = itemContainsRef(item, currentRef);
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => selectQueueItem(item)}
                        onDoubleClick={() => {
                          selectQueueItem(item);
                          sendLive({ book: item.book, chapter: item.chapter, verse: item.verse }, 0);
                        }}
                        title="Click to preview slides • Double-click to send live"
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors select-none ${
                          isSelected ? "row-selected border-primary/30" : "border-transparent hover:bg-surface-container-low"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-metadata-mono text-[10px] text-on-surface-variant">{idx + 1}</span>
                          <span className={`font-body-ui text-[12px] font-semibold truncate ${isSelected ? "text-primary" : "text-on-surface"}`}>
                            {serviceItemLabel(item)} {item.module ? `(${item.module})` : ""}
                          </span>
                          {isLive && (
                            <span className="font-metadata-mono text-[9px] uppercase tracking-widest text-error ml-auto shrink-0 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <p className="font-body-ui text-[11px] text-on-surface-variant/80 truncate mt-0.5 leading-tight">{item.text}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <ResizeHandle spaced axis="x" label="schedule" dragging={queueW.dragging} handleProps={queueW.handleProps} />

        {/* ── Preview ── */}
        <section className="flex-1 min-w-0 flex flex-col overflow-hidden panel rounded-3xl">
          <div className="shrink-0 flex items-center gap-3 px-3.5 py-2 border-b border-outline-variant">
            <h2 className="min-w-0 flex-1 font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide truncate">
              Preview <span className="font-normal normal-case tracking-normal text-on-surface-variant">— {rangeCitation}{primaryModule ? ` (${primaryModule})` : ""}</span>
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={addSelectedToQueue}
                disabled={allSelectedInQueue}
                className="flex items-center gap-1 px-2 py-1 rounded-md ctl font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={
                  allSelectedInQueue
                    ? "Already in the schedule"
                    : isMultiSelect
                    ? `Add ${selectedCount} verses to schedule (Ctrl+Q)`
                    : "Add to schedule (Ctrl+Q)"
                }
              >
                <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                <span className="hidden min-[1400px]:inline">
                  Queue{isMultiSelect ? ` (${selectedCount})` : ""}
                </span>
                <span className="min-[1400px]:hidden">
                  {isMultiSelect ? `(${selectedCount})` : ""}
                </span>
              </button>
              <button
                onClick={goBack}
                disabled={liveHistory.length === 0}
                className="p-1.5 ctl rounded-md text-on-surface disabled:opacity-40 disabled:cursor-not-allowed"
                title="Return to the previously-live verse (Backspace)"
              >
                <span className="material-symbols-outlined text-[16px]">undo</span>
              </button>
              <button
                onClick={goLive}
                disabled={currentPreviewSlide ? (sameRef(currentPreviewSlide.ref, currentRef) && currentPreviewSlide.part === versePart) : (sameRef(previewRef, currentRef) && previewPart === versePart)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md btn-primary font-body-ui text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                title="Send the previewed verse live (Enter, or double-click it)"
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                Go Live
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5">
            {previewSlides.map((slide, i) => {
              const active = i === activeSlideIndex;
              return (
                <div
                  key={`${slide.ref.book}-${slide.ref.chapter}-${slide.ref.verse}-${slide.part}-${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveSlideIndex(i);
                    setPreviewRef(slide.ref);
                    setPreviewPart(slide.part);
                  }}
                  onDoubleClick={() => {
                    setActiveSlideIndex(i);
                    setPreviewRef(slide.ref);
                    setPreviewPart(slide.part);
                    sendLive(slide.ref, slide.part);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveSlideIndex(i);
                      setPreviewRef(slide.ref);
                      setPreviewPart(slide.part);
                    }
                  }}
                  title="Click to preview • Double-click to send live"
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer select-none ${
                    active ? "row-selected border-primary/40 shadow-sm" : "border-outline-variant/50 hover:bg-surface-container-low"
                  }`}
                >
                  <span className={`font-metadata-mono text-[11px] shrink-0 mt-0.5 ${active ? "text-primary font-bold" : "text-on-surface-variant"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-body-ui text-[12px] font-bold ${active ? "text-primary" : "text-on-surface"}`}>
                      {slide.label}
                    </p>
                    <p className={`font-body-reading text-[13px] ${showStrongs ? "leading-[1.8]" : "leading-snug"} text-on-surface mt-0.5`}>
                      {slide.spans && slide.spans.length > 0 ? (
                        <VerseSpans
                          spans={slide.spans}
                          showStrongs={showStrongs}
                          showRedLetter={showRedLetter}
                          onStrongsClick={handleStrongsClick}
                        />
                      ) : (
                        slide.text || "—"
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <OutputStrip
            title="Preview Output"
            label={currentPreviewSlide?.label ?? slideLabel(previewRef, previewSplit ? previewPart : null, primaryModule)}
            slide={activeSlideIndex}
            slides={previewSlides.length}
            onSlide={(n) => {
              setActiveSlideIndex(n);
              const s = previewSlides[n];
              if (s) {
                setPreviewRef(s.ref);
                setPreviewPart(s.part);
              }
            }}
            stage={stage}
          >
            <OutputPreview state={previewOutputState} chapter={previewChapter} parallelChapter={null} stage={stage} outputOpen />
          </OutputStrip>
        </section>

        <ResizeHandle spaced axis="x" label="live" dragging={liveW.dragging} handleProps={liveW.handleProps} />

        {/* ── Live ── */}
        <section style={{ width: liveW.size }} className="shrink-0 flex flex-col overflow-hidden panel rounded-3xl">
          <div className="shrink-0 flex items-center gap-3 px-3.5 py-2.5 border-b border-outline-variant">
            <h2 className="font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide">Live</h2>
            {presentationActive && (
              <span className="flex items-center gap-1 font-metadata-mono text-[9px] uppercase tracking-widest text-error">
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                On air
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5">
            {overridden && (
              <div className="px-3 py-2 text-center ctl rounded-lg">
                <p className="font-body-ui text-[12px] text-on-surface-variant">
                  {liveEmergency ? "Standby screen is showing on the output." : "Output is cut to black."}
                </p>
              </div>
            )}
            {liveParts.map((part, i) => {
              const active = i === versePart || liveParts.length === 1;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => setVersePart(i)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setVersePart(i); } }}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer select-none ${
                    active ? "row-selected border-primary/30" : "border-outline-variant/60 hover:bg-surface-container-low"
                  } ${overridden ? "opacity-50" : ""}`}
                >
                  <span className={`font-metadata-mono text-[11px] shrink-0 mt-0.5 ${active ? "text-primary font-bold" : "text-on-surface-variant"}`}>{i + 1}</span>
                  <div className="min-w-0">
                    <p className={`font-body-ui text-[12px] font-bold ${active ? "text-primary" : "text-on-surface"}`}>
                      {slideLabel(currentRef, liveSplit ? i : null, primaryModule)}
                    </p>
                    <p className="font-body-reading text-[13px] leading-snug text-on-surface mt-0.5">{part || "—"}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <OutputStrip
            title="Live Output"
            label={slideLabel(currentRef, liveSplit ? versePart : null, primaryModule)}
            slide={Math.min(versePart, liveParts.length - 1)}
            slides={liveParts.length}
            onSlide={(n) => setVersePart(n)}
            stage={stage}
          >
            <OutputPreview state={outputState} chapter={liveChapter} parallelChapter={liveParallelChapter} stage={stage} outputOpen={presentationActive} />
          </OutputStrip>
        </section>
      </div>

      <ResizeHandle axis="y" label="library" dragging={bottomH.dragging} handleProps={bottomH.handleProps} />

      {/* ── Library: reference bar + verse list ── */}
      <div style={{ height: bottomH.size }} className="shrink-0 panel rounded-3xl flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-3.5 py-2">
          {primaryModule && (
            <span className="font-metadata-mono text-[11px] font-bold text-on-surface-variant field px-2.5 py-1 rounded-lg shrink-0">
              {primaryModule}
            </span>
          )}
          <span className="font-body-ui text-[13px] font-semibold text-on-surface shrink-0">{rangeCitation}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => stepChapter(-1)} className="p-1 rounded-md ctl text-on-surface-variant" title="Previous chapter (Ctrl+P)">
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <button onClick={() => stepChapter(1)} className="p-1 rounded-md ctl text-on-surface-variant" title="Next chapter (Ctrl+N)">
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
          <div className="w-px h-4 bg-outline-variant shrink-0" />
          <div className="flex-1 min-w-0 max-w-xl">
            <PresentationSearchBar
              ref={searchBarRef}
              baseRef={previewRef}
              onNavigate={(ref) => {
                setActiveQueueItemId(null);
                setPreviewRef(ref);
                setSelectionAnchor(ref.verse);
                setSelectedRange({ start: ref.verse, end: ref.verse });
                setActiveSlideIndex(0);
              }}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div ref={verseListRef} className="flex-1 min-w-0 overflow-y-auto px-2 py-2">
            {(previewChapter?.verses ?? []).map((v) => {
              const text = v.spans.map((s) => s.text).join("");
              const parts = previewPartsMap.get(v.verse) ?? [text];
              const split = parts.length > 1;
              const isPreviewVerse = v.verse === previewRef.verse;
              const isSelected = selectedRange
                ? v.verse >= Math.min(selectedRange.start, selectedRange.end) &&
                  v.verse <= Math.max(selectedRange.start, selectedRange.end)
                : isPreviewVerse;
              // A split verse's parts stay folded away until it's clicked, and
              // fold again as soon as another verse becomes the preview —
              // however that happens (click, arrow keys, jump).
              const open = split && isPreviewVerse && expandedKey === `${previewRef.book}|${previewRef.chapter}|${v.verse}`;
              const select = (part: number) => {
                setActiveQueueItemId(null);
                setSelectionAnchor(v.verse);
                setSelectedRange({ start: v.verse, end: v.verse });
                setPreviewRef({ ...previewRef, verse: v.verse });
                setPreviewPart(part);
                setActiveSlideIndex(part);
              };
              const headActive = isSelected;
              const shownPart = isPreviewVerse ? previewPart : 0;
              return (
                <div key={v.verse} data-verse={v.verse} className="mb-1">
                  {/* A plain div, not a button — the unsplit case nests clickable
                      Strong's-number buttons inside, which a <button> can't legally contain. */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={split ? open : undefined}
                    onClick={(e) => {
                      // The second click of a double-click (which sends the verse
                      // live) must not also toggle the dropdown back shut.
                      if (e.detail > 1) return;
                      handleVerseClick(v.verse, e.shiftKey);
                    }}
                    onDoubleClick={() => {
                      const ref = { ...previewRef, verse: v.verse };
                      setActiveQueueItemId(null);
                      setPreviewRef(ref);
                      setPreviewPart(0);
                      setActiveSlideIndex(0);
                      sendLive(ref, 0);
                    }}
                    title="Double-click to send live"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleVerseClick(v.verse, e.shiftKey);
                      }
                    }}
                    className={`w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-md border border-transparent transition-colors cursor-pointer select-none ${
                      headActive ? "row-selected" : "border-transparent hover:bg-surface-container-low"
                    }`}
                  >
                    <span className={`font-metadata-mono text-[12px] shrink-0 mt-0.5 ${headActive ? "text-primary font-bold" : "text-on-surface-variant"}`}>
                      {v.verse}
                    </span>
                    {split && (
                      <span className={`shrink-0 mt-0.5 px-1.5 rounded-full border font-metadata-mono text-[10px] ${isPreviewVerse ? "border-primary text-primary" : "border-outline-variant text-on-surface-variant"}`}>
                        {shownPart + 1}/{parts.length}
                      </span>
                    )}
                    <span className={`font-body-reading text-[14px] ${showStrongs ? "leading-[1.9]" : "leading-snug"} text-on-surface flex-1 min-w-0`}>
                      <VerseSpans
                        spans={split ? sliceSpansForPart(v.spans, parts, 0) : v.spans}
                        showStrongs={showStrongs}
                        showRedLetter={showRedLetter}
                        onStrongsClick={handleStrongsClick}
                      />
                    </span>
                    {split && (
                      <span
                        className={`material-symbols-outlined text-[18px] shrink-0 text-on-surface-variant transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                        aria-hidden
                      >
                        expand_more
                      </span>
                    )}
                  </div>

                  {split && (
                    <div
                      className="grid transition-[grid-template-rows] duration-200 ease-out"
                      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                      aria-hidden={!open}
                    >
                      <div className="overflow-hidden min-h-0">
                        {parts.slice(1).map((_, j) => {
                          const i = j + 1;
                          const active = isPreviewVerse && previewPart === i;
                          return (
                            <div key={i} className="pl-6 relative mt-1">
                              <span
                                className="material-symbols-outlined absolute left-1 top-1.5 text-[14px] text-on-surface-variant/40 pointer-events-none"
                                aria-hidden
                              >
                                subdirectory_arrow_right
                              </span>
                              <div
                                role="button"
                                tabIndex={open ? 0 : -1}
                                onClick={() => select(i)}
                                onDoubleClick={() => { select(i); sendLive({ ...previewRef, verse: v.verse }, i); }}
                                title="Double-click to send live"
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(i); } }}
                                className={`w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-md border transition-colors cursor-pointer select-none ${
                                  active ? "row-selected border-transparent" : "border-outline-variant/50 hover:bg-surface-container-low"
                                }`}
                              >
                                <span className={`font-metadata-mono text-[12px] shrink-0 mt-0.5 ${active ? "text-primary font-bold" : "text-on-surface-variant"}`}>
                                  p{i + 1}
                                </span>
                                <span className={`font-body-reading text-[14px] ${showStrongs ? "leading-[1.9]" : "leading-snug"} text-on-surface`}>
                                  <VerseSpans spans={sliceSpansForPart(v.spans, parts, i)} showStrongs={showStrongs} showRedLetter={showRedLetter} onStrongsClick={handleStrongsClick} />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>

      <StrongsSheet />
    </div>
  );
}

/** "Genesis 1:3 (KJV)" — with a part letter ("Genesis 1:3a") when the verse is split. */
function slideLabel(ref: VerseRef, part: number | null, module: string | null) {
  const letter = part === null ? "" : (PART_LABELS[part] ?? String.fromCharCode(97 + part));
  return `${ref.book} ${ref.chapter}:${ref.verse}${letter}${module ? ` (${module})` : ""}`;
}

/** The bottom strip of the Preview and Live columns: a thumbnail of the real
 *  output screen, what it shows, and slide arrows to step through a split verse. */
function OutputStrip({ title, label, slide, slides, onSlide, stage, children }: {
  title: string;
  label: string;
  slide: number;
  slides: number;
  onSlide: (n: number) => void;
  stage: { w: number; h: number };
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0 border-t border-outline-variant px-4 py-3">
      <p className="font-body-ui text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-3">{title}</p>
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded-md overflow-hidden" style={{ width: "clamp(110px, 40%, 144px)", aspectRatio: `${stage.w} / ${stage.h}` }}>
          {children}
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <p className="font-body-ui text-[12px] text-on-surface truncate" title={label}>{label}</p>
          <p className="font-body-ui text-[12px] text-on-surface-variant whitespace-nowrap">Slide {slides === 0 ? 0 : slide + 1} of {slides}</p>
          <div className="flex ctl rounded-md overflow-hidden self-start">
            <button
              onClick={() => onSlide(Math.max(0, slide - 1))}
              disabled={slide <= 0}
              className="px-2 py-1 disabled:opacity-35 hover:bg-on-surface/10"
              aria-label="Previous slide"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              onClick={() => onSlide(Math.min(slides - 1, slide + 1))}
              disabled={slide >= slides - 1}
              className="px-2 py-1 border-l border-outline-variant disabled:opacity-35 hover:bg-on-surface/10"
              aria-label="Next slide"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Renders verse spans with the same clickable Strong's-number treatment as
 * VersePanes.tsx's VerseRow — Option/Alt-click a word (or click its number tag) to look it up,
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
  const markerStrongs = useAppStore((s) => s.markerStrongs);
  return (
    <>
      {spans.map((span, i) => {
        const red = showRedLetter && span.is_red_letter;
        const strongsNumbers = contentStrongs(span.strongs ?? [], markerStrongs);
        if (strongsNumbers.length > 0 && showStrongs) {
          return (
            <span
              key={i}
              className={`strongs-word relative group/word border-b border-dashed hover:bg-secondary/10 pb-[3px] ${span.is_title ? "font-bold" : ""} ${red ? "text-red-600 dark:text-red-400 border-red-400/70" : "border-primary/50"}`}
              title={strongsNumbers.length === 1 ? "Option/Alt-click to look up in concordance" : "Option/Alt-click to look up this phrase's Strong's numbers"}
              onClick={(e) => { if (e.altKey) { e.stopPropagation(); onStrongsClick(strongsNumbers); } }}
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
