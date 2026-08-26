import { useEffect, useState, useCallback, useRef } from "react";
import { useAppStore } from "../store/app";
import { api, type StrongsEntry } from "../lib/tauri";
import { useSheetVisibility } from "../hooks/useSheetVisibility";

// 0 means "never explicitly set" (the persisted preference's own default) —
// resolved to half the viewport height instead of a fixed pixel value so it
// scales with the actual window rather than being cramped/oversized
// depending on screen size. Once dragged even once, the real committed
// pixel height persists from then on and this sentinel never applies again.
function resolveHeight(stored: number): number {
  return stored || Math.round(window.innerHeight * 0.5);
}

function useDraggableHeight(initial: number, onCommit: (h: number) => void) {
  const [height, setHeight] = useState(() => resolveHeight(initial));
  const dragging = useRef(false);
  // onPointerMove can fire (and call setHeight) several times before React
  // re-renders and re-attaches a fresh onPointerUp closure — reading `height`
  // straight from that closure risked committing a stale, pre-drag value.
  // This ref is updated in the same place as setHeight, so it's always
  // current regardless of render timing.
  const heightRef = useRef(height);

  useEffect(() => {
    const resolved = resolveHeight(initial);
    heightRef.current = resolved;
    setHeight(resolved);
  }, [initial]);

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const next = Math.min(
      Math.max(180, window.innerHeight - e.clientY),
      Math.round(window.innerHeight * 0.9),
    );
    heightRef.current = next;
    setHeight(next);
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    onCommit(heightRef.current);
  }

  return { height, onPointerDown, onPointerMove, onPointerUp };
}

// Regex for numeric cross-references in lexicon text that appear WITHOUT
// "from"/"same as"/etc. framing (see FROM_CONTEXT below for that case) —
// requires an explicit H/G prefix, unlike the two regexes below. A bare,
// unprefixed number in the middle of Abbott-Smith/LSJ prose is far more
// likely to be a leftover citation fragment than a genuine cross-reference:
// STEPBible's own source data sometimes only tags the first verse of a
// pair ("Act.5:4, 9" — Ananias then Sapphira — tags just "Act.5.4", leaving
// the bare "9" as plain text), which used to render as a nonsensical
// clickable "Strong's 9" button. Real unframed cross-references in these
// lexicons are effectively always spelled out with their letter prefix
// ("H1234"/"G1234"), so requiring it here trades a small amount of recall
// for not linkifying citation-list noise.
const REF_RE = /\b([HG]\d{1,5}[a-z]?)\b(?!\))/g;
const FROM_CONTEXT = /(?:from|same\s+as|see\s+\w+\s+for|akin\s+to|derivative\s+of)\s+/gi;

// Matches only when the etymology clause opens the definition (e.g. "From
// 1891; emptiness...") — the true etymological root, as opposed to any
// "from"/"see"/etc. reference appearing later in the prose, which is a
// cross-reference rather than a derivation.
const ETYMOLOGY_LEAD_RE = /^(?:from|same as|see\s+\w+\s+for|akin to|derivative of)\s+([HG]?\d{1,5}[a-z]?)\b/i;

function TextWithLinks({
  text,
  prefix,
  onLookup,
}: {
  text: string;
  prefix: "H" | "G";
  onLookup: (num: string) => void;
}) {
  // Split on patterns like "from 3667", "from H3667", "see HEBREW for 3667"
  const parts = text.split(
    /((?:(?:from|same\s+as|see\s+\w+\s+for|akin\s+to|derivative\s+of)\s+)[HG]?\d+[a-z]?)/gi
  );

  return (
    <>
      {parts.map((part, i) => {
        // Does this part contain a reference-like pattern?
        const numMatch = part.match(/([HG]?\d+[a-z]?)$/i);
        if (numMatch && FROM_CONTEXT.test(part)) {
          FROM_CONTEXT.lastIndex = 0; // reset stateful regex
          const rawNum = numMatch[1];
          const isAlreadyPrefixed = /^[HG]/i.test(rawNum);
          const fullNum = isAlreadyPrefixed
            ? rawNum.toUpperCase()
            : prefix + rawNum;
          return (
            <span key={i}>
              {part.replace(/[HG]?\d+[a-z]?$/i, "")}
              <button
                className="underline decoration-dotted text-primary hover:text-primary/80 font-medium transition-colors"
                onClick={() => onLookup(fullNum)}
              >
                {rawNum}
              </button>
            </span>
          );
        }
        FROM_CONTEXT.lastIndex = 0;
        // Also linkify bare "H1234" / "G1234" patterns in remaining text
        const pieces = part.split(REF_RE);
        if (pieces.length === 1) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            {pieces.map((piece, j) => {
              if (j % 2 === 1) {
                // Matched group
                const isAlreadyPrefixed = /^[HG]/i.test(piece);
                const fullNum = isAlreadyPrefixed
                  ? piece.toUpperCase()
                  : prefix + piece;
                return (
                  <button
                    key={j}
                    className="underline decoration-dotted text-primary hover:text-primary/80 font-medium transition-colors"
                    onClick={() => onLookup(fullNum)}
                  >
                    {piece}
                  </button>
                );
              }
              return <span key={j}>{piece}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

const FONT_FAMILY_CSS: Record<string, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  serif:  `Georgia, "Palatino Linotype", Palatino, serif`,
  times:  `"Times New Roman", Times, serif`,
  mono:   `"Courier New", Courier, monospace`,
};

// "ours" is always our bundled bare Strong's data; anything else is a
// module_id understood by the get_strongs_entry command — either a SWORD
// module or (for these) a STEPBible-Data source id handled by
// src-tauri/src/sword/stepbible.rs, fetched from GitHub on first use and
// cached locally.
type LexiconSourceId = "ours" | string;

interface LexiconPill {
  id: LexiconSourceId;
  label: string;
}

// Richer, public-domain companion lexicons keyed to the same Strong's
// numbers as our bundled data, from STEPBible-Data (Tyndale House Cambridge,
// CC BY 4.0). Language-specific, so the pill switcher only offers the ones
// that apply to the number's own prefix.
// - TBESG: Abbott-Smith (1922), corrected and gap-filled by Tyndale
//   scholars, with a clean human-curated one-word gloss.
// - TBESH: Hebrew, the full numbered Brown-Driver-Briggs sense breakdown
//   (not just a short gloss).
// - TFLSJ: the complete Liddell-Scott-Jones lexicon reformatted for Bible
//   words — the deepest option (covers all of Greek literature, not just
//   NT usage), Greek only.
const LEXICON_PILLS: Record<"H" | "G", LexiconPill[]> = {
  H: [{ id: "TBESH", label: "BDB" }],
  G: [{ id: "TBESG", label: "Abbott-Smith" }, { id: "TFLSJ", label: "Full LSJ" }],
};

/**
 * `immediate` is used by the external presentation window. macOS may pause
 * requestAnimationFrame callbacks for an unfocused WKWebView, so a sheet that
 * begins transparent and waits for the next frame can remain invisible until
 * that window is activated.
 */
export default function StrongsSheet({ immediate = false }: { immediate?: boolean }) {
  const { selectedStrongs, setSelectedStrongs, strongsGroup, setStrongsGroup, primaryModule, readingFontSize, isFullscreen, displayPrefs, setDisplayPrefs } = useAppStore();
  const fontFamily = FONT_FAMILY_CSS[displayPrefs.fontFamily] ?? FONT_FAMILY_CSS.system;
  // In the reading view, readingFontSize is the user's own Bible text-size
  // preference, so the sheet should track it exactly. Inside the presentation
  // window (`immediate`) that same field instead holds the operator's display
  // size (up to 98px, meant to be read from across a room) — the sheet there
  // is still dictionary prose read up close, so cap it instead of following.
  const bodyFontSize = immediate ? Math.min(readingFontSize, 18) : readingFontSize;
  const [entries, setEntries] = useState<StrongsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stack of sheets left behind by clicking a cross-reference from inside
  // the sheet — each entry is a snapshot of what was on screen *before*
  // that click, so Back can restore it exactly (including multi-number
  // phrase groups, not just a single Strong's number).
  const [history, setHistory] = useState<{ number: string | null; group: string[] | null }[]>([]);
  const [showMarkers, setShowMarkers] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [etymology, setEtymology] = useState<{ number: string; lemma: string } | null>(null);
  // Small side cache for root-word lookups only — separate from `entries`
  // (the sheet's main navigable state) because looking up a root's lemma
  // must not replace what's currently on screen the way clicking a
  // cross-reference link does.
  const etymologyCache = useRef<Map<string, StrongsEntry>>(new Map());

  const isOpen = selectedStrongs !== null;
  const prefix: "H" | "G" = selectedStrongs?.startsWith("H") ? "H" : "G";

  // Which lexicon to fetch from: our bundled bare Strong's data, or a richer
  // supplementary lexicon for comparison (Abbott-Smith/BDB, or full LSJ —
  // see LEXICON_PILLS above). Seeded from the user's "Default Strong's
  // source" setting each time a new word is looked up, so switching sources
  // via the pill row is a deliberate per-word override, not sticky. LSJ has
  // no Hebrew equivalent, so that preference falls back to the richer
  // Hebrew source (BDB) instead of silently doing nothing.
  const defaultSourceFor = useCallback(
    (lang: "H" | "G"): LexiconSourceId => {
      if (displayPrefs.defaultLexiconSource === "ours") return "ours";
      if (displayPrefs.defaultLexiconSource === "lsj") {
        return lang === "G" ? "TFLSJ" : "TBESH";
      }
      return lang === "G" ? "TBESG" : "TBESH";
    },
    [displayPrefs.defaultLexiconSource]
  );
  const [source, setSource] = useState<LexiconSourceId>(() => defaultSourceFor(prefix));
  useEffect(() => { setSource(defaultSourceFor(prefix)); }, [selectedStrongs, strongsGroup, defaultSourceFor, prefix]);

  const drag = useDraggableHeight(
    displayPrefs.strongsSheetHeight,
    (h) => setDisplayPrefs({ strongsSheetHeight: h }),
  );

  // A phrase with more than one Strong's number is resolved as: the real
  // content word (shown as the entry, same as a single-number lookup) plus
  // any grammatical markers (e.g. H0853, the Hebrew direct-object marker —
  // see is_untranslated_marker in src-tauri/src/sword/lexicon.rs) tucked
  // behind a disclosure instead of presented as a second, equally-weighted
  // definition. If every number in the group turns out to be a marker (a
  // word that's ONLY the direct-object marker, like "and" in Genesis 1:1),
  // fall back to showing it — but labelled as a marker, not a plain entry.
  const contentEntries = entries.filter((e) => !e.is_untranslated_marker);
  const markerEntries = entries.filter((e) => e.is_untranslated_marker);
  const entry = contentEntries[0] ?? entries[0] ?? null;
  const extraContentEntries = contentEntries.filter((e) => e.number !== entry?.number);
  const hiddenMarkers = markerEntries.filter((e) => e.number !== entry?.number);

  // The presentation window deliberately skips this animation (`immediate`); its
  // state must be visible even while the operator window has focus.
  const visible = useSheetVisibility(isOpen, { skip: immediate });

  const lookup = useCallback(
    (num: string) => {
      // Push what's currently on screen — not the word we're navigating
      // to — so Back returns to it. Skipped when nothing was on screen yet
      // (the sheet's very first open), since there's nothing to go back to.
      if (selectedStrongs) {
        setHistory((h) => [{ number: selectedStrongs, group: strongsGroup }, ...h]);
      }
      setStrongsGroup(null);
      setSelectedStrongs(num);
    },
    [selectedStrongs, strongsGroup, setSelectedStrongs, setStrongsGroup]
  );

  const goBack = useCallback(() => {
    const [prev, ...rest] = history;
    if (!prev) return;
    setHistory(rest);
    setStrongsGroup(prev.group);
    setSelectedStrongs(prev.number);
  }, [history, setSelectedStrongs, setStrongsGroup]);

  const close = useCallback(() => {
    setSelectedStrongs(null);
    setStrongsGroup(null);
    setHistory([]);
  }, [setSelectedStrongs, setStrongsGroup]);

  useEffect(() => {
    const numbers = strongsGroup && strongsGroup.length > 1
      ? strongsGroup
      : selectedStrongs
      ? [selectedStrongs]
      : [];
    if (numbers.length === 0 || !primaryModule) return;

    setLoading(true);
    setError(null);
    setEntries([]);
    setShowMarkers(false);
    setShowUsage(false);
    Promise.all(
      numbers.map((num) => {
        const lang = num.startsWith("G") ? "G" : "H";
        const lexModule = source === "ours"
          ? (lang === "G" ? "StrongsGreek" : "StrongsHebrew")
          : source;
        return api.getStrongsEntry(lexModule, num, primaryModule);
      })
    )
      .then(setEntries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [selectedStrongs, strongsGroup, primaryModule, source]);

  // If the lexicon entry opens with an etymology clause ("From 1891;
  // emptiness..."), resolve that referenced number's own lemma so it can be
  // shown as "Root Word (Etymology): From הָבַל H1891" rather than a bare
  // number the reader has to click through to decode.
  useEffect(() => {
    setEtymology(null);
    if (!entry?.long_def || !primaryModule) return;
    const match = entry.long_def.trim().match(ETYMOLOGY_LEAD_RE);
    if (!match) return;
    const rawNum = match[1];
    const fullNum = /^[HG]/i.test(rawNum) ? rawNum.toUpperCase() : prefix + rawNum;
    if (fullNum === entry.number) return; // self-reference, nothing to add

    const cached = etymologyCache.current.get(fullNum);
    if (cached) {
      setEtymology({ number: fullNum, lemma: cached.lemma });
      return;
    }

    let cancelled = false;
    const lang = fullNum.startsWith("G") ? "G" : "H";
    const lexModule = source === "ours" ? (lang === "G" ? "StrongsGreek" : "StrongsHebrew") : source;
    api
      .getStrongsEntry(lexModule, fullNum, primaryModule)
      .then((root) => {
        etymologyCache.current.set(fullNum, root);
        if (!cancelled) setEtymology({ number: fullNum, lemma: root.lemma });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entry, primaryModule, source, prefix]);

  // Escape key closes sheet
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={close}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full rounded-t-2xl shadow-2xl bg-surface border border-outline-variant flex flex-col transition-all duration-300 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
        style={{ maxWidth: isFullscreen ? "90%" : "56rem", height: drag.height }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag-to-resize strip */}
        <div
          className="flex justify-center pt-2 pb-1 shrink-0 cursor-ns-resize select-none group"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          title="Drag to resize"
        >
          <div className="w-10 h-1 rounded-full bg-outline-variant group-hover:bg-primary transition-colors" />
        </div>

        {/* Header */}
        <div className="px-6 pt-2 pb-4 border-b border-outline-variant shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="h-7 w-32 bg-surface-container-low rounded animate-pulse" />
              ) : entry ? (
                <div>
                  <div className="flex items-baseline gap-3 flex-wrap mb-1.5">
                    <span className="font-body-reading text-[28px] font-semibold text-primary leading-tight">
                      {entry.lemma}
                    </span>
                    {entry.transliteration && (
                      <span className="font-metadata-mono text-[14px] text-on-surface-variant">
                        {entry.transliteration}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-metadata-mono text-[11px] tracking-wide">
                      Strong's {entry.number}
                    </span>
                    {entry.part_of_speech && (
                      <span className="font-body-ui text-[12px] text-on-surface-variant italic">
                        {entry.part_of_speech}
                      </span>
                    )}
                    {entry.is_untranslated_marker && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-body-ui text-[11px]"
                        title="This Strong's number has no independent English rendering — it's grammatical, not a translated word."
                      >
                        Grammatical marker
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="font-metadata-mono text-[13px] text-on-surface-variant">
                  {selectedStrongs}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Back to the word open before the last cross-reference click */}
              {history.length > 0 && (
                <button
                  className="p-1.5 rounded text-secondary hover:bg-surface-container-low transition-colors"
                  title="Back to previous word"
                  onClick={goBack}
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                </button>
              )}
              <button
                className="p-1.5 rounded text-secondary hover:bg-surface-container-low transition-colors"
                onClick={close}
                title="Close (Esc)"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>
        </div>

        {/* Lexicon source switcher — compare our bundled Strong's data
            against richer companion lexicons for the same number. */}
        <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-outline-variant shrink-0">
          {([{ id: "ours", label: "Ours" }, ...LEXICON_PILLS[prefix]] as LexiconPill[]).map((pill) => (
            <button
              key={pill.id}
              type="button"
              className={`px-3 py-1 rounded-full font-body-ui text-[12px] font-medium transition-colors ${
                source === pill.id
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
              }`}
              onClick={() => setSource(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <span className="font-body-ui text-body-ui text-on-surface-variant">
                Loading…
              </span>
            </div>
          )}

          {error && (
            <div className="p-6">
              {error.includes("Module not found") ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                  <span className="material-symbols-outlined text-[40px] text-on-surface-variant">
                    menu_book
                  </span>
                  <p className="font-body-ui text-[14px] text-on-surface-variant">
                    {source === "ours"
                      ? (prefix === "G" ? "Strong's Greek Dictionary" : "Strong's Hebrew Dictionary")
                      : LEXICON_PILLS[prefix].find((p) => p.id === source)?.label ?? source}{" "}
                    not installed.
                  </p>
                </div>
              ) : error.includes("not found") ? (
                // The dictionary module IS installed — this specific number
                // just isn't in it (a real, if rare, gap in that module's own
                // data — a full-Bible audit found ~30 such Greek numbers, and
                // the supplementary lexicons cover a partial, if large,
                // subset of numbers too). "Not installed" would be actively
                // misleading here.
                <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                  <span className="material-symbols-outlined text-[40px] text-on-surface-variant">
                    search_off
                  </span>
                  <p className="font-body-ui text-[14px] text-on-surface-variant">
                    No entry for Strong's {selectedStrongs} in {source === "ours" ? "this dictionary" : (LEXICON_PILLS[prefix].find((p) => p.id === source)?.label ?? source)}.
                  </p>
                </div>
              ) : (
                <p className="font-body-ui text-body-ui text-error">{error}</p>
              )}
            </div>
          )}

          {!loading && !error && entry && (
            <div className="px-6 py-5 space-y-5">
              {/* Usage was a persistent 220px side column that squeezed the
                  definition down to a narrower measure on every screen — now
                  a collapsed bar so the definition/lexicon entry can use the
                  sheet's full width, matching how the marker disclosure
                  below already behaves. */}
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-metadata-mono text-[11px] uppercase tracking-widest transition-colors"
                onClick={() => setShowUsage((v) => !v)}
              >
                <span>{entry.usage_count > 0 ? `Occurs ${entry.usage_count}× in the Bible` : "Usage"}</span>
                <span className="material-symbols-outlined text-[16px]">
                  {showUsage ? "expand_less" : "expand_more"}
                </span>
              </button>
              {showUsage && (
                <div className="rounded border border-outline-variant p-4">
                  {entry.usage_count > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
                        {entry.usage_by_book.map((u) => (
                          <div
                            key={u.book}
                            className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-surface-container-low transition-colors"
                          >
                            <span className="font-body-ui text-[13px] text-on-surface">
                              {u.book}
                            </span>
                            <span className="font-metadata-mono text-[11px] text-on-surface-variant tabular-nums">
                              {u.count}
                            </span>
                          </div>
                        ))}
                      </div>
                      <button className="mt-3 w-full py-1.5 border border-outline-variant text-on-surface font-body-ui text-[12px] rounded hover:bg-surface-container-low transition-colors">
                        Search all occurrences
                      </button>
                    </>
                  ) : (
                    <p className="font-body-ui text-[13px] text-on-surface-variant italic">
                      Usage data will be available after the index finishes building.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-5">
                {/* The old "Definition" section (short_def) was dropped —
                    it's an auto-extracted opening clause of long_def itself
                    (see split_at_sentence in lexicon.rs), so it read as a
                    near-duplicate of the Lexicon Entry below rather than
                    distinct information. Headword replaces it with the
                    thing that section never actually gave: the original
                    word on its own, not folded into English prose. Labeled
                    "Headword" (this entry's own word), not "Root Word" —
                    the Lexicon Entry text below may itself say "from XXXX"
                    to name a *different*, earlier Strong's number as the
                    true etymological root, which we don't have as separate
                    structured data. */}
                <section>
                  <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">
                    Headword
                  </p>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-body-reading text-[22px] font-semibold text-primary leading-tight">
                      {entry.lemma}
                    </span>
                    {entry.transliteration && (
                      <span className="font-metadata-mono text-[13px] text-on-surface-variant">
                        {entry.transliteration}
                      </span>
                    )}
                  </div>
                </section>

                {etymology && (
                  <section>
                    <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">
                      Root Word (Etymology)
                    </p>
                    <div
                      className="flex items-baseline gap-2 flex-wrap font-body-ui"
                      style={{ fontSize: `${bodyFontSize - 2}px`, fontFamily }}
                    >
                      <span className="text-on-surface-variant">From</span>
                      <span className="text-primary font-semibold">{etymology.lemma}</span>
                      <button
                        className="underline decoration-dotted text-primary hover:text-primary/80 font-medium transition-colors"
                        onClick={() => lookup(etymology.number)}
                      >
                        {etymology.number}
                      </button>
                    </div>
                  </section>
                )}

                {entry.long_def && (
                  <section>
                    <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">
                      Lexicon Entry
                    </p>
                    <p className="font-body-ui leading-relaxed text-on-surface-variant whitespace-pre-wrap" style={{ fontSize: `${bodyFontSize - 2}px`, fontFamily }}>
                      <TextWithLinks
                        text={entry.long_def}
                        prefix={prefix}
                        onLookup={lookup}
                      />
                    </p>
                  </section>
                )}

                {/* Rare: the phrase genuinely compounds two content words
                    (not a grammatical marker riding along), so both carry
                    real meaning and are shown as peers rather than tucked away. */}
                {extraContentEntries.map((extra) => (
                  <section key={extra.number} className="pt-4 border-t border-outline-variant">
                    <p className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">
                      Also in this phrase — Strong's {extra.number}
                    </p>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="font-body-reading text-[18px] font-semibold text-primary leading-tight">
                        {extra.lemma}
                      </span>
                      {extra.transliteration && (
                        <span className="font-metadata-mono text-[12px] text-on-surface-variant">
                          {extra.transliteration}
                        </span>
                      )}
                    </div>
                    <p className="font-body-ui leading-relaxed text-on-surface" style={{ fontSize: `${bodyFontSize - 1}px`, fontFamily }}>
                      <TextWithLinks text={extra.short_def} prefix={prefix} onLookup={lookup} />
                    </p>
                  </section>
                ))}

                {/* Grammatical markers (e.g. H0853) tucked behind a disclosure —
                    real data, but not a competing definition for the phrase. */}
                {hiddenMarkers.length > 0 && (
                  <section className="pt-4 border-t border-outline-variant">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 font-metadata-mono text-[11px] text-on-surface-variant hover:text-on-surface transition-colors"
                      onClick={() => setShowMarkers((v) => !v)}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {showMarkers ? "expand_less" : "expand_more"}
                      </span>
                      {hiddenMarkers.length === 1 ? "1 grammatical marker also in this phrase" : `${hiddenMarkers.length} grammatical markers also in this phrase`}
                    </button>
                    {showMarkers && (
                      <div className="mt-3 space-y-3">
                        {hiddenMarkers.map((marker) => (
                          <div key={marker.number} className="pl-1 border-l-2 border-outline-variant">
                            <div className="flex items-center gap-2 pl-3 mb-1">
                              <span className="font-metadata-mono text-[11px] text-on-surface-variant">
                                Strong's {marker.number} · {marker.lemma}
                              </span>
                            </div>
                            <p className="pl-3 font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
                              <TextWithLinks text={marker.short_def} prefix={prefix} onLookup={lookup} />
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
