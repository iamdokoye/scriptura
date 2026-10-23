import { useMemo } from "react";
import OutputPreview from "../../components/OutputPreview";
import { useSongsLive, previewSlides } from "./liveStore";
import OutputStrip from "./OutputStrip";
import { useSongPresentState } from "./useSongOutput";

export default function PreviewPanel({ stage }: { stage: { w: number; h: number } }) {
  const { previewSong, previewIndex, setPreviewIndex, goLive, live } = useSongsLive();
  const slides = useMemo(() => previewSlides(previewSong), [previewSong]);
  const index = Math.min(previewIndex, Math.max(0, slides.length - 1));
  const slide = slides[index];

  const outputState = useSongPresentState(
    slide ? { text: slide.text, label: slide.label, copyright: previewSong?.copyright || undefined } : null,
  );
  const alreadyLive = !!live && live.songId === previewSong?.id && live.index === index
    && live.slides[index]?.text === slide?.text;

  return (
    <section className="flex-1 min-w-0 flex flex-col overflow-hidden panel rounded-3xl">
      <div className="shrink-0 flex items-center gap-3 px-3.5 py-2 border-b border-outline-variant">
        <h2 className="min-w-0 flex-1 font-body-ui text-[13px] font-bold text-on-surface uppercase tracking-wide truncate">
          Preview{" "}
          {previewSong && <span className="font-normal normal-case tracking-normal text-on-surface-variant">— {previewSong.title}</span>}
        </h2>
        <button
          onClick={() => goLive()}
          disabled={!slide || alreadyLive}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md btn-primary font-body-ui text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          title="Send the previewed slide live (or double-click it)"
        >
          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
          Go Live
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5">
        {slides.length === 0 && (
          <p className="p-4 text-center font-body-ui text-[12px] text-on-surface-variant">
            {previewSong ? "This song has no lyrics yet." : "Select a scheduled song to preview its slides."}
          </p>
        )}
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => setPreviewIndex(i)}
              onDoubleClick={() => goLive(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreviewIndex(i); } }}
              title="Click to preview • Double-click to send live"
              className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer select-none ${
                active ? "row-selected border-primary/40 shadow-sm" : "border-outline-variant/50 hover:bg-surface-container-low"
              }`}
            >
              <span className={`font-metadata-mono text-[11px] shrink-0 mt-0.5 ${active ? "text-primary font-bold" : "text-on-surface-variant"}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
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
        title="Preview Output"
        label={previewSong ? `${previewSong.title}${slide ? ` — ${slide.label}` : ""}` : "Nothing selected"}
        slide={index}
        slides={slides.length}
        onSlide={setPreviewIndex}
        stage={stage}
      >
        <OutputPreview state={outputState} chapter={null} parallelChapter={null} stage={stage} outputOpen />
      </OutputStrip>
    </section>
  );
}
