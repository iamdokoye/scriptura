import { useState } from "react";
import { useAppStore } from "../store/app";
import SideNav from "../components/SideNav";

type Filter = "today" | "month" | "all";

function isSameDay(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isSameMonth(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatTime(ts: number) {
  const d = new Date(ts);
  if (isSameDay(ts)) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function SearchHistory() {
  const {
    searchHistory, clearSearchHistory,
    setSearchQuery, setView, addToSearchHistory,
  } = useAppStore();

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const filtered = searchHistory.filter((e) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "today" && isSameDay(e.timestamp)) ||
      (filter === "month" && isSameMonth(e.timestamp));
    const matchesSearch = !search.trim() || e.query.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  function selectQuery(q: string) {
    setSearchQuery(q);
    addToSearchHistory(q);
    setView("search");
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />

      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant bg-surface shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display-lg text-display-lg text-on-surface">Search History</h1>
            {searchHistory.length > 0 && (
              <button
                className="px-3 py-1.5 text-[13px] font-body-ui text-error hover:bg-error/10 rounded-DEFAULT transition-colors border border-error/30"
                onClick={clearSearchHistory}
              >
                Clear all
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-4">
            {(["today", "month", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-[13px] font-body-ui capitalize transition-colors ${
                  filter === f
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {f === "today" ? "Today" : f === "month" ? "This Month" : "All"}
              </button>
            ))}
          </div>

          {/* Search filter */}
          <div className="relative max-w-xl">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
              search
            </span>
            <input
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-ui text-body-ui text-on-surface placeholder:text-on-surface-variant"
              placeholder="Filter history…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="material-symbols-outlined text-[56px] text-on-surface-variant mb-3">history</span>
              <p className="font-body-ui text-body-ui text-on-surface-variant">
                {searchHistory.length === 0
                  ? "No search history yet. Search for words in the Bible to build your history."
                  : "No results match your filter."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => selectQuery(entry.query)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 rounded-DEFAULT hover:bg-surface-container-low transition-colors text-left border border-transparent hover:border-outline-variant group"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0 mt-0.5">
                      history
                    </span>
                    <div className="min-w-0">
                      <span className="font-body-ui text-[15px] text-on-surface truncate block">
                        {entry.query}
                      </span>
                      {entry.selectedRef && (
                        <span className="font-metadata-mono text-[12px] text-primary mt-0.5 block">
                          {entry.selectedRef.book} {entry.selectedRef.chapter}:{entry.selectedRef.verse}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-metadata-mono text-[12px] text-on-surface-variant">
                      {formatTime(entry.timestamp)}
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                      arrow_forward
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
