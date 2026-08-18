import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type Note } from "../lib/tauri";

interface Props {
  isOpen: boolean;
  book: string;
  chapter: number;
  verse: number;
  onClose: () => void;
}

export default function NotesSheet({ isOpen, book, chapter, verse, onClose }: Props) {
  const { primaryModule } = useAppStore();
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      rafRef.current = requestAnimationFrame(() => {
        setVisible(true);
        setTimeout(() => textareaRef.current?.focus(), 100);
      });
    } else {
      setVisible(false);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setDraft("");
    api.listNotes().then((all) => {
      setNotes(all.filter((n) => n.book === book && n.chapter === chapter && n.verse === verse));
    });
  }, [isOpen, book, chapter, verse]);

  async function save() {
    if (!draft.trim() || !primaryModule) return;
    setSaving(true);
    const note = await api.addNote(book, chapter, verse, primaryModule, draft.trim());
    setNotes((prev) => [note, ...prev]);
    setDraft("");
    setSaving(false);
  }

  async function deleteNote(id: number) {
    await api.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

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
            <span className="material-symbols-outlined text-[18px] text-secondary">edit_note</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">
              Notes — {book} {chapter}:{verse}
            </span>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto space-y-4">
          {/* New note input */}
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              className="w-full h-24 p-3 text-[14px] font-body-ui bg-surface-container-low border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary resize-none text-on-surface placeholder:text-on-surface-variant"
              placeholder={`Add a note on ${book} ${chapter}:${verse}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
              }}
            />
            <button
              onClick={save}
              disabled={!draft.trim() || saving}
              className="px-4 py-1.5 bg-primary text-on-primary font-body-ui text-[13px] font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save note"}
            </button>
          </div>

          {/* Existing notes */}
          {notes.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-outline-variant">
              {notes.map((n) => (
                <div key={n.id} className="flex gap-3 group">
                  <div className="flex-1 border border-outline-variant rounded-DEFAULT p-3 bg-surface-container-low">
                    <p className="font-body-ui text-[13px] text-on-surface leading-relaxed">{n.content}</p>
                    <p className="font-metadata-mono text-[10px] text-secondary mt-1.5">
                      {new Date(n.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-error hover:text-error transition-opacity self-start mt-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {notes.length === 0 && !draft && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <span className="material-symbols-outlined text-[36px] text-on-surface-variant mb-1">edit_note</span>
              <p className="font-body-ui text-[12px] text-on-surface-variant">No notes for this verse yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
