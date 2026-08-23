import { useEffect, useState } from "react";
import { api, type InstalledModule, type VerseText } from "../lib/tauri";
import SheetShell from "./SheetShell";

interface Props {
  isOpen: boolean;
  book: string;
  chapter: number;
  verse: number;
  onClose: () => void;
}

interface TranslationResult {
  module: InstalledModule;
  text: string | null;
  error?: string;
}

export default function CompareSheet({ isOpen, book, chapter, verse, onClose }: Props) {
  const [results, setResults] = useState<TranslationResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setResults([]);

    api.listInstalledModules()
      .then((modules) => {
        const bibleModules = modules.filter((m) => m.category === "Bible");
        if (bibleModules.length === 0) {
          setResults([]);
          setLoading(false);
          return;
        }
        return Promise.all(
          bibleModules.map((m) =>
            api.getVerse(m.id, book, chapter, verse)
              .then((v: VerseText) => ({
                module: m,
                text: v.spans.map((s) => s.text).join("").trim() || null,
              }))
              .catch(() => ({ module: m, text: null, error: "unavailable" }))
          )
        ).then((r) => {
          setResults(r);
          setLoading(false);
        });
      })
      .catch(() => setLoading(false));
  }, [isOpen, book, chapter, verse]);

  const shown = results.filter((r) => r.text);

  return (
    <SheetShell
      isOpen={isOpen}
      onClose={onClose}
      icon="compare"
      title={`Compare — ${book} ${chapter}:${verse}`}
      titleExtra={
        !loading && shown.length > 0 ? (
          <span className="text-secondary font-metadata-mono text-[11px] ml-1">
            {shown.length} translation{shown.length !== 1 ? "s" : ""}
          </span>
        ) : undefined
      }
      maxHeightVh={65}
      bodyClassName="space-y-5"
    >
      {loading && (
        <p className="text-secondary font-body-ui text-body-ui">Loading translations…</p>
      )}

      {!loading && shown.length === 0 && (
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant mb-2 block">library_books</span>
          <p className="text-on-surface-variant font-body-ui text-body-ui">
            No Bible translations installed.
          </p>
        </div>
      )}

      {shown.map(({ module, text }) => (
        <div key={module.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-metadata-mono text-[11px] text-primary font-semibold uppercase tracking-wide">
              {module.id}
            </span>
            {module.name && module.name !== module.id && (
              <span className="text-on-surface-variant font-body-ui text-[12px] truncate">
                {module.name}
              </span>
            )}
          </div>
          <p className="font-body-reading text-[15px] leading-relaxed text-on-surface pl-1 border-l-2 border-outline-variant">
            {text}
          </p>
        </div>
      ))}
    </SheetShell>
  );
}
