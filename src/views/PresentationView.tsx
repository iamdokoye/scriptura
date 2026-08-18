import { useEffect, useRef, useState } from "react";
import { listenPresentation, type PresentState } from "../lib/presentation";
import { api, type ChapterText } from "../lib/tauri";
import StrongsSheet from "../components/StrongsSheet";
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
}

function makeTextStyle(prefs: DisplayPrefs, fontSize: number): TextStyle {
  return {
    fontSize: `${fontSize}px`,
    fontFamily: FONT_FAMILY_CSS[prefs.fontFamily] ?? FONT_FAMILY_CSS.system,
    lineHeight: 1 + prefs.lineSpacing,
    letterSpacing: `${prefs.letterSpacing * 0.1}em`,
  };
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
  const hPad = `${5 + prefs.margins / 2}%`;

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden select-none">
      <div className="flex-1 overflow-hidden">
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
      <StrongsSheet />
    </div>
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
  const activeStyle = makeTextStyle(prefs, fontSize);
  // Context verses (prev/next) render at 68% of the active size
  const contextStyle = makeTextStyle(prefs, Math.round(fontSize * 0.68));
  const refSize = Math.max(12, Math.round(fontSize * 0.28));

  // Single verse — vertically centred
  if (ctx === 1) {
    return (
      <div className="h-full flex items-center justify-center" style={{ paddingLeft: hPad, paddingRight: hPad }}>
        {state.parallelMode && parallelChapter ? (
          <div className="w-full grid grid-cols-2 gap-16 items-center">
            <VerseColumn text={verseText(active)} reference={ref} module={state.primaryModule} textStyle={activeStyle} refSize={refSize} />
            <VerseColumn text={parallelText(active)} reference={ref} module={state.parallelModule ?? ""} textStyle={activeStyle} refSize={refSize} dim />
          </div>
        ) : (
          <div className="w-full max-w-[900px] mx-auto text-center">
            <VerseColumn text={verseText(active)} reference={ref} module={state.primaryModule} textStyle={activeStyle} refSize={refSize} centered />
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

  return (
    <div className="h-full flex flex-col justify-center gap-0 py-10" style={{ paddingLeft: hPad, paddingRight: hPad }}>
      {rows.map(({ v, label, role }) => {
        const isActive = role === "active";
        const opacity = isActive ? "opacity-100" : role === "prev" ? "opacity-25" : "opacity-50";
        const ts = isActive ? activeStyle : contextStyle;
        return (
          <div key={role} className={`transition-opacity duration-300 ${opacity} ${isActive ? "py-8 border-y border-white/10" : "py-5"}`}>
            {state.parallelMode && parallelChapter ? (
              <div className="grid grid-cols-2 gap-12">
                <ContextVerseBlock text={verseText(v)} label={label} module={state.primaryModule} textStyle={ts} refSize={refSize} active={isActive} />
                <ContextVerseBlock text={parallelText(v)} label={label} module={state.parallelModule ?? ""} textStyle={ts} refSize={refSize} active={isActive} dim />
              </div>
            ) : (
              <ContextVerseBlock text={verseText(v)} label={label} module={state.primaryModule} textStyle={ts} refSize={refSize} active={isActive} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContextVerseBlock({ text, label, module, textStyle, refSize, active, dim }: {
  text: string;
  label: string;
  module: string;
  textStyle: TextStyle;
  refSize: number;
  active: boolean;
  dim?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-3 ${dim ? "opacity-60" : ""}`}>
      <p className="text-white" style={textStyle}>{text}</p>
      {active && (
        <div className="flex items-center gap-3">
          <span className="font-metadata-mono text-white/60" style={{ fontSize: refSize }}>{label}</span>
          <span className="font-metadata-mono text-white/30 border border-white/20 rounded px-2 py-0.5" style={{ fontSize: Math.max(10, refSize - 3) }}>{module}</span>
        </div>
      )}
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
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state.verse]);

  const ref = `${state.book} ${state.chapter}`;
  const textStyle = makeTextStyle(prefs, fontSize);
  const verseNumSize = Math.max(10, Math.round(fontSize * 0.28));

  return (
    <div className="h-full overflow-y-auto py-12" style={{ paddingLeft: hPad, paddingRight: hPad }}>
      <p
        className="font-metadata-mono text-white/40 mb-8 tracking-widest uppercase"
        style={{ fontSize: verseNumSize }}
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
              className={`transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-30"}`}
            >
              {state.parallelMode && parallelChapter ? (
                <div className="grid grid-cols-2 gap-12">
                  <ScrollVerseBlock verse={v.verse} text={text} active={isActive} textStyle={textStyle} verseNumSize={verseNumSize} />
                  <ScrollVerseBlock verse={v.verse} text={parallelText} active={isActive} textStyle={textStyle} verseNumSize={verseNumSize} dim />
                </div>
              ) : (
                <ScrollVerseBlock verse={v.verse} text={text} active={isActive} textStyle={textStyle} verseNumSize={verseNumSize} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScrollVerseBlock({ verse, text, active, textStyle, verseNumSize, dim }: {
  verse: number;
  text: string;
  active: boolean;
  textStyle: TextStyle;
  verseNumSize: number;
  dim?: boolean;
}) {
  return (
    <div className={`flex gap-4 ${dim ? "opacity-60" : ""}`}>
      <span
        className={`font-metadata-mono shrink-0 mt-1 transition-colors ${active ? "text-white/60" : "text-white/20"}`}
        style={{ fontSize: verseNumSize }}
      >
        {verse}
      </span>
      <p className="text-white" style={textStyle}>{text}</p>
    </div>
  );
}

function VerseColumn({ text, reference, module, textStyle, refSize, dim, centered }: {
  text: string;
  reference: string;
  module: string;
  textStyle: TextStyle;
  refSize: number;
  dim?: boolean;
  centered?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-6 ${centered ? "items-center" : ""} ${dim ? "opacity-60" : ""}`}>
      <p className={`text-white ${centered ? "text-center" : ""}`} style={textStyle}>{text}</p>
      <div className={`flex items-center gap-3 ${centered ? "justify-center" : ""}`}>
        <span className="font-metadata-mono text-white/60" style={{ fontSize: refSize }}>{reference}</span>
        <span className="font-metadata-mono text-white/30 border border-white/20 rounded px-2 py-0.5" style={{ fontSize: Math.max(10, refSize - 3) }}>{module}</span>
      </div>
    </div>
  );
}
