import { useLayoutEffect, useRef, useState } from "react";

const FONT_STEP = 2;
const WIDTH_STEP = 15;

export interface WidthRange {
  /** Starting width, as a percentage of the container's parent. */
  min: number;
  /** Widest the container is allowed to grow to, as a percentage. */
  max: number;
}

/**
 * Fits long text into `containerRef`'s box (definite, CSS-bound height —
 * h-full against a definite ancestor, or a fixed/vh height, or there's
 * nothing to measure overflow against) in two phases, same idea presentation
 * software uses for long slide text:
 *
 *  1. Widen: if `widthRange` is given, grow the container's width toward
 *     `widthRange.max` first — more width means more characters per line,
 *     which often clears the overflow without touching font size at all.
 *  2. Shrink: only once at max width and still overflowing, step font-size
 *     down from `maxSize` until it fits or `minSize` is reached.
 */
export function useShrinkToFit({ text, maxSize, minSize = 24, widthRange }: {
  text: string;
  maxSize: number;
  minSize?: number;
  widthRange?: WidthRange;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [fontSize, setFontSize] = useState(maxSize);
  const [widthPct, setWidthPct] = useState(widthRange?.min ?? 100);
  const [resizeTick, setResizeTick] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) return;
    const overflows = () => container.scrollHeight > container.clientHeight;

    let width = widthRange?.min ?? 100;
    if (widthRange) container.style.width = `${width}%`;

    let size = maxSize;
    el.style.fontSize = `${size}px`;

    if (widthRange) {
      while (overflows() && width < widthRange.max) {
        width = Math.min(widthRange.max, width + WIDTH_STEP);
        container.style.width = `${width}%`;
      }
    }

    while (size > minSize && overflows()) {
      size -= FONT_STEP;
      el.style.fontSize = `${size}px`;
    }

    setFontSize(size);
    setWidthPct(width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, maxSize, minSize, widthRange?.min, widthRange?.max, resizeTick]);

  return { containerRef, textRef, fontSize, widthPct };
}
