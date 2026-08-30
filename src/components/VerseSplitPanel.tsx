import { useEffect, useRef, useState } from "react";
import { PART_LABELS, partPreview } from "../lib/verseSplit";

interface Props {
  /** The split parts of the current verse. Panel only renders when parts.length > 1. */
  parts: string[];
  /** Which part is active (0-indexed). */
  currentPart: number;
  /** Called when the operator clicks a part to send it to the output screen. */
  onPartClick: (index: number) => void;
  /**
   * The scrollable container that holds the verse rows — used as the
   * IntersectionObserver root so the panel hides when the verse scrolls
   * completely out of the reading area.
   */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** data-verse value of the active verse row. */
  verseNumber: number;
  /** Offset the panel from the left to clear the SideNav rail (default 72). */
  leftOffset?: number;
}

/**
 * Left-side floating panel that shows the split parts of a long verse.
 * It stays fixed while the verse is anywhere in the scroll viewport and
 * hides when the verse scrolls completely out of view.
 */
export default function VerseSplitPanel({
  parts,
  currentPart,
  onPartClick,
  scrollContainerRef,
  verseNumber,
  leftOffset = 72,
}: Props) {
  const [verseVisible, setVerseVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Track whether the active verse row is in the scroll viewport
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) return;

    const el = root.querySelector<HTMLElement>(`[data-verse="${verseNumber}"]`);
    if (!el) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      ([entry]) => setVerseVisible(entry.isIntersecting),
      { root, threshold: 0 },
    );
    observerRef.current.observe(el);

    return () => observerRef.current?.disconnect();
  }, [scrollContainerRef, verseNumber]);

  // Trigger the slide-in animation when the panel becomes visible
  useEffect(() => {
    if (verseVisible && parts.length > 1) {
      const raf = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setAnimateIn(false);
    }
  }, [verseVisible, parts.length]);

  if (parts.length <= 1) return null;

  const isVisible = verseVisible;

  return (
    <div
      className={`fixed top-1/2 -translate-y-1/2 z-40 transition-all duration-200 ease-out pointer-events-${isVisible ? "auto" : "none"}`}
      style={{ left: `${leftOffset}px` }}
    >
      <div
        className={`w-64 bg-surface border border-outline-variant rounded-DEFAULT shadow-lg overflow-hidden transition-all duration-200 ease-out ${
          isVisible && animateIn
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-4"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-outline-variant bg-surface-container-low">
          <span className="material-symbols-outlined text-[15px] text-secondary">content_cut</span>
          <span className="font-metadata-mono text-[11px] text-on-surface-variant uppercase tracking-widest">
            Split · {parts.length} parts
          </span>
        </div>

        {/* Part list */}
        <div className="py-1">
          {parts.map((part, i) => {
            const isActive = i === currentPart;
            const label = PART_LABELS[i] ?? String.fromCharCode(97 + i);
            return (
              <button
                key={i}
                onClick={() => onPartClick(i)}
                className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 transition-colors ${
                  isActive
                    ? "bg-primary/10 text-on-surface"
                    : "hover:bg-surface-container-high text-on-surface"
                }`}
              >
                {/* Part label badge */}
                <span
                  className={`shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center font-metadata-mono text-[11px] font-bold ${
                    isActive
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-secondary"
                  }`}
                >
                  {label}
                </span>

                {/* Preview text */}
                <span className="font-body-ui text-[12px] leading-relaxed line-clamp-2 flex-1">
                  {partPreview(part, 60)}
                </span>

                {/* Active indicator */}
                {isActive && (
                  <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">
                    arrow_right
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 border-t border-outline-variant bg-surface-container-low/50">
          <p className="font-metadata-mono text-[10px] text-on-surface-variant/70 text-center">
            Click a part to send it to the screen
          </p>
        </div>
      </div>
    </div>
  );
}
