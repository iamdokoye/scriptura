import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type SearchResult } from "../lib/tauri";
import { sanitizeSnippet } from "../lib/sanitize";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function FullscreenSearchPalette({ isOpen, onClose }: Props) {
  const { primaryModule, setCurrentRef, setCurrentSearchResults, setSearchResultIndex, setLastHistoryRef, addToSearchHistory } = useAppStore();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const savedQuery = useRef("");

  // Animate in
  useEffect(() => {
    if (isOpen) {
      rafRef.current = requestAnimationFrame(() => {
        setVisible(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      });
    } else {
      setVisible(false);
      setQuery("");
      setResults([]);
      setActiveIdx(0);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen || !query.trim() || !primaryModule) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(query, { modules: [primaryModule], page_size: 30 })
        .then((r) => {
          setResults(r);
          setActiveIdx(0);
          if (query.trim() !== savedQuery.current) {
            savedQuery.current = query.trim();
            addToSearchHistory(query.trim());
          }
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [query, primaryModule, isOpen]);

  // Keep active item scrolled into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function navigate(r: SearchResult, idx: number) {
    const ref = { book: r.book, chapter: r.chapter, verse: r.verse };
    setCurrentRef(ref);
    setCurrentSearchResults(results);
    setSearchResultIndex(idx);
    setLastHistoryRef(ref);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      navigate(results[activeIdx], activeIdx);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`} />

      {/* Palette */}
      <div
        className={`relative w-full max-w-2xl mx-4 bg-surface rounded-2xl shadow-2xl border border-outline-variant flex flex-col overflow-hidden transition-all duration-200 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"
        }`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-outline-variant">
          <span className="material-symbols-outlined text-[20px] text-secondary shrink-0">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words or phrases…"
            className="flex-1 bg-transparent font-body-ui text-body-ui text-on-surface placeholder:text-on-surface-variant outline-none"
          />
          {loading && (
            <span className="material-symbols-outlined text-[18px] text-secondary animate-spin shrink-0">progress_activity</span>
          )}
          <kbd className="text-[10px] font-metadata-mono text-on-surface-variant border border-outline-variant rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: "55vh" }}>
          {results.length === 0 && query.trim() && !loading && (
            <p className="text-center text-on-surface-variant font-body-ui text-[13px] py-10">
              No results for "{query}"
            </p>
          )}

          {results.length === 0 && !query.trim() && (
            <p className="text-center text-on-surface-variant font-body-ui text-[13px] py-10">
              Type to search across {primaryModule ?? "the loaded module"}
            </p>
          )}

          {results.map((r, idx) => {
            const active = idx === activeIdx;
            return (
              <button
                key={`${r.book}-${r.chapter}-${r.verse}-${idx}`}
                data-idx={idx}
                onClick={() => navigate(r, idx)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors border-b border-outline-variant/50 last:border-0 ${
                  active ? "bg-secondary-container" : "hover:bg-surface-container-low"
                }`}
              >
                <span className="font-metadata-mono text-[11px] text-primary font-semibold shrink-0 mt-0.5 w-24">
                  {r.book} {r.chapter}:{r.verse}
                </span>
                <span
                  className="font-body-ui text-[13px] text-on-surface leading-relaxed [&_mark]:bg-secondary/30 [&_mark]:text-on-surface [&_mark]:rounded-sm"
                  dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.text) }}
                />
              </button>
            );
          })}
        </div>

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-outline-variant flex items-center justify-between">
            <span className="font-metadata-mono text-[11px] text-on-surface-variant">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
            <span className="font-metadata-mono text-[11px] text-on-surface-variant">
              ↑↓ navigate · Enter select
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

