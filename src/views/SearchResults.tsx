import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type SearchResult, type InstalledModule } from "../lib/tauri";
import { sanitizeSnippet } from "../lib/sanitize";
import SideNav from "../components/SideNav";

// ── Bible book lists ──────────────────────────────────────────────────────────
const OT_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
];
const NT_BOOKS = [
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
];

const PAGE_SIZE = 50;

type Testament = "all" | "OT" | "NT";

export default function SearchResults() {
  const {
    searchQuery, setSearchQuery, primaryModule,
    setCurrentRef, setView, addToSearchHistory,
    setCurrentSearchResults, setSearchResultIndex, setLastHistoryRef,
  } = useAppStore();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [testament, setTestament] = useState<Testament>("all");
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [bibleModules, setBibleModules] = useState<InstalledModule[]>([]);
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());

  // ── Result state ──────────────────────────────────────────────────────────
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ran, setRan] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const savedQuery = useRef("");

  // ── Load installed Bible modules ──────────────────────────────────────────
  useEffect(() => {
    api.listInstalledModules().then((mods) => {
      const bibles = mods.filter((m) => m.category === "Bible");
      setBibleModules(bibles);
      if (primaryModule) setActiveModules(new Set([primaryModule]));
      else if (bibles.length > 0) setActiveModules(new Set([bibles[0].id]));
    }).catch(() => {});
  }, [primaryModule]);

  // ── Derive book filter from testament + selected books ────────────────────
  function effectiveBookFilter(): string[] | undefined {
    // If specific books are checked, use those regardless of testament
    if (selectedBooks.size > 0) return [...selectedBooks];
    // If a testament is selected, pass the full book list for that testament
    if (testament === "OT") return OT_BOOKS;
    if (testament === "NT") return NT_BOOKS;
    return undefined;
  }

  // ── Books visible in the filter panel ────────────────────────────────────
  const visibleBooks = testament === "OT" ? OT_BOOKS : testament === "NT" ? NT_BOOKS : [];

  // ── Run search ────────────────────────────────────────────────────────────
  useEffect(() => {
    setRan(false);
    setResults([]);
    setPage(0);
    setHasMore(false);
    if (!searchQuery.trim() || activeModules.size === 0) return;

    const timer = setTimeout(() => runSearch(0, false), 200);
    return () => clearTimeout(timer);
  }, [searchQuery, testament, selectedBooks, activeModules]);

  async function runSearch(targetPage: number, append: boolean) {
    if (activeModules.size === 0) return;
    append ? setLoadingMore(true) : setLoading(true);

    try {
      const r = await api.search(searchQuery, {
        modules: [...activeModules],
        testament: testament === "all" ? undefined : testament,
        book_filter: effectiveBookFilter(),
        page: targetPage,
        page_size: PAGE_SIZE,
      });

      setResults((prev) => append ? [...prev, ...r] : r);
      setCurrentSearchResults(append ? [...results, ...r] : r);
      setSearchResultIndex(-1);
      setHasMore(r.length === PAGE_SIZE);
      setPage(targetPage);
      setRan(true);

      if (!append && searchQuery.trim() !== savedQuery.current) {
        savedQuery.current = searchQuery.trim();
        addToSearchHistory(searchQuery.trim());
      }
    } catch {
      setRan(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function navigateTo(r: SearchResult, index: number) {
    const ref = { book: r.book, chapter: r.chapter, verse: r.verse };
    setCurrentRef(ref);
    setSearchResultIndex(index);
    setLastHistoryRef(ref);
    setView("reading");
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function toggleBook(book: string) {
    setSelectedBooks((prev) => {
      const next = new Set(prev);
      next.has(book) ? next.delete(book) : next.add(book);
      return next;
    });
  }

  function toggleTestament(t: Testament) {
    setTestament(t);
    setSelectedBooks(new Set()); // clear book-level selection when testament changes
  }

  function toggleModule(id: string) {
    setActiveModules((prev) => {
      const next = new Set(prev);
      if (next.has(id) && next.size === 1) return prev; // keep at least one
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Group results by book (merge non-consecutive matches from same book) ──
  const grouped = results.reduce<{ book: string; items: { result: SearchResult; index: number }[] }[]>(
    (acc, r, i) => {
      const existing = acc.find((g) => g.book === r.book);
      if (existing) {
        existing.items.push({ result: r, index: i });
      } else {
        acc.push({ book: r.book, items: [{ result: r, index: i }] });
      }
      return acc;
    },
    []
  );

  const activeFilterCount =
    (testament !== "all" ? 1 : 0) +
    (selectedBooks.size > 0 ? 1 : 0) +
    (activeModules.size > 1 ? 1 : 0);

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Filter sidebar ─────────────────────────────────────────────── */}
        <aside className="w-[220px] shrink-0 border-r border-outline-variant bg-surface-container-lowest flex flex-col overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Testament */}
            <section>
              <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">
                Testament
              </p>
              <div className="flex flex-col gap-1">
                {(["all", "OT", "NT"] as Testament[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTestament(t)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-DEFAULT text-left text-[13px] font-body-ui transition-colors ${
                      testament === t
                        ? "bg-primary text-on-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {t === "all" ? "All" : t === "OT" ? "Old Testament" : "New Testament"}
                  </button>
                ))}
              </div>
            </section>

            {/* Books — only when a testament is selected */}
            {visibleBooks.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Books
                  </p>
                  {selectedBooks.size > 0 && (
                    <button
                      onClick={() => setSelectedBooks(new Set())}
                      className="font-metadata-mono text-[10px] text-secondary hover:text-on-surface-variant transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {visibleBooks.map((book) => (
                    <label key={book} className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-surface-container-high group">
                      <input
                        type="checkbox"
                        checked={selectedBooks.has(book)}
                        onChange={() => toggleBook(book)}
                        className="accent-primary w-3 h-3 shrink-0"
                      />
                      <span className={`font-body-ui text-[12px] truncate ${selectedBooks.has(book) ? "text-on-surface font-medium" : "text-on-surface-variant"}`}>
                        {book}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {/* Modules — only when multiple Bibles installed */}
            {bibleModules.length > 1 && (
              <section>
                <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">
                  Modules
                </p>
                <div className="space-y-0.5">
                  {bibleModules.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-surface-container-high">
                      <input
                        type="checkbox"
                        checked={activeModules.has(m.id)}
                        onChange={() => toggleModule(m.id)}
                        className="accent-primary w-3 h-3 shrink-0"
                      />
                      <span className={`font-body-ui text-[12px] truncate ${activeModules.has(m.id) ? "text-on-surface font-medium" : "text-on-surface-variant"}`}>
                        {m.id}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>

        {/* ── Main results area ───────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* Search bar */}
          <div className="px-6 py-4 border-b border-outline-variant bg-surface shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="relative flex-1 max-w-2xl">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                <input
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-ui text-body-ui text-on-surface placeholder:text-on-surface-variant transition-colors"
                  placeholder="Search the Bible…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {loading && (
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant animate-spin text-[18px]">
                    progress_activity
                  </span>
                )}
              </div>
              <button
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-DEFAULT text-secondary hover:bg-surface-container-low text-[12px] font-body-ui transition-colors border border-outline-variant shrink-0"
                onClick={() => setView("history")}
                title="Search history (Alt+H)"
              >
                <span className="material-symbols-outlined text-[16px]">history</span>
                History
              </button>
            </div>

            {/* Result summary */}
            {ran && !loading && (
              <p className="font-metadata-mono text-[11px] text-secondary mt-1 flex items-center gap-2 flex-wrap">
                <span>
                  {results.length}{hasMore ? "+" : ""} result{results.length !== 1 ? "s" : ""}
                  {searchQuery ? ` for "${searchQuery}"` : ""}
                </span>
                {activeFilterCount > 0 && (
                  <span className="text-on-surface-variant">
                    · {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active
                  </span>
                )}
                {results.length > 0 && (
                  <span className="text-on-surface-variant/60">
                    · Alt+P / Alt+N to navigate from reading view
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto">
            {!loading && ran && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <span className="material-symbols-outlined text-[56px] text-on-surface-variant mb-3 opacity-30">search_off</span>
                <p className="font-body-ui text-[15px] text-on-surface font-medium">No results found</p>
                <p className="font-body-ui text-[13px] text-on-surface-variant mt-1">
                  Try different keywords{activeFilterCount > 0 ? " or clear some filters" : ""}.
                </p>
              </div>
            )}

            {!loading && !ran && !searchQuery && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <span className="material-symbols-outlined text-[56px] text-on-surface-variant mb-3 opacity-20">manage_search</span>
                <p className="font-body-ui text-[15px] text-on-surface font-medium">Search the Bible</p>
                <p className="font-body-ui text-[13px] text-on-surface-variant mt-1 max-w-xs leading-relaxed">
                  Type a word or phrase above. Use the filters on the left to narrow by testament or book.
                </p>
              </div>
            )}

            {results.length > 0 && (
              <div className="p-6 space-y-6 max-w-3xl">
                {grouped.map(({ book, items }) => (
                  <section key={book}>
                    {/* Book header */}
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="font-metadata-mono text-[11px] font-bold text-secondary uppercase tracking-wide">
                        {book}
                      </h2>
                      <span className="font-metadata-mono text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded-full">
                        {items.length}
                      </span>
                      <div className="flex-1 h-px bg-outline-variant" />
                    </div>

                    {/* Verse results */}
                    <div className="space-y-1.5">
                      {items.map(({ result: r, index: i }) => (
                        <button
                          key={i}
                          onClick={() => navigateTo(r, i)}
                          className="w-full text-left border border-outline-variant rounded-DEFAULT px-4 py-3 bg-surface hover:border-primary hover:bg-surface-container-low transition-colors group"
                        >
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-metadata-mono text-[11px] text-primary font-bold">
                              {r.chapter}:{r.verse}
                            </span>
                            {activeModules.size > 1 && (
                              <span className="font-metadata-mono text-[10px] text-on-surface-variant">{r.module_id}</span>
                            )}
                            <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="material-symbols-outlined text-[14px] text-secondary">arrow_forward</span>
                            </span>
                          </div>
                          <p
                            className="font-body-reading text-[14px] text-on-surface leading-relaxed [&_mark]:bg-secondary-container [&_mark]:text-on-secondary-container [&_mark]:rounded-sm [&_mark]:px-0.5"
                            dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.text) }}
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}

                {/* Load more */}
                {hasMore && (
                  <div className="pt-2 pb-8 text-center">
                    <button
                      onClick={() => runSearch(page + 1, true)}
                      disabled={loadingMore}
                      className="px-6 py-2.5 rounded-DEFAULT border border-outline-variant bg-surface hover:bg-surface-container font-body-ui text-[13px] text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? "Loading…" : `Load more results`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
