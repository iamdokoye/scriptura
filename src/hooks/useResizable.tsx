import { useCallback, useRef, useState } from "react";

type Axis = "x" | "y";

interface Options {
  /** localStorage key; the chosen size survives restarts. */
  storageKey: string;
  initial: number;
  min: number;
  /** Upper bound, evaluated at drag time so it can depend on the window size. */
  max: number | (() => number);
  axis: Axis;
  /** Handle sits on the far side of the panel (dragging toward the start grows it). */
  invert?: boolean;
}

function readStored(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function useResizable({ storageKey, initial, min, max, axis, invert }: Options) {
  // Clamp on the way in: a stored or initial size from a differently sized
  // (or not yet laid out) window must never leave a panel collapsed.
  const [size, setSize] = useState(() => {
    const upper = typeof max === "function" ? max() : max;
    return Math.min(Math.max(readStored(storageKey, initial), min), Math.max(min, upper));
  });
  const sizeRef = useRef(size);
  const drag = useRef<{ start: number; startSize: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const commit = useCallback((next: number) => {
    sizeRef.current = next;
    setSize(next);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { start: axis === "x" ? e.clientX : e.clientY, startSize: sizeRef.current };
    setDragging(true);
  }, [axis]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const pos = axis === "x" ? e.clientX : e.clientY;
    const delta = (pos - drag.current.start) * (invert ? -1 : 1);
    const upper = typeof max === "function" ? max() : max;
    commit(Math.min(Math.max(drag.current.startSize + delta, min), Math.max(min, upper)));
  }, [axis, invert, max, min, commit]);

  const onPointerUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    try {
      localStorage.setItem(storageKey, String(Math.round(sizeRef.current)));
    } catch {
      // Storage unavailable — size just won't persist across restarts.
    }
  }, [storageKey]);

  const reset = useCallback(() => {
    commit(initial);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [initial, storageKey, commit]);

  return { size, dragging, handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: reset } };
}

interface HandleProps {
  axis: Axis;
  dragging: boolean;
  handleProps: ReturnType<typeof useResizable>["handleProps"];
  label: string;
}

/** A thin draggable divider. `axis="x"` resizes horizontally (vertical bar). */
export function ResizeHandle({ axis, dragging, handleProps, label }: HandleProps) {
  const horizontal = axis === "x";
  return (
    <div
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={`Resize ${label} (double-click to reset)`}
      title="Drag to resize · double-click to reset"
      {...handleProps}
      className={`group shrink-0 flex items-center justify-center touch-none select-none ${
        horizontal ? "w-2 -mx-1 cursor-col-resize" : "h-2 -my-1 cursor-row-resize"
      }`}
    >
      <span
        className={`rounded-full transition-colors ${
          horizontal ? "w-[3px] h-10" : "h-[3px] w-10"
        } ${dragging ? "bg-primary" : "bg-outline-variant group-hover:bg-primary/60"}`}
      />
    </div>
  );
}
