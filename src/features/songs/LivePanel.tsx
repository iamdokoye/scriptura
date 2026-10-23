import { useAppStore } from "../../store/app";
import OutputPreview from "../../components/OutputPreview";
import { useSongsLive } from "./liveStore";
import OutputStrip from "./OutputStrip";
import { liveSlidePayload, useSongPresentState } from "./useSongOutput";

export default function LivePanel({ width, stage }: { width: number; stage: { w: number; h: number } }) {
  const { live, setLiveIndex, clearLive } = useSongsLive();
  const presentationActive = useAppStore((s) => s.presentationActive);
  const liveBlack = useAppStore((s) => s.liveBlack);
  const liveEmergency = useAppStore((s) => s.liveEmergency);
  const overridden = liveBlack || liveEmergency;
  const outputState = useSongPresentState(liveSlidePayload(live));
  const slide = live?.slides[live.index];

  return (
    <section style={{ width }} className="shrink-0 flex flex-col overflow-hidden panel rounded-3xl">
      <div className="shrink-0 flex items-center gap-3 px-3.5 py-2.5 border-b border-outline-variant">
        <h2 className="font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide">Live</h2>
        {presentationActive && (
          <span className="flex items-center gap-1 font-metadata-mono text-[9px] uppercase tracking-widest text-error">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
            On air
          </span>
        )}
        <span className="flex-1" />
        {live && (
          <button onClick={clearLive} className="ghost px-1.5 py-0.5 rounded font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant" title="Clear this panel (use BLACK in the top bar to blank the screen)">
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5">
        {overridden && (
          <div className="px-3 py-2 text-center ctl rounded-lg">
            <p className="font-body-ui text-[12px] text-on-surface-variant">
              {liveEmergency ? "Standby screen is showing on the output." : "Output is cut to black."}
            </p>
          </div>
        )}
        {!live && <p className="p-4 text-center font-body-ui text-[12px] text-on-surface-variant">Nothing live. Send a slide from Preview.</p>}
        {live?.slides.map((s, i) => {
          const active = i === live.index;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => setLiveIndex(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLiveIndex(i); } }}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer select-none ${
                active ? "row-selected border-primary/30" : "border-outline-variant/60 hover:bg-surface-container-low"
              } ${overridden ? "opacity-50" : ""}`}
            >
              <span className={`font-metadata-mono text-[11px] shrink-0 mt-0.5 ${active ? "text-primary font-bold" : "text-on-surface-variant"}`}>{i + 1}</span>
              <div className="min-w-0">
                <p className={`font-body-ui text-[12px] font-bold ${active ? "text-primary" : "text-on-surface"}`}>
                  {s.label}{s.parts > 1 ? ` (${s.part}/${s.parts})` : ""}
                </p>
                <p className="font-body-ui text-[13px] leading-snug text-on-surface mt-0.5 whitespace-pre-line">{s.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      <OutputStrip
        title="Live Output"
        label={live ? `${live.title}${slide ? ` — ${slide.label}` : ""}` : "Nothing live"}
        slide={live?.index ?? 0}
        slides={live?.slides.length ?? 0}
        onSlide={setLiveIndex}
        stage={stage}
      >
        <OutputPreview state={outputState} chapter={null} parallelChapter={null} stage={stage} outputOpen={presentationActive} />
      </OutputStrip>
    </section>
  );
}
