import { useEffect, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type Bookmark, type Note } from "../lib/tauri";
import SideNav from "../components/SideNav";

export default function BookmarksNotes() {
  const { view, setCurrentRef, setView } = useAppStore();
  const [tab, setTab] = useState<"bookmarks" | "notes">("bookmarks");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listBookmarks(), api.listNotes()]).then(([b, n]) => {
      setBookmarks(b);
      setNotes(n);
      setLoading(false);
    });
  }, []);

  function goTo(book: string, chapter: number, verse: number) {
    setCurrentRef({ book, chapter, verse });
    setView("reading");
  }

  async function removeBookmark(id: number) {
    await api.removeBookmark(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }

  async function deleteNote(id: number) {
    await api.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />

      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        <div className="p-6 border-b border-outline-variant bg-surface shrink-0">
          <h1 className="font-display-lg text-display-lg text-on-surface mb-4">
            {view === "bookmarks" ? "Bookmarks" : "Notes"}
          </h1>
          <div className="flex gap-2">
            {(["bookmarks", "notes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-DEFAULT font-body-ui text-body-ui capitalize transition-colors ${
                  tab === t
                    ? "bg-primary text-on-primary"
                    : "text-secondary hover:bg-surface-container-low"
                }`}
              >
                {t === "bookmarks" ? `Bookmarks (${bookmarks.length})` : `Notes (${notes.length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
          {loading && <p className="font-body-ui text-body-ui text-on-surface-variant">Loading…</p>}

          {!loading && tab === "bookmarks" && (
            bookmarks.length === 0 ? (
              <EmptyState
                icon="bookmark"
                message="Bookmarks are saved here. Select any verse and tap the bookmark icon to save it."
                cta="Open Bible"
                onCta={() => setView("reading")}
              />
            ) : (
              <div className="space-y-3">
                {bookmarks.map((b) => (
                  <div
                    key={b.id}
                    className="border border-outline-variant rounded-DEFAULT bg-surface p-4 flex items-start gap-3 hover:border-primary transition-colors group"
                  >
                    <div className="flex-1 cursor-pointer" onClick={() => goTo(b.book, b.chapter, b.verse)}>
                      <span className="font-metadata-mono text-metadata-mono text-secondary font-bold block mb-1">
                        {b.book} {b.chapter}:{b.verse}
                      </span>
                      <span className="font-metadata-mono text-[10px] text-on-surface-variant">{b.module_id}</span>
                    </div>
                    <button
                      onClick={() => removeBookmark(b.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-secondary hover:text-error transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {!loading && tab === "notes" && (
            notes.length === 0 ? (
              <EmptyState
                icon="edit_note"
                message="Your study notes appear here. Open a verse and write a note from the study panel."
                cta="Open Bible"
                onCta={() => setView("reading")}
              />
            ) : (
              <div className="space-y-3">
                {notes.map((n) => (
                  <div key={n.id} className="border border-outline-variant rounded-DEFAULT bg-surface p-4 group">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-metadata-mono text-metadata-mono text-secondary font-bold">
                        {n.book} {n.chapter}{n.verse != null ? `:${n.verse}` : ""}
                      </span>
                      <button
                        onClick={() => deleteNote(n.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-secondary hover:text-error transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                    <p className="font-body-ui text-[13px] text-on-surface leading-relaxed">{n.content}</p>
                    <p className="font-metadata-mono text-[10px] text-on-surface-variant mt-2">{n.updated_at}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState({ icon, message, cta, onCta }: { icon: string; message: string; cta: string; onCta: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="material-symbols-outlined text-[64px] text-on-surface-variant mb-4">{icon}</span>
      <p className="font-body-ui text-body-ui text-on-surface-variant max-w-xs mb-6">{message}</p>
      <button
        onClick={onCta}
        className="px-6 py-2 bg-primary text-on-primary font-body-ui text-body-ui rounded-DEFAULT hover:bg-primary-container transition-colors"
      >
        {cta}
      </button>
    </div>
  );
}
