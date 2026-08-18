import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";

interface Props {
  isOpen: boolean;
  book: string;
  chapter: number;
  verse: number;
  onClose: () => void;
}

export default function CommentarySheet({ isOpen, book, chapter, verse, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      rafRef.current = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setText(null);
    api.getCommentary("MHC", book, chapter, verse)
      .then((t) => setText(t || null))
      .catch(() => setText(null))
      .finally(() => setLoading(false));
  }, [isOpen, book, chapter, verse]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className={`absolute bottom-0 left-0 right-0 bg-surface border-t border-outline-variant rounded-t-2xl shadow-xl transition-all duration-300 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-secondary">library_books</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">
              Commentary — {book} {chapter}:{verse}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-metadata-mono text-metadata-mono text-secondary text-[11px]">Matthew Henry</span>
            <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[55vh] overflow-y-auto">
          {loading && (
            <p className="text-secondary font-body-ui text-body-ui">Loading…</p>
          )}
          {!loading && text && (
            <div className="border-l-4 border-tertiary-container pl-4 py-1">
              <p className="font-body-ui text-[14px] leading-relaxed text-on-surface">{text}</p>
            </div>
          )}
          {!loading && !text && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant">library_books</span>
              <p className="font-body-ui text-[13px] text-on-surface-variant">No commentary for this verse.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
