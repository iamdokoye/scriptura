import { createContext, useContext, useEffect, useRef, useState } from "react";
import { listenPresentation, type PresentState } from "../lib/presentation";
import { api, type ChapterText, type PresentationTheme } from "../lib/tauri";
import StrongsSheet from "../components/StrongsSheet";
import { useShrinkToFit } from "../hooks/useShrinkToFit";
import { useAppStore, type DisplayPrefs } from "../store/app";

const FONT_FAMILY_CSS: Record<string, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  serif:  `Georgia, "Palatino Linotype", Palatino, serif`,
  times:  `"Times New Roman", Times, serif`,
  mono:   `"Courier New", Courier, monospace`,
};

interface TextStyle {
  fontSize: string;
  fontFamily: string;
  lineHeight: number;
  letterSpacing: string;
  color: string;
  textAlign: "left" | "center" | "right" | "justify";
  fontWeight: number;
  textShadow?: string;
}

const PresentationThemeContext = createContext<PresentationTheme | null>(null);

function makeTextStyle(prefs: DisplayPrefs, fontSize: number, theme: PresentationTheme | null): TextStyle {
  return {
    fontSize: `${fontSize * (theme?.font_scale ?? 1)}px`,
    fontFamily: FONT_FAMILY_CSS[theme?.font_family ?? prefs.fontFamily] ?? FONT_FAMILY_CSS.system,
    lineHeight: 1 + prefs.lineSpacing,
    letterSpacing: `${prefs.letterSpacing * 0.1}em`,
    color: theme?.text_color ?? "#ffffff",
    textAlign: (theme?.text_align as TextStyle["textAlign"] | undefined) ?? prefs.textAlign,
    fontWeight: theme?.text_font_weight ?? 600,
    textShadow: theme?.text_shadow ? "0 2px 12px rgba(0,0,0,.75)" : undefined,
  };
}

function referenceStyle(theme: PresentationTheme | null, fontSize: number): React.CSSProperties {
  return {
    color: theme?.reference_color ?? "#b8c4d8",
    fontSize: `${fontSize * (theme?.reference_font_scale ?? 1)}px`,
    fontWeight: theme?.reference_font_weight ?? 500,
  };
}

function referenceIsTop(theme: PresentationTheme | null) {
  return (theme?.reference_position ?? "bottom-center").startsWith("top-");
}

function referenceAlignment(theme: PresentationTheme | null) {
  const position = theme?.reference_position ?? "bottom-center";
  return position.endsWith("-left") ? "justify-start" : position.endsWith("-right") ? "justify-end" : "justify-center";
}

function ReferenceLabel({ label, module, fontSize }: { label: string; module: string; fontSize: number }) {
  const presentationTheme = useContext(PresentationThemeContext);
  return (
    <div className={`flex items-center gap-3 shrink-0 w-full ${referenceAlignment(presentationTheme)}`}>
      <span className="font-metadata-mono text-white/60" style={referenceStyle(presentationTheme, fontSize)}>{label}</span>
      <span className="font-metadata-mono text-white/30 border border-white/20 rounded px-2 py-0.5" style={referenceStyle(presentationTheme, Math.max(10, fontSize - 3))}>{module}</span>
    </div>
  );
}

export default function PresentationView() {
  const [state, setState] = useState<PresentState | null>(null);
  const [chapter, setChapter] = useState<ChapterText | null>(null);
  const [parallelChapter, setParallelChapter] = useState<ChapterText | null>(null);

  const { setDisplayPrefs, setSelectedStrongs, setPrimaryModule, setReadingFontSize, setIsFullscreen } = useAppStore();

  // Presentation window is always dark; isFullscreen tells StrongsSheet to use 90% width
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add("dark");
    setIsFullscreen(true);
  }, []);

  useEffect(() => {
    return listenPresentation((s) => {
      setState(s);
      setDisplayPrefs(s.displayPrefs);
      setSelectedStrongs(s.selectedStrongs);
      setPrimaryModule(s.primaryModule);
      setReadingFontSize(s.readingFontSize);
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    api.getChapter(state.primaryModule, state.book, state.chapter)
      .then(setChapter)
      .catch(() => setChapter(null));
  }, [state?.primaryModule, state?.book, state?.chapter]);

  useEffect(() => {
    if (!state?.parallelMode || !state.parallelModule) {
      setParallelChapter(null);
      return;
    }
    api.getChapter(state.parallelModule, state.book, state.chapter)
      .then(setParallelChapter)
      .catch(() => setParallelChapter(null));
  }, [state?.parallelMode, state?.parallelModule, state?.book, state?.chapter]);

  if (!state || !chapter) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center gap-4">
        <span className="material-symbols-outlined text-[48px] text-white/20">slideshow</span>
        <p className="font-body-ui text-[15px] text-white/30 tracking-wide">
          Waiting for operator console…
        </p>
      </div>
    );
  }

  const ctx = state.displayPrefs.presentationContext ?? 1;
  const fontSize = state.readingFontSize;
  const prefs = state.displayPrefs;
  // 5% baseline keeps text off the edges even at margins=0;
  // the margins slider adds on top of that (same half-each-side formula as the reading view)
  const presentationTheme = state.presentationTheme;
  const hPad = `${presentationTheme?.safe_margin ?? (5 + prefs.margins / 2)}%`;
  const themeStyle: React.CSSProperties = {
    background: presentationTheme?.background_gradient || presentationTheme?.background_color || "#000000",
    "--presentation-text": presentationTheme?.text_color ?? "#ffffff",
    "--presentation-reference": presentationTheme?.reference_color ?? "#b8c4d8",
    "--presentation-shadow": presentationTheme?.text_shadow ? "0 2px 12px rgba(0,0,0,.75)" : "none",
    "--presentation-transition-duration": `${presentationTheme?.transition_duration ?? 0}ms`,
  } as React.CSSProperties;

  return (
    <PresentationThemeContext.Provider value={presentationTheme}>
      <div className="presentation-output h-screen flex flex-col overflow-hidden select-none" style={themeStyle}>
        <div key={`${state.book}-${state.chapter}-${state.verse}-${state.primaryModule}`} className={`flex-1 overflow-hidden presentation-transition presentation-transition-${presentationTheme?.transition_type ?? "none"}`}>
          {ctx === 4 ? (
            <ScrollLayout
              state={state}
              chapter={chapter}
              parallelChapter={parallelChapter}
              fontSize={fontSize}
              prefs={prefs}
              hPad={hPad}
            />
          ) : (
            <ContextLayout
              ctx={ctx}
              state={state}
              chapter={chapter}
              parallelChapter={parallelChapter}
              fontSize={fontSize}
              prefs={prefs}
              hPad={hPad}
            />
          )}
        </div>
        <StrongsSheet immediate />
      </div>
    </PresentationThemeContext.Provider>
  );
}

// ── Context layout (1, 2, or 3 verses) ───────────────────────────────────────

function ContextLayout({ ctx, state, chapter, parallelChapter, fontSize, prefs, hPad }: {
  ctx: 1 | 2 | 3;
  state: PresentState;
  chapter: ChapterText;
  parallelChapter: ChapterText | null;
  fontSize: number;
  prefs: DisplayPrefs;
  hPad: string;
}) {
  const presentationTheme = useContext(PresentationThemeContext);
  const idx = chapter.verses.findIndex((v) => v.verse === state.verse);
  const prev = ctx === 3 && idx > 0 ? chapter.verses[idx - 1] : null;
  const active = chapter.verses[idx] ?? null;
  const next = ctx >= 2 && idx < chapter.verses.length - 1 ? chapter.verses[idx + 1] : null;

  function verseText(v: typeof active) {
    return v?.spans.map((s) => s.text).join("") ?? "";
  }
  function parallelText(v: typeof active) {
    if (!v || !parallelChapter) return "";
    return parallelChapter.verses.find((pv) => pv.verse === v.verse)?.spans.map((s) => s.text).join("") ?? "";
  }

  const ref = `${state.book} ${state.chapter}:${state.verse}`;
  // Context verses (prev/next) render at 68% of the active size
  const contextStyle = makeTextStyle(prefs, Math.round(fontSize * 0.68), presentationTheme);
  const refSize = Math.max(12, Math.round(fontSize * 0.28));

  // Single verse — vertically centred, shrunk to fit if it's long
  if (ctx === 1) {
    if (!state.parallelMode && presentationTheme) {
      return <FreeformVerseLayout text={verseText(active)} reference={ref} module={state.primaryModule} prefs={prefs} maxFontSize={fontSize} refSize={refSize} theme={presentationTheme} />;
    }
    return (
      <div className="h-full flex items-center justify-center" style={{ paddingLeft: hPad, paddingRight: hPad }}>
        {state.parallelMode && parallelChapter ? (
          <div className="w-full h-full py-10 grid grid-cols-2 gap-16">
            <VerseColumn text={verseText(active)} reference={ref} module={state.primaryModule} prefs={prefs} maxFontSize={fontSize} refSize={refSize} />
            <VerseColumn text={parallelText(active)} reference={ref} module={state.parallelModule ?? ""} prefs={prefs} maxFontSize={fontSize} refSize={refSize} dim />
          </div>
        ) : (
          <div className="w-full h-full py-10 text-center">
            <VerseColumn text={verseText(active)} reference={ref} module={state.primaryModule} prefs={prefs} maxFontSize={fontSize} refSize={refSize} centered widen />
          </div>
        )}
      </div>
    );
  }

  // 2 or 3 verses — stacked, active highlighted
  const rows: Array<{ v: typeof active; label: string; role: "prev" | "active" | "next" }> = [];
  if (prev) rows.push({ v: prev, label: `${state.book} ${state.chapter}:${prev.verse}`, role: "prev" });
  if (active) rows.push({ v: active, label: ref, role: "active" });
  if (next) rows.push({ v: next, label: `${state.book} ${state.chapter}:${next.verse}`, role: "next" });

  // Keep state changes instantaneous: macOS can defer CSS animation frames for
  // an unfocused presentation WKWebView.

  // The active row gets a definite (vh, not %) height budget to shrink text
  // against — prev/next stay at their fixed context size since they're already
  // small and typically short.
  const activeRowHeight = ctx === 3 ? "50vh" : "60vh";

  return (
    <div className="h-full flex flex-col justify-center gap-0 py-10" style={{ paddingLeft: hPad, paddingRight: hPad }}>
      {rows.map(({ v, label, role }) => {
        const isActive = role === "active";
        const opacity = isActive ? "opacity-100" : role === "prev" ? "opacity-25" : "opacity-50";
        return (
          <div
            key={role}
            className={`${opacity} ${isActive ? "py-8 border-y border-white/10 box-border" : "py-5"}`}
            style={isActive ? { height: activeRowHeight } : undefined}
          >
            {state.parallelMode && parallelChapter ? (
              <div className="grid grid-cols-2 gap-12 h-full">
                <ContextVerseBlock text={verseText(v)} label={label} module={state.primaryModule} prefs={prefs} maxFontSize={fontSize} contextStyle={contextStyle} refSize={refSize} active={isActive} />
                <ContextVerseBlock text={parallelText(v)} label={label} module={state.parallelModule ?? ""} prefs={prefs} maxFontSize={fontSize} contextStyle={contextStyle} refSize={refSize} active={isActive} dim />
              </div>
            ) : (
              <ContextVerseBlock text={verseText(v)} label={label} module={state.primaryModule} prefs={prefs} maxFontSize={fontSize} contextStyle={contextStyle} refSize={refSize} active={isActive} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContextVerseBlock({ text, label, module, prefs, maxFontSize, contextStyle, refSize, active, dim }: {
  text: string;
  label: string;
  module: string;
  prefs: DisplayPrefs;
  maxFontSize: number;
  contextStyle: TextStyle;
  refSize: number;
  active: boolean;
  dim?: boolean;
}) {
  const presentationTheme = useContext(PresentationThemeContext);
  if (!active) {
    return (
      <div className={`flex flex-col gap-3 ${dim ? "opacity-60" : ""}`}>
        <p className="text-white" style={contextStyle}>{text}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 h-full ${dim ? "opacity-60" : ""}`}>
      {referenceIsTop(presentationTheme) && <ReferenceLabel label={label} module={module} fontSize={refSize} />}
      <ShrinkingVerseText text={text} maxFontSize={maxFontSize} prefs={prefs} />
      {!referenceIsTop(presentationTheme) && <ReferenceLabel label={label} module={module} fontSize={refSize} />}
    </div>
  );
}

// Shrinks its text to fit the vertical space its (definite-height) parent
// gives it — used for the active verse in every context mode, since that's
// always rendered at the large, operator-configured font size and is the one
// that can overflow on a long verse.
// Single verse gets to grow up to full width before its font shrinks — a short
// verse still reads as an intentional, narrower centered block.
const SINGLE_VERSE_WIDTH_RANGE = { min: 55, max: 100 };

function ShrinkingVerseText({ text, maxFontSize, prefs, centered, widen, maxHeightVh }: {
  text: string;
  maxFontSize: number;
  prefs: DisplayPrefs;
  centered?: boolean;
  widen?: boolean;
  /**
   * ScrollLayout's active verse (ctx=4) needs a different sizing strategy
   * than ctx 1-3: those give this a definite h-full parent to always fill,
   * but here the block sits inline in a scrolling list of other (dimmed)
   * verses — forcing it to always occupy a fixed height would push those
   * away even when the verse already fits fine. `max-height` + overflow
   * only clamps (and only then triggers the shrink loop) when the verse is
   * actually taller than the budget, e.g. Esther 9:8's ten-name list.
   */
  maxHeightVh?: number;
}) {
  const presentationTheme = useContext(PresentationThemeContext);
  const minSize = presentationTheme
    ? (presentationTheme.auto_layout ? Math.max(14, maxFontSize * presentationTheme.min_font_scale) : maxFontSize)
    : 24;
  const { containerRef, textRef, fontSize, widthPct } = useShrinkToFit({
    text,
    maxSize: maxFontSize,
    minSize,
    widthRange: widen ? SINGLE_VERSE_WIDTH_RANGE : undefined,
  });
  const style = makeTextStyle(prefs, fontSize, presentationTheme);
  const containerStyle: React.CSSProperties = {
    ...(widen ? { width: `${widthPct}%` } : undefined),
    ...(maxHeightVh ? { maxHeight: `${maxHeightVh}vh` } : undefined),
  };
  return (
    <div
      ref={containerRef}
      className={maxHeightVh
        ? "flex flex-col justify-center overflow-hidden"
        : "flex-1 min-h-0 flex flex-col justify-center overflow-hidden"}
      style={containerStyle}
    >
      <p ref={textRef} className={`text-white ${centered ? "text-center" : ""}`} style={style}>{text}</p>
    </div>
  );
}

// Freeform boxes are intentionally used for the single-verse layout, where an
// operator expects a slide-like canvas. Context and chapter modes stay in their
// structured reading layouts so adjacent verses retain their visual hierarchy.
function FreeformVerseLayout({ text, reference, module, prefs, maxFontSize, refSize, theme }: {
  text: string;
  reference: string;
  module: string;
  prefs: DisplayPrefs;
  maxFontSize: number;
  refSize: number;
  theme: PresentationTheme;
}) {
  const verseBox: React.CSSProperties = {
    left: `${theme.verse_box_x}%`, top: `${theme.verse_box_y}%`,
    width: `${theme.verse_box_width}%`, height: `${theme.verse_box_height}%`,
  };
  const referenceBox: React.CSSProperties = {
    left: `${theme.reference_box_x}%`, top: `${theme.reference_box_y}%`,
    width: `${theme.reference_box_width}%`, height: `${theme.reference_box_height}%`,
  };
  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute flex items-center overflow-hidden" style={verseBox}>
        <ShrinkingVerseText text={text} maxFontSize={maxFontSize} prefs={prefs} centered={theme.text_align === "center"} widen={false} />
      </div>
      <div className={`absolute flex items-center ${referenceAlignment(theme)}`} style={referenceBox}>
        <ReferenceLabel label={reference} module={module} fontSize={refSize} />
      </div>
    </div>
  );
}

// ── Scroll layout (full chapter, active verse highlighted) ───────────────────

function ScrollLayout({ state, chapter, parallelChapter, fontSize, prefs, hPad }: {
  state: PresentState;
  chapter: ChapterText;
  parallelChapter: ChapterText | null;
  fontSize: number;
  prefs: DisplayPrefs;
  hPad: string;
}) {
  const presentationTheme = useContext(PresentationThemeContext);
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state.book, state.chapter, state.verse, chapter]);

  const ref = `${state.book} ${state.chapter}`;
  const textStyle = makeTextStyle(prefs, fontSize, presentationTheme);
  const verseNumSize = Math.max(10, Math.round(fontSize * 0.28));

  return (
    <div className="h-full overflow-y-auto py-12" style={{ paddingLeft: hPad, paddingRight: hPad }}>
      <p
        className="font-metadata-mono text-white/40 mb-8 tracking-widest uppercase"
        style={referenceStyle(presentationTheme, verseNumSize)}
      >
        {ref} · {state.primaryModule}
        {state.parallelMode && state.parallelModule && (
          <span className="ml-3 text-white/25">/ {state.parallelModule}</span>
        )}
      </p>

      <div className="space-y-6">
        {chapter.verses.map((v) => {
          const isActive = v.verse === state.verse;
          const text = v.spans.map((s) => s.text).join("");
          const parallelText = parallelChapter?.verses
            .find((pv) => pv.verse === v.verse)
            ?.spans.map((s) => s.text).join("") ?? "";

          return (
            <div
              key={v.verse}
              ref={isActive ? activeRef : null}
              className={isActive ? "opacity-100" : "opacity-30"}
            >
              {state.parallelMode && parallelChapter ? (
                <div className="grid grid-cols-2 gap-12">
                  <ScrollVerseBlock verse={v.verse} text={text} active={isActive} textStyle={textStyle} verseNumSize={verseNumSize} fontSize={fontSize} prefs={prefs} />
                  <ScrollVerseBlock verse={v.verse} text={parallelText} active={isActive} textStyle={textStyle} verseNumSize={verseNumSize} fontSize={fontSize} prefs={prefs} dim />
                </div>
              ) : (
                <ScrollVerseBlock verse={v.verse} text={text} active={isActive} textStyle={textStyle} verseNumSize={verseNumSize} fontSize={fontSize} prefs={prefs} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Full-chapter scroll mode still scrolls verse-to-verse as normal, but the
// active verse itself shouldn't require *additional* scrolling within the
// presentation screen to read in full — a long verse (e.g. Esther 9:8's
// ten-name list) can be taller than the viewport even after being centered.
const ACTIVE_VERSE_MAX_HEIGHT_VH = 75;

function ScrollVerseBlock({ verse, text, active, textStyle, verseNumSize, dim, fontSize, prefs }: {
  verse: number;
  text: string;
  active: boolean;
  textStyle: TextStyle;
  verseNumSize: number;
  dim?: boolean;
  fontSize: number;
  prefs: DisplayPrefs;
}) {
  const presentationTheme = useContext(PresentationThemeContext);
  return (
    // items-start matters here, not just cosmetics: without it, the active
    // verse's shrink-to-fit container (a flex row sibling with only
    // max-height, no explicit height) gets pulled into this row's default
    // stretch behavior, and its clientHeight reads as 0 mid-measurement —
    // found via direct browser testing of this exact layout.
    <div className={`flex items-start gap-4 ${dim ? "opacity-60" : ""}`}>
      <span
        className={`font-metadata-mono shrink-0 mt-1 ${active ? "text-white/60" : "text-white/20"}`}
        style={referenceStyle(presentationTheme, verseNumSize)}
      >
        {verse}
      </span>
      {active ? (
        <ShrinkingVerseText text={text} maxFontSize={fontSize} prefs={prefs} maxHeightVh={ACTIVE_VERSE_MAX_HEIGHT_VH} />
      ) : (
        <p className="text-white" style={textStyle}>{text}</p>
      )}
    </div>
  );
}

function VerseColumn({ text, reference, module, prefs, maxFontSize, refSize, dim, centered, widen }: {
  text: string;
  reference: string;
  module: string;
  prefs: DisplayPrefs;
  maxFontSize: number;
  refSize: number;
  dim?: boolean;
  centered?: boolean;
  widen?: boolean;
}) {
  const presentationTheme = useContext(PresentationThemeContext);
  return (
    <div className={`flex flex-col gap-6 h-full ${centered ? "items-center" : ""} ${dim ? "opacity-60" : ""}`}>
      {referenceIsTop(presentationTheme) && <ReferenceLabel label={reference} module={module} fontSize={refSize} />}
      <ShrinkingVerseText text={text} maxFontSize={maxFontSize} prefs={prefs} centered={centered} widen={widen} />
      {!referenceIsTop(presentationTheme) && <ReferenceLabel label={reference} module={module} fontSize={refSize} />}
    </div>
  );
}
