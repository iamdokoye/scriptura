import { useEffect, useRef, useState } from "react";
import { useAppStore, type ServiceItem } from "../store/app";
import { api } from "../lib/tauri";
import { emitPresentation } from "../lib/presentation";
import SideNav from "../components/SideNav";

// ── Reference parser ──────────────────────────────────────────────────────────
// Accepts: "John 3:16", "1 Cor 13:4", "Genesis 1:1", "Ps 23:1"
function parseRef(input: string): { book: string; chapter: number; verse: number } | null {
  const match = input.trim().match(/^((?:\d\s*)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+):(\d+)$/);
  if (!match) return null;
  const chapter = parseInt(match[2], 10);
  const verse = parseInt(match[3], 10);
  if (!chapter || !verse) return null;
  return { book: match[1].trim(), chapter, verse };
}

function plainText(spans: { text: string }[]): string {
  return spans.map((s) => s.text).join("").replace(/\s+/g, " ").trim();
}

export default function SetlistView() {
  const {
    serviceOrder,
    removeFromServiceOrder,
    reorderServiceOrder,
    clearServiceOrder,
    addToServiceOrder,
    setCurrentRef,
    primaryModule,
    parallelModule,
    parallelMode,
    displayPrefs,
    readingFontSize,
    presentationActive,
    setPresentationActive,
  } = useAppStore();

  // ── Quick-add state ───────────────────────────────────────────────────────
  const [refInput, setRefInput] = useState("");
  const [preview, setPreview] = useState<{ text: string; ref: { book: string; chapter: number; verse: number } } | null>(null);
  const [previewErr, setPreviewErr] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Drag state ────────────────────────────────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // ── Active item for presentation ──────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);

  // Debounce reference lookup as user types
  useEffect(() => {
    if (previewDebounce.current) clearTimeout(previewDebounce.current);
    const parsed = parseRef(refInput);
    if (!parsed || !primaryModule) {
      setPreview(null);
      setPreviewErr("");
      return;
    }
    previewDebounce.current = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewErr("");
      try {
        const v = await api.getVerse(primaryModule, parsed.book, parsed.chapter, parsed.verse);
        setPreview({ text: plainText(v.spans), ref: parsed });
      } catch {
        setPreview(null);
        setPreviewErr("Verse not found — check the reference.");
      } finally {
        setPreviewLoading(false);
      }
    }, 500);
  }, [refInput, primaryModule]);

  function addPreview() {
    if (!preview || !primaryModule) return;
    addToServiceOrder({
      book: preview.ref.book,
      chapter: preview.ref.chapter,
      verse: preview.ref.verse,
      text: preview.text,
      module: primaryModule,
    });
    setRefInput("");
    setPreview(null);
  }

  // ── Present an item ───────────────────────────────────────────────────────
  async function presentItem(item: ServiceItem) {
    setActiveId(item.id);
    setCurrentRef({ book: item.book, chapter: item.chapter, verse: item.verse });
    if (presentationActive && primaryModule) {
      emitPresentation({
        book: item.book,
        chapter: item.chapter,
        verse: item.verse,
        primaryModule: item.module || primaryModule,
        parallelModule,
        parallelMode,
        selectedStrongs: null,
        displayPrefs,
        readingFontSize,
      });
    }
  }

  // ── Toggle presentation window ────────────────────────────────────────────
  async function toggleLive() {
    try {
      if (presentationActive) {
        await api.closePresentationWindow();
        setPresentationActive(false);
      } else {
        await api.openPresentationWindow();
        setPresentationActive(true);
        // If an item is already selected, broadcast it immediately
        const item = activeId ? serviceOrder.find((x) => x.id === activeId) : serviceOrder[0];
        if (item && primaryModule) {
          emitPresentation({
            book: item.book,
            chapter: item.chapter,
            verse: item.verse,
            primaryModule: item.module || primaryModule,
            parallelModule,
            parallelMode,
            selectedStrongs: null,
            displayPrefs,
            readingFontSize,
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function onDragStart(e: React.PointerEvent, idx: number) {
    e.preventDefault();
    setDragIdx(idx);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerUp() {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      reorderServiceOrder(dragIdx, overIdx);
      if (activeId) {
        const moved = serviceOrder[dragIdx];
        if (moved?.id === activeId) { /* id unchanged, fine */ }
      }
    }
    setDragIdx(null);
    setOverIdx(null);
  }

  const empty = serviceOrder.length === 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="icon-rail" />

      <div className="flex flex-1 flex-col overflow-hidden pl-[64px]">
        {/* Header */}
        <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-lowest">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px] text-primary">queue_music</span>
            <div>
              <h1 className="font-headline-md text-[18px] font-semibold text-on-surface leading-none">Setlist</h1>
              <p className="font-metadata-mono text-[11px] text-on-surface-variant mt-0.5">
                {serviceOrder.length === 0
                  ? "No items yet"
                  : `${serviceOrder.length} ${serviceOrder.length === 1 ? "item" : "items"}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {presentationActive && (
              <span className="flex items-center gap-1.5 font-metadata-mono text-[11px] text-error bg-error/10 px-2.5 py-1 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-error inline-block" />
                LIVE
              </span>
            )}
            {!empty && (
              <button
                onClick={clearServiceOrder}
                className="p-2 rounded-DEFAULT text-secondary hover:text-error hover:bg-error-container transition-colors"
                title="Clear setlist"
              >
                <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
              </button>
            )}
            <button
              onClick={toggleLive}
              className={`flex items-center gap-2 px-4 py-2 rounded-DEFAULT font-body-ui text-[13px] font-semibold transition-colors ${
                presentationActive
                  ? "bg-error text-on-error hover:opacity-90"
                  : "bg-primary text-on-primary hover:opacity-90"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {presentationActive ? "stop_circle" : "slideshow"}
              </span>
              {presentationActive ? "Stop" : "Go Live"}
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── Setlist items ─────────────────────────────────────────── */}
          <main
            className="flex-1 overflow-y-auto"
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {empty ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                <span className="material-symbols-outlined text-[56px] text-on-surface-variant opacity-20">queue_music</span>
                <div>
                  <p className="font-body-ui text-[15px] text-on-surface font-medium">Your setlist is empty</p>
                  <p className="font-body-ui text-[13px] text-on-surface-variant mt-1 leading-relaxed max-w-xs">
                    Add a verse reference on the right, or hover any verse in the Library and click{" "}
                    <span className="material-symbols-outlined text-[13px] align-middle">playlist_add</span>.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="p-4 space-y-2">
                {serviceOrder.map((item, idx) => {
                  const isActive = item.id === activeId;
                  const isDragging = dragIdx === idx;
                  const isOver = overIdx === idx;
                  return (
                    <SetlistCard
                      key={item.id}
                      item={item}
                      index={idx}
                      active={isActive}
                      presentationActive={presentationActive}
                      isDragging={isDragging}
                      isOver={isOver}
                      onPresent={() => presentItem(item)}
                      onRemove={() => removeFromServiceOrder(item.id)}
                      onPointerEnter={() => { if (dragIdx !== null && idx !== dragIdx) setOverIdx(idx); }}
                      onDragStart={(e) => onDragStart(e, idx)}
                    />
                  );
                })}
              </ul>
            )}
          </main>

          {/* ── Quick Add panel ───────────────────────────────────────── */}
          <aside className="w-[300px] shrink-0 border-l border-outline-variant bg-surface-container-lowest flex flex-col overflow-hidden">
            <div className="p-4 border-b border-outline-variant shrink-0">
              <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-3">
                Quick Add
              </p>
              <div className="relative">
                <input
                  type="text"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && preview) addPreview(); }}
                  placeholder="e.g. John 3:16"
                  className="w-full bg-surface border border-outline-variant rounded-DEFAULT px-3 py-2 font-body-ui text-[14px] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
                />
                {previewLoading && (
                  <span className="absolute right-2.5 top-2.5 material-symbols-outlined text-[16px] text-on-surface-variant animate-spin">
                    progress_activity
                  </span>
                )}
              </div>
              <p className="font-metadata-mono text-[11px] text-on-surface-variant mt-1.5">
                Type a reference and press Enter
              </p>
            </div>

            {/* Preview */}
            <div className="flex-1 overflow-y-auto p-4">
              {previewErr && (
                <div className="flex items-start gap-2 p-3 rounded-DEFAULT bg-error-container text-on-error-container">
                  <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">error</span>
                  <p className="font-body-ui text-[12px]">{previewErr}</p>
                </div>
              )}

              {preview && (
                <div className="space-y-3">
                  <div className="p-3 rounded-DEFAULT bg-surface border border-outline-variant">
                    <p className="font-body-ui text-[12px] font-semibold text-primary mb-1">
                      {preview.ref.book} {preview.ref.chapter}:{preview.ref.verse}
                    </p>
                    <p className="font-body-ui text-[13px] text-on-surface leading-relaxed">
                      {preview.text}
                    </p>
                    {primaryModule && (
                      <p className="font-metadata-mono text-[10px] text-on-surface-variant mt-1.5">{primaryModule}</p>
                    )}
                  </div>
                  <button
                    onClick={addPreview}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-DEFAULT bg-primary text-on-primary font-body-ui text-[13px] font-semibold hover:opacity-90 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                    Add to Setlist
                  </button>
                </div>
              )}

              {!preview && !previewErr && !refInput && (
                <div className="text-center mt-8">
                  <span className="material-symbols-outlined text-[36px] text-on-surface-variant opacity-20">search</span>
                  <p className="font-body-ui text-[12px] text-on-surface-variant mt-2">
                    Enter a verse reference above to preview it
                  </p>
                </div>
              )}
            </div>

            {/* Module indicator */}
            {primaryModule && (
              <div className="shrink-0 px-4 py-3 border-t border-outline-variant">
                <p className="font-metadata-mono text-[10px] text-on-surface-variant">
                  Using <span className="text-primary">{primaryModule}</span>
                </p>
                <p className="font-metadata-mono text-[10px] text-on-surface-variant/60 mt-0.5">
                  Switch translations in Library view
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────

function SetlistCard({
  item,
  index,
  active,
  presentationActive,
  isDragging,
  isOver,
  onPresent,
  onRemove,
  onPointerEnter,
  onDragStart,
}: {
  item: ServiceItem;
  index: number;
  active: boolean;
  presentationActive: boolean;
  isDragging: boolean;
  isOver: boolean;
  onPresent: () => void;
  onRemove: () => void;
  onPointerEnter: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}) {
  return (
    <li
      onPointerEnter={onPointerEnter}
      className={`group relative rounded-DEFAULT border transition-all ${
        isDragging
          ? "opacity-40 border-primary bg-surface-container scale-[0.98]"
          : isOver
          ? "border-primary bg-primary/5"
          : active
          ? "border-primary bg-primary/8 shadow-sm"
          : "border-outline-variant bg-surface hover:border-outline hover:shadow-sm"
      }`}
    >
      {/* Drop indicator */}
      {isOver && <div className="absolute -top-1 left-4 right-4 h-0.5 bg-primary rounded-full" />}

      <div className="flex items-center gap-3 px-3 py-3.5">
        {/* Drag handle */}
        <button
          className="p-1 rounded text-on-surface-variant/30 hover:text-on-surface-variant cursor-grab active:cursor-grabbing touch-none shrink-0"
          onPointerDown={onDragStart}
          title="Drag to reorder"
        >
          <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
        </button>

        {/* Index / active indicator */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold font-metadata-mono transition-colors ${
          active
            ? "bg-primary text-on-primary"
            : "bg-surface-container text-on-surface-variant"
        }`}>
          {active && presentationActive
            ? <span className="material-symbols-outlined text-[14px]">wifi_tethering</span>
            : index + 1}
        </div>

        {/* Content */}
        <button className="flex-1 min-w-0 text-left" onClick={onPresent}>
          <div className="flex items-baseline gap-2">
            <span className={`font-body-ui text-[14px] font-semibold leading-tight ${active ? "text-primary" : "text-on-surface"}`}>
              {item.book} {item.chapter}:{item.verse}
            </span>
            <span className="font-metadata-mono text-[10px] text-on-surface-variant truncate">{item.module}</span>
          </div>
          <p className="font-body-ui text-[12px] text-on-surface-variant leading-snug mt-0.5 line-clamp-2">
            {item.text}
          </p>
        </button>

        {/* Present shortcut */}
        <button
          onClick={onPresent}
          className={`shrink-0 p-1.5 rounded-DEFAULT transition-all ${
            active && presentationActive
              ? "text-primary bg-primary/10"
              : "opacity-0 group-hover:opacity-100 text-secondary hover:text-primary hover:bg-primary/10"
          }`}
          title={presentationActive ? "Present this verse" : "Navigate to verse"}
        >
          <span className="material-symbols-outlined text-[18px]">
            {presentationActive ? "cast" : "arrow_forward"}
          </span>
        </button>

        {/* Remove */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-DEFAULT text-secondary hover:text-error hover:bg-error-container transition-all"
          title="Remove"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </li>
  );
}
