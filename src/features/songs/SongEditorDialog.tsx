import { useEffect, useMemo, useState } from "react";
import DetailsPane from "./DetailsPane";
import PasteLyrics from "./PasteLyrics";
import SlideCanvas from "./SlideCanvas";
import SlidesPane from "./SlidesPane";
import WordsPane from "./WordsPane";
import { isBool, isLines, MAX_LINES_KEY, usePref } from "./prefs";
import { buildSlides, DEFAULT_MAX_LINES, MAX_LINES, MIN_LINES } from "./slides";
import { selectDirty, useSongsStore } from "./songsStore";

export default function SongEditorDialog() {
  const draft = useSongsStore((s) => s.draft);
  const dirty = useSongsStore(selectDirty);
  const saving = useSongsStore((s) => s.saving);
  const saveError = useSongsStore((s) => s.saveError);
  const { update, apply, ok, cancel } = useSongsStore.getState();

  const [leftTab, setLeftTab] = useState<"words" | "slides">("words");
  const [rightTab, setRightTab] = useState<"details" | "slide">("details");
  const [pasting, setPasting] = useState(false);
  const [selected, setSelected] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [maxLines, setMaxLines] = usePref(MAX_LINES_KEY, DEFAULT_MAX_LINES, isLines);
  const [showCopyright, setShowCopyright] = usePref("scriptura.songs.showCopyright", true, isBool);

  const slides = useMemo(
    () => (draft ? buildSlides(draft, maxLines) : []),
    [draft?.sections, draft?.arrangement, maxLines], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const index = Math.min(selected, Math.max(0, slides.length - 1));
  const slide = slides[index] ?? null;

  function requestCancel() {
    if (dirty) setConfirmDiscard(true);
    else cancel();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); requestCancel(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!draft) return null;

  const firstSlideOf = (key: string) => Math.max(0, slides.findIndex((s) => s.sectionKey === key));

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && requestCancel()}>
      <div role="dialog" aria-modal="true" aria-label="Song Editor" className="w-[min(1280px,96vw)] h-[min(820px,94vh)] flex flex-col glass glass-strong rounded-3xl overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant shrink-0">
          <input
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Song title"
            autoFocus={draft.id === null}
            aria-label="Song title"
            className="field w-80 max-w-[40%] rounded-md h-9 px-3 font-body-ui text-[14px] text-on-surface outline-none"
          />
          <button
            onClick={() => update({ favourite: !draft.favourite })}
            aria-pressed={draft.favourite}
            title={draft.favourite ? "Remove from favourites" : "Add to favourites"}
            className="ghost p-1.5 rounded-md text-secondary"
          >
            <span className={`material-symbols-outlined text-[22px] ${draft.favourite ? "text-primary" : ""}`} style={{ fontVariationSettings: `'FILL' ${draft.favourite ? 1 : 0}` }}>star</span>
          </button>
          <button
            onClick={() => { setLeftTab("words"); setPasting((p) => !p); }}
            aria-pressed={pasting}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-body-ui ${pasting ? "ctl-active" : "ctl text-on-surface-variant"}`}
          >
            <span className="material-symbols-outlined text-[16px]">content_paste</span>Paste lyrics
          </button>
          <span className="flex-1" />
          <h2 className="font-body-ui text-[13px] text-on-surface-variant">Song Editor{dirty ? " — unsaved" : ""}</h2>
        </header>

        <div className="flex flex-1 min-h-0">
          {/* Words / Slides */}
          <section className="w-[360px] shrink-0 flex flex-col border-r border-outline-variant min-h-0">
            <Tabs value={leftTab} onChange={setLeftTab} tabs={[["words", "Words"], ["slides", "Slides"]]} />
            {leftTab === "words" ? (
              pasting
                ? <PasteLyrics song={draft} onChange={update} onDone={() => setPasting(false)} />
                : <WordsPane song={draft} onChange={update} onFocusSection={(k) => setSelected(firstSlideOf(k))} />
            ) : (
              <SlidesPane slides={slides} selected={index} onSelect={setSelected} copyright={showCopyright ? draft.copyright : undefined} />
            )}
          </section>

          {/* Preview */}
          <section className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3 p-6 bg-surface-container-lowest/30">
            <div className="w-full max-w-[780px] rounded-sm overflow-hidden shadow-lg ring-1 ring-outline-variant">
              <SlideCanvas slide={slide} copyright={showCopyright ? draft.copyright : undefined} />
            </div>
            <div className="flex items-center gap-2 font-body-ui text-[12px] text-on-surface-variant">
              <button onClick={() => setSelected(Math.max(0, index - 1))} disabled={index <= 0} aria-label="Previous slide" className="ghost p-1 rounded-md disabled:opacity-30">
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
              <span>{slides.length ? `Slide ${index + 1} of ${slides.length}${slide ? ` · ${slide.label}` : ""}` : "No slides"}</span>
              <button onClick={() => setSelected(Math.min(slides.length - 1, index + 1))} disabled={index >= slides.length - 1} aria-label="Next slide" className="ghost p-1 rounded-md disabled:opacity-30">
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
          </section>

          {/* Details / Slide settings */}
          <section className="w-[320px] shrink-0 flex flex-col border-l border-outline-variant min-h-0">
            <Tabs value={rightTab} onChange={setRightTab} tabs={[["details", "Details"], ["slide", "Slide"]]} />
            {rightTab === "details" ? (
              <DetailsPane song={draft} onChange={update} />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
                <label className="block">
                  <span className="field-label">Max lines per slide</span>
                  <select value={maxLines} onChange={(e) => setMaxLines(Number(e.target.value))} className="field-input">
                    {Array.from({ length: MAX_LINES - MIN_LINES + 1 }, (_, i) => MIN_LINES + i).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span className="block mt-1.5 text-[11px] font-body-ui text-on-surface-variant leading-relaxed">
                    Longer sections split into evenly sized slides. A blank line in the lyrics always starts a new slide.
                  </span>
                </label>
                <label className="flex items-center gap-2 font-body-ui text-[13px] text-on-surface">
                  <input type="checkbox" checked={showCopyright} onChange={(e) => setShowCopyright(e.target.checked)} className="accent-primary" />
                  Show copyright line
                </label>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-3 px-4 py-3 border-t border-outline-variant shrink-0">
          <p className={`flex-1 min-w-0 truncate font-body-ui text-[12px] ${saveError ? "text-error" : "text-on-surface-variant"}`}>
            {saveError ?? (confirmDiscard ? "Discard your changes?" : "")}
          </p>
          {confirmDiscard ? (
            <>
              <button onClick={cancel} className="rounded-md px-4 py-1.5 text-[13px] font-body-ui bg-error text-on-error">Discard</button>
              <button onClick={() => setConfirmDiscard(false)} className="ctl rounded-md px-4 py-1.5 text-[13px] font-body-ui text-on-surface">Keep editing</button>
            </>
          ) : (
            <>
              <button onClick={() => void apply()} disabled={saving || !dirty} className="ctl rounded-md px-4 py-1.5 text-[13px] font-body-ui text-on-surface disabled:opacity-40">Apply</button>
              <button onClick={() => void ok()} disabled={saving} className="btn-primary rounded-md px-4 py-1.5 text-[13px] font-body-ui disabled:opacity-40">OK</button>
              <button onClick={requestCancel} className="ctl rounded-md px-4 py-1.5 text-[13px] font-body-ui text-on-surface">Cancel</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: [T, string][] }) {
  return (
    <div role="tablist" className="flex shrink-0 border-b border-outline-variant">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`flex-1 py-2.5 font-body-ui text-[14px] border-b-2 transition-colors ${value === id ? "border-primary text-primary font-semibold" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
