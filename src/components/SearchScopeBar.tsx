import { useRef, useState, useEffect } from "react";
import { useAppStore } from "../store/app";
import { BOOK_GROUPS, OT_BOOKS, NT_BOOKS } from "../lib/books";
import type { SearchTestament } from "../store/slices/searchSlice";

interface Props {
  compact?: boolean; // palette mode: tighter spacing
}

export default function SearchScopeBar({ compact }: Props) {
  const { searchTestament, setSearchTestament, searchBooks, setSearchBooks } = useAppStore();

  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const customActive = searchBooks.length > 0;

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handler(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  function handleTestamentClick(t: SearchTestament) {
    setSearchTestament(t); // also clears searchBooks
    setPopoverOpen(false);
  }

  function toggleBook(book: string) {
    const next = searchBooks.includes(book)
      ? searchBooks.filter((b) => b !== book)
      : [...searchBooks, book];
    setSearchBooks(next);
  }

  function toggleGroup(books: string[]) {
    const allSelected = books.every((b) => searchBooks.includes(b));
    if (allSelected) {
      setSearchBooks(searchBooks.filter((b) => !books.includes(b)));
    } else {
      const merged = Array.from(new Set([...searchBooks, ...books]));
      setSearchBooks(merged);
    }
  }

  function clearCustom() {
    setSearchBooks([]);
  }

  const pillBase = compact
    ? "px-2.5 py-0.5 rounded-full font-body-ui text-[11px] font-medium transition-colors"
    : "px-3 py-1 rounded-full font-body-ui text-[12px] font-medium transition-colors";

  const pillActive = "bg-primary text-on-primary";
  const pillInactive = "text-on-surface-variant hover:bg-surface-container-high";

  const otGroups = BOOK_GROUPS.filter((g) => g.testament === "OT");
  const ntGroups = BOOK_GROUPS.filter((g) => g.testament === "NT");

  return (
    <div className={`relative flex items-center gap-1 ${compact ? "" : "flex-wrap"}`}>
      {/* Testament quick-filter pills */}
      {(["all", "OT", "NT"] as const).map((t) => (
        <button
          key={t}
          onClick={() => handleTestamentClick(t)}
          className={`${pillBase} ${!customActive && searchTestament === t ? pillActive : pillInactive}`}
        >
          {t === "all" ? "All" : t === "OT" ? "Old Testament" : "New Testament"}
        </button>
      ))}

      <span className={`text-outline-variant ${compact ? "text-[10px]" : "text-[12px]"}`}>|</span>

      {/* Custom book picker toggle */}
      {customActive ? (
        <button
          className={`${pillBase} bg-secondary-container text-on-secondary-container flex items-center gap-1`}
          onClick={() => setPopoverOpen((o) => !o)}
          ref={buttonRef}
        >
          {searchBooks.length} book{searchBooks.length !== 1 ? "s" : ""}
          <span
            className="material-symbols-outlined text-[13px] leading-none"
            onClick={(e) => { e.stopPropagation(); clearCustom(); }}
            role="button"
            aria-label="Clear book selection"
          >
            close
          </span>
        </button>
      ) : (
        <button
          ref={buttonRef}
          onClick={() => setPopoverOpen((o) => !o)}
          className={`${pillBase} ${pillInactive} flex items-center gap-1`}
        >
          <span className="material-symbols-outlined text-[13px] leading-none">menu_book</span>
          {compact ? "Books" : "Pick books…"}
        </button>
      )}

      {/* Book picker popover */}
      {popoverOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full mt-2 left-0 z-50 w-[480px] max-h-[60vh] overflow-y-auto bg-surface border border-outline-variant rounded-xl shadow-2xl p-4 flex gap-6"
          style={{ minWidth: 320 }}
        >
          {/* OT column */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Old Testament</span>
              <div className="flex gap-2">
                <button
                  className="font-body-ui text-[11px] text-primary hover:underline"
                  onClick={() => setSearchBooks(Array.from(new Set([...searchBooks, ...OT_BOOKS])))}
                >All</button>
                <button
                  className="font-body-ui text-[11px] text-on-surface-variant hover:underline"
                  onClick={() => setSearchBooks(searchBooks.filter((b) => !OT_BOOKS.includes(b)))}
                >None</button>
              </div>
            </div>
            {otGroups.map((group) => {
              const allSel = group.books.every((b) => searchBooks.includes(b));
              const someSel = group.books.some((b) => searchBooks.includes(b));
              return (
                <div key={group.label} className="mb-3">
                  <button
                    className="flex items-center gap-1.5 mb-1 w-full text-left"
                    onClick={() => toggleGroup(group.books)}
                  >
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                      allSel ? "bg-primary border-primary" : someSel ? "bg-primary/40 border-primary" : "border-outline-variant"
                    }`}>
                      {(allSel || someSel) && <span className="material-symbols-outlined text-white text-[10px] leading-none">check</span>}
                    </span>
                    <span className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-wide">{group.label}</span>
                  </button>
                  <div className="pl-5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {group.books.map((book) => (
                      <label key={book} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-primary w-3 h-3"
                          checked={searchBooks.includes(book)}
                          onChange={() => toggleBook(book)}
                        />
                        <span className="font-body-ui text-[12px] text-on-surface">{book}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* NT column */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest">New Testament</span>
              <div className="flex gap-2">
                <button
                  className="font-body-ui text-[11px] text-primary hover:underline"
                  onClick={() => setSearchBooks(Array.from(new Set([...searchBooks, ...NT_BOOKS])))}
                >All</button>
                <button
                  className="font-body-ui text-[11px] text-on-surface-variant hover:underline"
                  onClick={() => setSearchBooks(searchBooks.filter((b) => !NT_BOOKS.includes(b)))}
                >None</button>
              </div>
            </div>
            {ntGroups.map((group) => {
              const allSel = group.books.every((b) => searchBooks.includes(b));
              const someSel = group.books.some((b) => searchBooks.includes(b));
              return (
                <div key={group.label} className="mb-3">
                  <button
                    className="flex items-center gap-1.5 mb-1 w-full text-left"
                    onClick={() => toggleGroup(group.books)}
                  >
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                      allSel ? "bg-primary border-primary" : someSel ? "bg-primary/40 border-primary" : "border-outline-variant"
                    }`}>
                      {(allSel || someSel) && <span className="material-symbols-outlined text-white text-[10px] leading-none">check</span>}
                    </span>
                    <span className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-wide">{group.label}</span>
                  </button>
                  <div className="pl-5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {group.books.map((book) => (
                      <label key={book} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-primary w-3 h-3"
                          checked={searchBooks.includes(book)}
                          onChange={() => toggleBook(book)}
                        />
                        <span className="font-body-ui text-[12px] text-on-surface">{book}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
