import { useEffect, useState } from "react";
import { api } from "../lib/tauri";
import SheetShell from "./SheetShell";

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

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setText(null);
    api.getCommentary("MHC", book, chapter, verse)
      .then((t) => setText(t || null))
      .catch(() => setText(null))
      .finally(() => setLoading(false));
  }, [isOpen, book, chapter, verse]);

  return (
    <SheetShell
      isOpen={isOpen}
      onClose={onClose}
      icon="library_books"
      title={`Commentary — ${book} ${chapter}:${verse}`}
      actionsExtra={
        <span className="font-metadata-mono text-metadata-mono text-secondary text-[11px]">Matthew Henry</span>
      }
      maxHeightVh={55}
    >
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
    </SheetShell>
  );
}
