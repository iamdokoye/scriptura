import type { ReactNode } from "react";
import { useSheetVisibility } from "../hooks/useSheetVisibility";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  icon: string;
  title: ReactNode;
  /** Rendered right after the title, on the left side of the header (e.g. a result count). */
  titleExtra?: ReactNode;
  /** Rendered before the close button, on the right side of the header (e.g. a source label). */
  actionsExtra?: ReactNode;
  /** Fires once the slide-in animation actually starts (see useSheetVisibility). */
  onVisible?: () => void;
  maxHeightVh: number;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * The bottom-sheet shell shared by CrossRefSheet, CommentarySheet, NotesSheet, and
 * CompareSheet: backdrop + click-outside-to-close, slide-up-on-open animation,
 * header (icon/title/close), and a scrollable body. Each sheet keeps its own data
 * fetching and body content entirely — this only owns the part that was identical
 * across all four (the shell), not the part that's genuinely different per sheet
 * (what's fetched, how tall the body gets, what's shown inside it).
 *
 * StrongsSheet is deliberately NOT built on this: it's a centered, user-resizable
 * modal rather than a full-width bottom sheet, with its own backdrop and
 * escape-key handling — different enough that sharing this shell would mean
 * adding StrongsSheet-only escape hatches to every other sheet. It still uses the
 * same useSheetVisibility hook this shell is built on, just with its own markup.
 */
export default function SheetShell({
  isOpen, onClose, icon, title, titleExtra, actionsExtra, onVisible, maxHeightVh, bodyClassName, children,
}: Props) {
  const visible = useSheetVisibility(isOpen, { onVisible });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className={`absolute bottom-3 left-3 right-3 glass rounded-3xl transition-all duration-300 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-secondary">{icon}</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">{title}</span>
            {titleExtra}
          </div>
          <div className="flex items-center gap-3">
            {actionsExtra}
            <button onClick={onClose} className="neu-sm rounded-lg p-1.5 text-secondary hover:text-primary">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className={`px-6 py-5 overflow-y-auto ${bodyClassName ?? ""}`}
          style={{ maxHeight: `${maxHeightVh}vh` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
