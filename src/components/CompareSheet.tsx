import { useEffect, useState } from "react";
import { api, type InstalledModule, type VerseText } from "../lib/tauri";
import SheetShell from "./SheetShell";

interface Props {
  isOpen: boolean;
  book: string;
  chapter: number;
  verse: number;
  fontSize: number;
  onClose: () => void;
}

interface TranslationResult {
  module: InstalledModule;
  text: string | null;
  error?: string;
}

export default function CompareSheet({ isOpen, book, chapter, verse, fontSize, onClose }: Props) {
  const [results, setResults] = useState<TranslationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

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
          setResults(r ?? []);
          setLoading(false);
        });
      })
      .catch(() => setLoading(false));
  }, [isOpen, book, chapter, verse]);

  function toggleModule(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const available = results.filter((r) => r.text);
  const shown = available.filter((r) => !hidden.has(r.module.id));

  return (
    <SheetShell
      isOpen={isOpen}
      onClose={onClose}
      icon="compare"
      title={`Compare — ${book} ${chapter}:${verse}`}
      titleExtra={
        !loading && available.length > 0 ? (
          <span className="text-secondary font-metadata-mono text-[11px] ml-1">
            {shown.length}/{available.length}
          </span>
        ) : undefined
      }
      maxHeightVh={65}
      bodyClassName="space-y-5"
    >
      {loading && (
        <p className="text-secondary font-body-ui text-body-ui">Loading translations…</p>
      )}

      {!loading && available.length === 0 && (
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant mb-2 block">library_books</span>
          <p className="text-on-surface-variant font-body-ui text-body-ui">
            No Bible translations installed.
          </p>
        </div>
      )}

      {/* Translation toggle chips */}
      {!loading && available.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pb-1 border-b border-outline-variant">
          {available.map(({ module }) => {
            const active = !hidden.has(module.id);
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => toggleModule(module.id)}
                className={`inline-flex items-center px-2 py-0.5 rounded-full font-metadata-mono text-[11px] font-semibold uppercase tracking-wide transition-colors border ${
                  active
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-surface-container border-outline-variant text-on-surface-variant/50"
                }`}
              >
                {module.id}
              </button>
            );
          })}
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
          <p
            className="font-body-reading text-on-surface pl-1 border-l-2 border-outline-variant"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.55 }}
          >
            {text}
          </p>
        </div>
      ))}

      {!loading && available.length > 0 && shown.length === 0 && (
        <p className="text-center text-on-surface-variant font-body-ui text-body-ui py-4">
          All translations hidden — tap a chip above to show one.
        </p>
      )}
    </SheetShell>
  );
}
