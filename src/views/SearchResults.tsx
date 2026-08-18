import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type SearchResult } from "../lib/tauri";
import { sanitizeSnippet } from "../lib/sanitize";
import SideNav from "../components/SideNav";

export default function SearchResults() {
  const {
    searchQuery, setSearchQuery, primaryModule, setCurrentRef, setView,
    addToSearchHistory, setCurrentSearchResults, setSearchResultIndex, setLastHistoryRef,
  } = useAppStore();

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const savedQuery = useRef("");

  useEffect(() => {
    setRan(false);
    setResults([]);
    if (!searchQuery.trim() || !primaryModule) return;

    const timer = setTimeout(() => {
      setLoading(true);
      api
        .search(searchQuery, { modules: [primaryModule] })
        .then((r) => {
          setResults(r);
          setCurrentSearchResults(r);
          setSearchResultIndex(-1);
          setRan(true);
          // Only add to history when search actually ran
          if (searchQuery.trim() !== savedQuery.current) {
            savedQuery.current = searchQuery.trim();
            addToSearchHistory(searchQuery.trim());
          }
        })
        .catch(() => setRan(true))
        .finally(() => setLoading(false));
    }, 120);

    return () => clearTimeout(timer);
  }, [searchQuery, primaryModule]);

  function navigateTo(r: SearchResult, index: number) {
    const ref = { book: r.book, chapter: r.chapter, verse: r.verse };
    setCurrentRef(ref);
    setSearchResultIndex(index);
    setLastHistoryRef(ref);
    setView("reading");
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />

      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        <div className="p-6 border-b border-outline-variant bg-surface shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-display-lg text-display-lg text-on-surface">Search</h1>
            <button
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-secondary hover:bg-surface-container-low text-[12px] font-body-ui transition-colors border border-outline-variant"
              onClick={() => setView("history")}
              title="Search history (Alt+H)"
            >
              <span className="material-symbols-outlined text-[14px]">history</span>
              History
            </button>
          </div>
          <div className="relative max-w-xl">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input
              autoFocus
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-ui text-body-ui text-on-surface placeholder:text-on-surface-variant"
              placeholder="Search the Bible…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {ran && (
            <p className="font-metadata-mono text-metadata-mono text-secondary mt-2">
              {results.length} result{results.length !== 1 ? "s" : ""} for "{searchQuery}"
              {results.length > 0 && (
                <span className="ml-2 text-on-surface-variant/70">
                  — use Alt+P / Alt+N to navigate results from the reading view
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
          {loading && <p className="font-body-ui text-body-ui text-on-surface-variant">Searching…</p>}

          {!loading && ran && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-[56px] text-on-surface-variant mb-3">search_off</span>
              <p className="font-body-ui text-body-ui text-on-surface-variant">
                No results found for "{searchQuery}".
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-2">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => navigateTo(r, i)}
                  className="w-full text-left border border-outline-variant rounded-DEFAULT p-4 bg-surface hover:border-primary hover:bg-surface-container-low transition-colors"
                >
                  <span className="font-metadata-mono text-metadata-mono text-secondary font-bold block mb-1">
                    {r.book} {r.chapter}:{r.verse}
                  </span>
                  <p
                    className="font-body-reading text-[15px] text-on-surface leading-relaxed [&_mark]:bg-secondary-container [&_mark]:text-on-secondary-container [&_mark]:rounded-sm [&_mark]:px-0.5"
                    dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.text) }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
