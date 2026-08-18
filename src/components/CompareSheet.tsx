import { useEffect, useRef, useState } from "react";
import { api, type InstalledModule, type VerseText } from "../lib/tauri";

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
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
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

      rafRef.current = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isOpen, book, chapter, verse]);

  if (!isOpen) return null;

  const shown = results.filter((r) => r.text);

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className={`absolute bottom-0 left-0 right-0 bg-surface border-t border-outline-variant rounded-t-2xl shadow-xl transition-all duration-300 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-secondary">compare</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">
              Compare — {book} {chapter}:{verse}
            </span>
            {!loading && shown.length > 0 && (
              <span className="text-secondary font-metadata-mono text-[11px] ml-1">
                {shown.length} translation{shown.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-5">
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
        </div>
      </div>
    </div>
  );
}
