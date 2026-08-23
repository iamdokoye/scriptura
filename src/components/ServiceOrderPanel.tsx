import { useRef, useState } from "react";
import { useAppStore, type ServiceItem } from "../store/app";
import type { PresentationItemOverride, PresentationTheme } from "../lib/tauri";

export default function ServiceOrderPanel() {
  const {
    serviceOrder,
    setServiceOrderOpen,
    removeFromServiceOrder,
    reorderServiceOrder,
    clearServiceOrder,
    setCurrentRef,
    setView,
    currentRef,
    presentationThemes,
    updateServiceItemOverride,
  } = useAppStore();

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [overrideOpenId, setOverrideOpenId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  function navigateTo(item: ServiceItem) {
    setCurrentRef({ book: item.book, chapter: item.chapter, verse: item.verse });
    setView("reading");
    setServiceOrderOpen(false);
  }

  // An item is "active" if the reader is currently on that exact verse+module
  function isActive(item: ServiceItem) {
    return (
      item.book === currentRef.book &&
      item.chapter === currentRef.chapter &&
      item.verse === currentRef.verse
    );
  }

  // ── Drag-to-reorder via pointer events ───────────────────────────────────
  function onDragHandlePointerDown(e: React.PointerEvent, idx: number) {
    e.preventDefault();
    setDragIdx(idx);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onItemPointerEnter(idx: number) {
    if (dragIdx !== null && idx !== dragIdx) setOverIdx(idx);
  }

  function onPointerUp() {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      reorderServiceOrder(dragIdx, overIdx);
    }
    setDragIdx(null);
    setOverIdx(null);
  }

  const empty = serviceOrder.length === 0;

  return (
    <aside className="w-[300px] shrink-0 border-l border-outline-variant bg-surface-container-lowest flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">queue_play_next</span>
          <span className="font-headline-sm text-headline-sm text-on-surface">Service Queue</span>
        </div>
        <div className="flex items-center gap-1">
          {!empty && (
            <button
              onClick={clearServiceOrder}
              className="p-1.5 rounded text-secondary hover:text-error hover:bg-error-container transition-colors"
              title="Clear all"
            >
              <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
            </button>
          )}
          <button
            onClick={() => setServiceOrderOpen(false)}
            className="p-1.5 rounded text-secondary hover:bg-surface-container-low transition-colors"
            title="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* Item list */}
      <div
        className="flex-1 overflow-y-auto"
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {empty ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant opacity-40">
              queue_play_next
            </span>
            <p className="font-body-ui text-[13px] text-on-surface-variant leading-relaxed">
              Hover over any verse and click{" "}
              <span className="material-symbols-outlined text-[13px] align-middle">playlist_add</span>{" "}
              to add it to the service queue.
            </p>
          </div>
        ) : (
          <ul className="py-2">
            {serviceOrder.map((item, idx) => (
              <ServiceCard
                key={item.id}
                item={item}
                index={idx}
                active={isActive(item)}
                isDragging={dragIdx === idx}
                isOver={overIdx === idx}
                onNavigate={() => navigateTo(item)}
                onRemove={() => removeFromServiceOrder(item.id)}
                overrideOpen={overrideOpenId === item.id}
                onToggleOverride={() => setOverrideOpenId((open) => open === item.id ? null : item.id)}
                onUpdateOverride={(presentation_override) => updateServiceItemOverride(item.id, presentation_override)}
                presentationThemes={presentationThemes}
                onPointerEnter={() => onItemPointerEnter(idx)}
                onDragHandlePointerDown={(e) => onDragHandlePointerDown(e, idx)}
                dragNodeRef={dragIdx === idx ? dragNodeRef : undefined}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-3 border-t border-outline-variant space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-metadata-mono text-[11px] text-on-surface-variant">
            {serviceOrder.length} {serviceOrder.length === 1 ? "verse" : "verses"}
          </span>
          {!empty && (
            <button
              className="font-metadata-mono text-[11px] text-secondary hover:text-on-surface-variant transition-colors"
              onClick={() => {
                const text = serviceOrder
                  .map((it) => `${it.book} ${it.chapter}:${it.verse}  ${it.text}`)
                  .join("\n");
                navigator.clipboard.writeText(text).catch(() => {});
              }}
              title="Copy all to clipboard"
            >
              Copy list
            </button>
          )}
        </div>
        <button
          disabled={empty}
          className={`w-full py-2.5 rounded-DEFAULT font-body-ui text-[13px] font-semibold transition-colors flex items-center justify-center gap-2 ${
            empty
              ? "bg-surface-container text-on-surface-variant cursor-not-allowed"
              : "bg-primary text-on-primary hover:opacity-90"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">slideshow</span>
          Present
        </button>
      </div>
    </aside>
  );
}

// ── Individual item card ──────────────────────────────────────────────────────

function ServiceCard({
  item,
  index,
  active,
  isDragging,
  isOver,
  onNavigate,
  onRemove,
  overrideOpen,
  onToggleOverride,
  onUpdateOverride,
  presentationThemes,
  onPointerEnter,
  onDragHandlePointerDown,
  dragNodeRef,
}: {
  item: ServiceItem;
  index: number;
  active: boolean;
  isDragging: boolean;
  isOver: boolean;
  onNavigate: () => void;
  onRemove: () => void;
  overrideOpen: boolean;
  onToggleOverride: () => void;
  onUpdateOverride: (presentation_override: PresentationItemOverride | null) => void;
  presentationThemes: PresentationTheme[];
  onPointerEnter: () => void;
  onDragHandlePointerDown: (e: React.PointerEvent) => void;
  dragNodeRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <li
      ref={dragNodeRef as React.RefObject<HTMLLIElement> | undefined}
      onPointerEnter={onPointerEnter}
      className={`group relative mx-2 mb-1 rounded-DEFAULT border transition-all ${
        isDragging
          ? "opacity-40 border-primary bg-surface-container"
          : isOver
          ? "border-primary bg-primary/5"
          : active
          ? "border-primary bg-primary/8"
          : "border-transparent bg-surface hover:bg-surface-container-low border-outline-variant/0 hover:border-outline-variant/50"
      }`}
    >
      {/* Active indicator bar */}
      {active && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r-full" />
      )}

      {/* Drop indicator */}
      {isOver && !active && (
        <div className="absolute -top-0.5 left-3 right-3 h-0.5 bg-primary rounded-full" />
      )}

      <div className="flex items-start gap-2 px-2 py-2.5">
        {/* Drag handle */}
        <button
          className="mt-0.5 p-0.5 rounded text-on-surface-variant/40 hover:text-on-surface-variant cursor-grab active:cursor-grabbing touch-none shrink-0"
          onPointerDown={onDragHandlePointerDown}
          title="Drag to reorder"
        >
          <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        </button>

        {/* Content — clicking navigates */}
        <button
          className="flex-1 min-w-0 text-left"
          onClick={onNavigate}
          title="Go to verse"
        >
          <div className="flex items-baseline gap-1.5">
            <span className="font-metadata-mono text-[10px] text-on-surface-variant shrink-0">
              {index + 1}
            </span>
            <span className={`font-body-ui text-[13px] font-semibold leading-tight ${active ? "text-primary" : "text-on-surface"}`}>
              {item.book} {item.chapter}:{item.verse}
            </span>
            <span className="font-metadata-mono text-[10px] text-on-surface-variant truncate">
              {item.module}
            </span>
          </div>
          <p className="font-body-ui text-[12px] text-on-surface-variant leading-snug mt-0.5 line-clamp-2 text-left">
            {item.text}
          </p>
        </button>

        <button
          onClick={(event) => { event.stopPropagation(); onToggleOverride(); }}
          className={`mt-0.5 p-0.5 rounded transition-all shrink-0 ${item.presentation_override ? "text-primary opacity-100" : "text-secondary opacity-0 group-hover:opacity-100 hover:bg-surface-container"}`}
          title="Presentation overrides"
        >
          <span className="material-symbols-outlined text-[16px]">tune</span>
        </button>

        {/* Remove */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 mt-0.5 p-0.5 rounded text-secondary hover:text-error hover:bg-error-container transition-all shrink-0"
          title="Remove"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
      {overrideOpen && <ItemOverrideEditor item={item} themes={presentationThemes} onChange={onUpdateOverride} />}
    </li>
  );
}

function ItemOverrideEditor({ item, themes, onChange }: { item: ServiceItem; themes: PresentationTheme[]; onChange: (value: PresentationItemOverride | null) => void }) {
  const value = item.presentation_override ?? {};
  const update = (patch: Partial<PresentationItemOverride>) => onChange({ ...value, ...patch });
  const customBoxes = value.verse_box_x !== undefined;
  const updateCustomBoxes = (enabled: boolean) => onChange(enabled
    ? { ...value, verse_box_x: 10, verse_box_y: 24, verse_box_width: 80, verse_box_height: 48, reference_box_x: 10, reference_box_y: 76, reference_box_width: 80, reference_box_height: 10 }
    : Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("verse_box_") && !key.startsWith("reference_box_"))) as PresentationItemOverride);

  return <div className="border-t border-outline-variant bg-surface-container-low px-3 py-3 space-y-3">
    <div className="flex items-center justify-between gap-2"><p className="font-metadata-mono text-[10px] uppercase tracking-widest text-primary">Item presentation overrides</p><button onClick={() => onChange(null)} className="text-[11px] font-body-ui text-secondary hover:text-error">Clear overrides</button></div>
    <label className="block"><span className="field-label">Base theme</span><select value={value.theme_id ?? ""} onChange={(event) => update({ theme_id: event.target.value || undefined })} className="field-input text-[12px]"><option value="">Inherit active theme</option>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
    <OverrideRange label="Text scale" value={value.font_scale ?? 1} min={0.7} max={1.5} step={0.05} format={(number) => `${Math.round(number * 100)}%`} onChange={(font_scale) => update({ font_scale })} />
    <label className="block"><span className="field-label">Reference position</span><select value={value.reference_position ?? ""} onChange={(event) => update({ reference_position: (event.target.value || undefined) as PresentationItemOverride["reference_position"] })} className="field-input text-[12px]"><option value="">Inherit theme</option>{["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"].map((position) => <option key={position} value={position}>{position.replace("-", " ")}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2"><label className="block"><span className="field-label">Transition</span><select value={value.transition_type ?? ""} onChange={(event) => update({ transition_type: (event.target.value || undefined) as PresentationItemOverride["transition_type"] })} className="field-input text-[12px]"><option value="">Inherit</option><option value="fade">Fade</option><option value="slide">Slide up</option><option value="none">None</option></select></label><OverrideRange label="Duration" value={value.transition_duration ?? 300} min={0} max={1200} step={50} format={(number) => number ? `${number}ms` : "Instant"} onChange={(transition_duration) => update({ transition_duration })} /></div>
    <label className="flex items-center justify-between gap-3 font-body-ui text-[12px] text-on-surface"><span>Auto-fit this verse</span><input type="checkbox" checked={value.auto_layout ?? true} onChange={(event) => update({ auto_layout: event.target.checked })} className="accent-primary" /></label>
    <label className="flex items-center justify-between gap-3 font-body-ui text-[12px] text-on-surface"><span>Custom text boxes</span><input type="checkbox" checked={customBoxes} onChange={(event) => updateCustomBoxes(event.target.checked)} className="accent-primary" /></label>
    {customBoxes && <div className="grid grid-cols-2 gap-x-3 gap-y-2"><OverrideRange label="Verse left" value={value.verse_box_x ?? 10} min={0} max={80} step={1} format={(number) => `${number}%`} onChange={(verse_box_x) => update({ verse_box_x })} /><OverrideRange label="Verse top" value={value.verse_box_y ?? 24} min={0} max={80} step={1} format={(number) => `${number}%`} onChange={(verse_box_y) => update({ verse_box_y })} /><OverrideRange label="Verse width" value={value.verse_box_width ?? 80} min={20} max={100} step={1} format={(number) => `${number}%`} onChange={(verse_box_width) => update({ verse_box_width })} /><OverrideRange label="Verse height" value={value.verse_box_height ?? 48} min={18} max={100} step={1} format={(number) => `${number}%`} onChange={(verse_box_height) => update({ verse_box_height })} /><OverrideRange label="Label left" value={value.reference_box_x ?? 10} min={0} max={80} step={1} format={(number) => `${number}%`} onChange={(reference_box_x) => update({ reference_box_x })} /><OverrideRange label="Label top" value={value.reference_box_y ?? 76} min={0} max={90} step={1} format={(number) => `${number}%`} onChange={(reference_box_y) => update({ reference_box_y })} /><OverrideRange label="Label width" value={value.reference_box_width ?? 80} min={16} max={100} step={1} format={(number) => `${number}%`} onChange={(reference_box_width) => update({ reference_box_width })} /><OverrideRange label="Label height" value={value.reference_box_height ?? 10} min={8} max={40} step={1} format={(number) => `${number}%`} onChange={(reference_box_height) => update({ reference_box_height })} /></div>}
    <p className="font-body-ui text-[10px] leading-relaxed text-on-surface-variant">Only values set here override the selected theme for {item.book} {item.chapter}:{item.verse}.</p>
  </div>;
}

function OverrideRange({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void }) {
  return <label className="block"><span className="field-label flex justify-between gap-2"><span>{label}</span><span>{format(value)}</span></span><input className="w-full accent-primary" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
