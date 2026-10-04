import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useAppStore, type VerseRef } from "../store/app";
import { api, type SearchResult } from "../lib/tauri";
import { sanitizeSnippet } from "../lib/sanitize";
import { BIBLE_BOOKS } from "../data/books";
import ScriptureNav from "./ScriptureNav";

export type SearchBarMode = "scripture" | "word" | "strongs";

export interface PresentationSearchBarHandle {
  /** Switch to `mode` (if given) and focus its input. */
  focus: (mode?: SearchBarMode) => void;
}

const MODES: { id: SearchBarMode; icon: string; label: string; placeholder: string }[] = [
  { id: "scripture", icon: "auto_stories", label: "Verse", placeholder: "Jump to… jn 3:16 or v5  (Ctrl+L)" },
  { id: "word", icon: "search", label: "Word search", placeholder: "Search the text for a word or phrase  (Ctrl+K)" },
  { id: "strongs", icon: "tag", label: "Strong's concordance", placeholder: "Strong's number… G25 or H430" },
];

const FIRST_NT_INDEX = BIBLE_BOOKS.indexOf("Matthew");

/** "g25", "H0430", or a bare "25" (Greek in the NT, Hebrew otherwise) → "G25" / "H430". */
function parseStrongs(raw: string, book: string): string | null {
  const m = /^([gh])?\s*0*(\d{1,5})$/i.exec(raw.trim());
  if (!m) return null;
  const prefix = m[1]?.toUpperCase() ?? (BIBLE_BOOKS.indexOf(book) >= FIRST_NT_INDEX ? "G" : "H");
  return `${prefix}${m[2]}`;
}

interface Props {
  baseRef: VerseRef;
  onNavigate: (ref: VerseRef) => void;
  /** Opens the Strong's concordance for a normalized number like "G25". */
  onStrongs: (number: string) => void;
}

/**
 * The Live Show console's reference bar: one button cycles between verse
 * navigation, word search and Strong's lookup, and the input beside it adapts
 * to the active mode.
 */
const PresentationSearchBar = forwardRef<PresentationSearchBarHandle, Props>(function PresentationSearchBar(
  { baseRef, onNavigate, onStrongs }, ref,
) {
  const { primaryModule } = useAppStore();
  const [mode, setMode] = useState<SearchBarMode>("scripture");
  const scriptureInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [settled, setSettled] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = MODES.find((m) => m.id === mode)!;
  const next = MODES[(MODES.findIndex((m) => m.id === mode) + 1) % MODES.length];

  function switchMode(m: SearchBarMode) {
    setMode(m);
    setQuery("");
    setResults([]);
    setOpen(false);
    setTimeout(() => (m === "scripture" ? scriptureInputRef : textInputRef).current?.focus(), 30);
  }

  useImperativeHandle(ref, () => ({
    focus: (m) => {
      if (m && m !== mode) switchMode(m);
      else (mode === "scripture" ? scriptureInputRef : textInputRef).current?.focus();
    },
  }));

  // Debounced word search against the current Bible module.
  useEffect(() => {
    if (mode !== "word") return;
    const q = query.trim();
    if (!q || !primaryModule) { setResults([]); setSettled(""); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.search(q, { modules: [primaryModule], page_size: 40 })
        .then((r) => { if (!cancelled) { setResults(r); setActive(0); } })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSettled(q); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, query, primaryModule]);

  function openResults() {
    setRect(textInputRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  }

  function pick(r: SearchResult) {
    onNavigate({ book: r.book, chapter: r.chapter, verse: r.verse });
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const strongsNumber = mode === "strongs" ? parseStrongs(query, baseRef.book) : null;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setQuery(""); setOpen(false); return; }
    if (mode === "word") {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
    } else if (mode === "strongs" && e.key === "Enter" && strongsNumber) {
      e.preventDefault();
      onStrongs(strongsNumber);
      setQuery("");
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        onClick={() => switchMode(next.id)}
        className="ctl rounded-lg px-2 py-1 flex items-center gap-1.5 text-primary shrink-0"
        title={`${current.label} — click for ${next.label}`}
        aria-label={`Search mode: ${current.label}. Switch to ${next.label}`}
      >
        <span className="material-symbols-outlined text-[18px]">{current.icon}</span>
        <span className="font-metadata-mono text-[10px] uppercase tracking-widest hidden xl:inline">{current.label}</span>
      </button>

      {mode === "scripture" ? (
        <ScriptureNav
          inputRef={scriptureInputRef}
          baseRef={baseRef}
          placeholder={current.placeholder}
          onNavigate={onNavigate}
        />
      ) : (
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none select-none">
            {current.icon}
          </span>
          <input
            ref={textInputRef}
            className="w-full pl-8 pr-3 py-1 focus:outline-none text-body-ui font-body-ui transition-colors placeholder:text-on-surface-variant field rounded-lg"
            placeholder={current.placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); openResults(); }}
            onKeyDown={onKeyDown}
            onFocus={openResults}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            spellCheck={false}
            autoComplete="off"
          />

          {mode === "word" && open && query.trim() && rect && (
            <div
              className="fixed z-[200] glass rounded-xl overflow-y-auto"
              style={{ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 420), maxHeight: Math.max(160, window.innerHeight - rect.bottom - 24) }}
            >
              {settled !== query.trim() && results.length === 0 ? (
                <p className="px-3 py-2 font-body-ui text-[12px] text-on-surface-variant">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 font-body-ui text-[12px] text-on-surface-variant">No matches in {primaryModule}.</p>
              ) : (
                results.map((r, i) => (
                  <button
                    key={`${r.book}-${r.chapter}-${r.verse}`}
                    onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                    onMouseEnter={() => setActive(i)}
                    className={`w-full text-left px-3 py-1.5 transition-colors ${i === active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface hover:bg-surface-container-low"}`}
                  >
                    <span className="font-metadata-mono text-[11px] font-bold text-primary mr-2">{r.book} {r.chapter}:{r.verse}</span>
                    <span
                      className="font-body-ui text-[12px] line-clamp-2 [&_mark]:bg-primary/25 [&_mark]:text-inherit [&_mark]:rounded-sm"
                      dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.text) }}
                    />
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "strongs" && open && query.trim() && (
            <div className="absolute top-full left-0 right-0 mt-1 z-[200] px-3 py-1.5 flex items-center gap-2 glass rounded-2xl">
              {strongsNumber ? (
                <>
                  <span className="material-symbols-outlined text-[14px] text-primary">menu_book</span>
                  <span className="font-body-ui text-body-ui text-primary">Open {strongsNumber}</span>
                  <kbd className="font-metadata-mono text-[10px] text-secondary ml-auto bg-surface-container px-1.5 py-0.5 rounded">Enter</kbd>
                </>
              ) : (
                <span className="font-body-ui text-[12px] text-on-surface-variant">Enter a number like G25 or H430</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default PresentationSearchBar;
