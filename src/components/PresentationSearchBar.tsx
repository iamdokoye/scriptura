import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useAppStore, type VerseRef } from "../store/app";
import { api, type SearchResult } from "../lib/tauri";
import { sanitizeSnippet } from "../lib/sanitize";
import { routeQuery, ASK_PREFIX, WORD_PREFIX, type QueryRoute } from "../lib/searchRouting";
import { useScriptureInput } from "../hooks/useScriptureInput";
import { useAiSearchStore } from "../store/aiSearchStore";
import ScriptureSuggestions from "./ScriptureSuggestions";

export interface PresentationSearchBarHandle {
  /** Focus the search input. */
  focus: () => void;
}

interface Props {
  baseRef: VerseRef;
  onNavigate: (ref: VerseRef) => void;
}

const ROUTE_UI: Record<QueryRoute["kind"], { icon: string; label: string }> = {
  empty: { icon: "auto_stories", label: "" },
  reference: { icon: "auto_stories", label: "Verse" },
  word: { icon: "search", label: "Text" },
  ask: { icon: "auto_awesome", label: "Ask AI" },
};

/**
 * The Live Show console's search bar: one input, no modes. What's typed decides what
 * happens (see lib/searchRouting.ts), and the icon and tag at the right edge show what
 * it decided. `jn 3:16` jumps to a verse, `love your enemies` searches the text,
 * `/john` forces a text search, and `? verses about hope` asks the AI.
 */
const PresentationSearchBar = forwardRef<PresentationSearchBarHandle, Props>(function PresentationSearchBar(
  { baseRef, onNavigate }, ref,
) {
  const { primaryModule, showStrongs, setShowStrongs } = useAppStore();
  const aiOpen = useAiSearchStore((s) => s.open);

  // Same persistence path as Settings → "Show Strong's numbers".
  function toggleStrongs() {
    const next = !showStrongs;
    setShowStrongs(next);
    api.setPreferences({ show_strongs: next }).catch(() => {});
  }

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [settled, setSettled] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const route = useMemo(() => routeQuery(value), [value]);
  const ui = ROUTE_UI[route.kind];
  const nav = useScriptureInput({ value, setValue, setOpen, inputRef, baseRef, goTo: onNavigate });
  const isReference = route.kind === "reference";
  const wordText = route.kind === "word" ? route.text : "";

  // Debounced word search against the current Bible module.
  useEffect(() => {
    if (!wordText || !primaryModule) { setResults([]); setSettled(""); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.search(wordText, { modules: [primaryModule], page_size: 40 })
        .then((r) => { if (!cancelled) { setResults(r); setActive(0); } })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSettled(wordText); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [wordText, primaryModule]);

  function reset() {
    setValue("");
    setResults([]);
    setOpen(false);
  }

  function pick(r: SearchResult) {
    onNavigate({ book: r.book, chapter: r.chapter, verse: r.verse });
    reset();
  }

  function askAi() {
    if (route.kind !== "ask") return;
    useAiSearchStore.getState().ask(route.text);
    reset();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { reset(); return; }

    if (isReference) {
      if (e.key === " ") nav.handleSpace(e);
      else if (e.key === "Enter" && nav.canNavigate) { e.preventDefault(); nav.navigate(); }
    } else if (route.kind === "word") {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
    } else if (route.kind === "ask" && e.key === "Enter") {
      e.preventDefault();
      askAi();
    }
  }

  // A full book name with no chapter ("john") is ambiguous with a word; Enter opens the
  // book, and this row says how to search the text for it instead.
  const bookOnly = isReference && nav.matchedBook && !nav.previewText && value.trim().toLowerCase() === nav.matchedBook.toLowerCase()
    ? nav.matchedBook
    : null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        onClick={toggleStrongs}
        aria-pressed={showStrongs}
        className={`rounded-lg px-2 py-1 flex items-center gap-1.5 shrink-0 ${showStrongs ? "ctl-active" : "ctl text-on-surface-variant"}`}
        title={showStrongs ? "Strong's concordance on — click to turn off" : "Strong's concordance off — click to turn on"}
        aria-label={`Strong's concordance ${showStrongs ? "on" : "off"}`}
      >
        <span className="material-symbols-outlined text-[18px]">tag</span>
        <span className="font-metadata-mono text-[10px] uppercase tracking-widest hidden xl:inline">Strong's</span>
      </button>

      <button
        onClick={() => useAiSearchStore.getState().toggle()}
        aria-pressed={aiOpen}
        className={`rounded-lg px-2 py-1 flex items-center gap-1.5 shrink-0 ${aiOpen ? "ctl-active" : "ctl text-on-surface-variant"}`}
        title="Ask Scripture — find verses by describing them (Ctrl+Shift+K, or start the search bar with ?)"
        aria-label={`Ask Scripture ${aiOpen ? "open" : "closed"}`}
      >
        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
        <span className="font-metadata-mono text-[10px] uppercase tracking-widest hidden xl:inline">Ask</span>
      </button>

      <div className="relative flex-1 min-w-[220px]">
        <span className={`material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none select-none ${route.kind === "ask" ? "text-primary" : "text-on-surface-variant"}`}>
          {ui.icon}
        </span>
        <input
          ref={inputRef}
          className="w-full pl-8 pr-16 py-1 focus:outline-none text-body-ui font-body-ui transition-colors placeholder:text-on-surface-variant field rounded-lg"
          placeholder={`Verse (jn 3:16), a word, or ${ASK_PREFIX} to ask  (Ctrl+K)`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setRect(inputRef.current?.getBoundingClientRect() ?? null);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => { setRect(inputRef.current?.getBoundingClientRect() ?? null); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          spellCheck={false}
          autoComplete="off"
        />
        {ui.label && (
          <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 font-metadata-mono text-[9px] uppercase tracking-widest pointer-events-none select-none ${route.kind === "ask" ? "text-primary" : "text-on-surface-variant"}`}>
            {ui.label}
          </span>
        )}

        {open && isReference && !bookOnly && (
          <ScriptureSuggestions
            suggestions={nav.suggestions}
            previewText={nav.previewText}
            showDropdown={nav.showDropdown}
            onPick={nav.applyBook}
          />
        )}

        {open && bookOnly && (
          <Hint icon="arrow_forward" kbd="Enter">
            <span className="text-primary">{bookOnly} 1</span>
            <span className="text-on-surface-variant ml-2">· {WORD_PREFIX}{value.trim().toLowerCase()} searches the text</span>
          </Hint>
        )}

        {open && route.kind === "ask" && (
          <Hint icon="auto_awesome" kbd="Enter">
            {route.text
              ? <span className="text-primary truncate">Ask: “{route.text}”</span>
              : <span className="text-on-surface-variant">Describe what you're looking for, e.g. {ASK_PREFIX} verses about hope</span>}
          </Hint>
        )}

        {open && route.kind === "word" && wordText && rect && (
          <div
            className="fixed z-[200] glass rounded-xl overflow-y-auto"
            style={{ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 420), maxHeight: Math.max(160, window.innerHeight - rect.bottom - 24) }}
          >
            {settled !== wordText && results.length === 0 ? (
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
      </div>
    </div>
  );
});

function Hint({ icon, kbd, children }: { icon: string; kbd: string; children: React.ReactNode }) {
  return (
    <div className="absolute top-full left-0 right-0 mt-1 z-[200] px-3 py-1.5 flex items-center gap-2 glass rounded-2xl font-body-ui text-body-ui">
      <span className="material-symbols-outlined text-[14px] text-primary shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
      <kbd className="font-metadata-mono text-[10px] text-secondary ml-auto shrink-0 bg-surface-container px-1.5 py-0.5 rounded">{kbd}</kbd>
    </div>
  );
}

export default PresentationSearchBar;
