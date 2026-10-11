import { useEffect, useMemo, useRef, useState } from "react";
import type { PresentationThemeInput } from "../../lib/tauri";
import { FRAME_H, FRAME_W, boxKey, type ThemeElement } from "../../lib/themeDraft";
import GridMenu from "./GridMenu";
import { GRIDS, activeLines, loadGridSettings, saveGridSettings, snapMove, snapResize, type GridSettings } from "./grids";
import { previewBackground, referenceJustify, referenceTextStyle, verseTextStyle } from "./themePreviewStyle";

interface Props {
  draft: PresentationThemeInput;
  onChange: (next: PresentationThemeInput) => void;
  selected: ThemeElement;
  onSelect: (element: ThemeElement) => void;
  lockAspect: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const MIN_ZOOM = 40;
const MAX_ZOOM = 200;

type BoxRect = { x: number; y: number; width: number; height: number };

function readBox(draft: PresentationThemeInput, element: ThemeElement): BoxRect {
  const k = boxKey(element);
  return {
    x: draft[`${k}_x` as keyof PresentationThemeInput] as number,
    y: draft[`${k}_y` as keyof PresentationThemeInput] as number,
    width: draft[`${k}_width` as keyof PresentationThemeInput] as number,
    height: draft[`${k}_height` as keyof PresentationThemeInput] as number,
  };
}

function withBox(draft: PresentationThemeInput, element: ThemeElement, box: BoxRect): PresentationThemeInput {
  const k = boxKey(element);
  const round = (n: number) => Math.round(n * 10) / 10;
  return { ...draft, [`${k}_x`]: round(box.x), [`${k}_y`]: round(box.y), [`${k}_width`]: round(box.width), [`${k}_height`]: round(box.height) };
}

export default function ThemeCanvas({ draft, onChange, selected, onSelect, lockAspect, canUndo, canRedo, onUndo, onRedo }: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(100);
  const [grid, setGrid] = useState<GridSettings>(loadGridSettings);
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  // Lines a box is currently locked to while dragging, drawn highlighted.
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const lines = useMemo(() => activeLines(grid.enabled, draft.safe_margin), [grid.enabled, draft.safe_margin]);

  useEffect(() => saveGridSettings(grid), [grid]);

  function beginDrag(event: React.PointerEvent, element: ThemeElement, resize: boolean) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(element);
    canvasRef.current?.focus({ preventScroll: true });
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const start = readBox(draft, element);
    const minWidth = element === "verse" ? 20 : 16;
    const minHeight = element === "verse" ? 18 : 8;
    // Aspect compared in real frame pixels, not raw percentages — a 16:9 frame
    // makes equal % values non-square.
    const aspect = (start.width * FRAME_W) / (start.height * FRAME_H);
    const origin = { x: event.clientX, y: event.clientY };

    const move = (pointer: PointerEvent) => {
      const dx = ((pointer.clientX - origin.x) / bounds.width) * 100;
      const dy = ((pointer.clientY - origin.y) / bounds.height) * 100;
      // Alt bypasses snapping so a box can still be placed between lines.
      const snapping = grid.snap && !pointer.altKey;
      let { x, y, width, height } = start;
      let guideX: number | null = null;
      let guideY: number | null = null;
      if (resize) {
        width = Math.max(minWidth, Math.min(100 - start.x, start.width + dx));
        height = Math.max(minHeight, Math.min(100 - start.y, start.height + dy));
        if (snapping) {
          const w = snapResize(start.x, width, lines.x);
          width = Math.max(minWidth, Math.min(100 - start.x, w.size));
          guideX = w.line;
          // With the aspect lock on, height follows width, so only snap it when free.
          if (!lockAspect) {
            const h = snapResize(start.y, height, lines.y);
            height = Math.max(minHeight, Math.min(100 - start.y, h.size));
            guideY = h.line;
          }
        }
        if (lockAspect) {
          const byWidth = (width * FRAME_W) / aspect / FRAME_H;
          if (byWidth <= 100 - start.y && byWidth >= minHeight) height = byWidth;
          else width = (height * FRAME_H * aspect) / FRAME_W;
        }
      } else {
        x = start.x + dx;
        y = start.y + dy;
        if (snapping) {
          const sx = snapMove(x, width, lines.x);
          const sy = snapMove(y, height, lines.y);
          x = sx.start;
          y = sy.start;
          guideX = sx.line;
          guideY = sy.line;
        }
        x = Math.max(0, Math.min(100 - width, x));
        y = Math.max(0, Math.min(100 - height, y));
      }
      setGuides({ x: guideX, y: guideY });
      onChange(withBox(draft, element, { x, y, width, height }));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      setGuides({ x: null, y: null });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  // Arrow keys nudge the selected box; Shift nudges further.
  function onKeyDown(e: React.KeyboardEvent) {
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = arrows[e.key];
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? 2 : 0.5;
    const box = readBox(draft, selected);
    onChange(withBox(draft, selected, {
      ...box,
      x: Math.max(0, Math.min(100 - box.width, box.x + dir[0] * step)),
      y: Math.max(0, Math.min(100 - box.height, box.y + dir[1] * step)),
    }));
  }

  const boxStyle = (element: ThemeElement): React.CSSProperties => {
    const b = readBox(draft, element);
    return {
      left: `${b.x}%`, top: `${b.y}%`, width: `${b.width}%`, height: `${b.height}%`,
      ...(element === "verse" && draft.verse_box_fill ? { background: draft.verse_box_fill } : {}),
    };
  };

  return (
    <section
      className="panel rounded-3xl relative min-h-0 overflow-hidden flex flex-col"
      style={{ backgroundImage: "radial-gradient(rgb(var(--col-on-surface) / 0.13) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 glass rounded-2xl px-2 py-1.5 flex items-center gap-1">
        <ToolButton icon="undo" title="Undo" disabled={!canUndo} onClick={onUndo} />
        <ToolButton icon="redo" title="Redo" disabled={!canRedo} onClick={onRedo} />
        <span className="w-px h-5 bg-outline-variant mx-1" />
        <ToolButton icon="title" title="Select verse text" active={selected === "verse"} onClick={() => onSelect("verse")} />
        <ToolButton icon="label" title="Select reference label" active={selected === "reference"} onClick={() => onSelect("reference")} />
        <span className="w-px h-5 bg-outline-variant mx-1" />
        <div className="relative" data-grid-menu-trigger>
          <ToolButton
            icon={grid.snap ? "grid_goldenratio" : "grid_4x4"}
            title={grid.snap ? "Grids — snapping on" : "Grids and snapping"}
            active={grid.enabled.length > 0 || grid.snap || gridMenuOpen}
            onClick={() => setGridMenuOpen((v) => !v)}
          />
          {gridMenuOpen && <GridMenu settings={grid} onChange={setGrid} onClose={() => setGridMenuOpen(false)} />}
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-auto flex px-10 pt-20 pb-24"
        onPointerDown={() => canvasRef.current?.focus()}
      >
        <div
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-label="Theme canvas. Arrow keys move the selected box."
          className="m-auto aspect-video relative overflow-hidden rounded-lg shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60 shrink-0"
          style={{ width: `${zoom}%`, ...previewBackground(draft), color: draft.text_color, containerType: "inline-size" }}
        >
          <GridOverlay enabled={grid.enabled} safeMargin={draft.safe_margin} guides={guides} />

          <CanvasBox
            label="Verse"
            selected={selected === "verse"}
            style={boxStyle("verse")}
            onPointerDown={(e) => beginDrag(e, "verse", false)}
            onResizePointerDown={(e) => beginDrag(e, "verse", true)}
          >
            <p className="h-full flex items-center" style={verseTextStyle(draft)}>
              <span className="w-full">For God so loved the world, that he gave his only begotten Son.</span>
            </p>
          </CanvasBox>

          <CanvasBox
            label="Reference"
            selected={selected === "reference"}
            style={boxStyle("reference")}
            onPointerDown={(e) => beginDrag(e, "reference", false)}
            onResizePointerDown={(e) => beginDrag(e, "reference", true)}
          >
            <p
              className="h-full flex items-center font-metadata-mono uppercase"
              style={{ ...referenceTextStyle(draft), letterSpacing: "0.18em", justifyContent: referenceJustify(draft) }}
            >
              John 3:16 · KJV
            </p>
          </CanvasBox>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 glass rounded-2xl px-3 py-1.5 flex items-center gap-2">
        <ToolButton icon="zoom_out" title="Zoom out" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 10))} />
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={5}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="w-36 accent-primary"
        />
        <ToolButton icon="zoom_in" title="Zoom in" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 10))} />
        <button onClick={() => setZoom(100)} title="Fit to width" className="w-11 text-center font-metadata-mono text-[11px] text-on-surface-variant hover:text-on-surface">
          {zoom}%
        </button>
      </div>
    </section>
  );
}

function ToolButton({ icon, title, active, disabled, onClick }: { icon: string; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed ${active ? "ctl-active" : "ghost text-on-surface-variant"}`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}

function CanvasBox({ label, selected, style, children, onPointerDown, onResizePointerDown }: {
  label: string;
  selected: boolean;
  style: React.CSSProperties; // may carry a background fill (lower-third bar)
  children: React.ReactNode;
  onPointerDown: (event: React.PointerEvent) => void;
  onResizePointerDown: (event: React.PointerEvent) => void;
}) {
  return (
    <div
      className={`group absolute cursor-move p-[1.2%] select-none ${selected ? "border border-solid border-primary" : "border border-dashed border-white/30 hover:border-white/60"}`}
      style={style}
      onPointerDown={onPointerDown}
      title={`${label}: drag to move`}
    >
      <span className={`absolute -top-5 left-0 px-1.5 rounded bg-black/55 text-white/85 font-metadata-mono text-[10px] tracking-wide ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}>
        {label}
      </span>
      {children}
      {selected && (
        <button
          type="button"
          aria-label={`Resize ${label}`}
          onPointerDown={onResizePointerDown}
          className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-white border-2 border-primary cursor-nwse-resize"
        />
      )}
    </div>
  );
}

function GridOverlay({ enabled, safeMargin, guides }: { enabled: GridSettings["enabled"]; safeMargin: number; guides: { x: number | null; y: number | null } }) {
  const line = (axis: "x" | "y", pct: number, key: string, color: string, dashed?: boolean, heavy?: boolean) => {
    const common: React.CSSProperties = dashed
      ? { backgroundImage: `repeating-linear-gradient(${axis === "x" ? "180deg" : "90deg"}, ${color} 0 6px, transparent 6px 12px)` }
      : { background: color };
    return axis === "x" ? (
      <div key={key} className="absolute top-0 bottom-0" style={{ left: `${pct}%`, width: heavy ? 2 : 1, ...common }} />
    ) : (
      <div key={key} className="absolute left-0 right-0" style={{ top: `${pct}%`, height: heavy ? 2 : 1, ...common }} />
    );
  };

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {GRIDS.filter((g) => enabled.includes(g.id)).flatMap((g) => {
        const lines = g.lines(safeMargin);
        const color = g.style.accent ? `rgba(125, 211, 252, ${g.style.alpha})` : `rgba(255, 255, 255, ${g.style.alpha})`;
        return [
          ...lines.x.map((pct) => line("x", pct, `${g.id}-x-${pct}`, color, g.style.dashed)),
          ...lines.y.map((pct) => line("y", pct, `${g.id}-y-${pct}`, color, g.style.dashed)),
        ];
      })}
      {guides.x !== null && line("x", guides.x, "guide-x", "rgb(var(--col-primary))", false, true)}
      {guides.y !== null && line("y", guides.y, "guide-y", "rgb(var(--col-primary))", false, true)}
    </div>
  );
}
