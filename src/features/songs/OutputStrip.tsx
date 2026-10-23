/** Bottom strip of the Preview and Live panels: a thumbnail of the output, what it shows, and slide arrows. */
export default function OutputStrip({ title, label, slide, slides, onSlide, stage, children }: {
  title: string;
  label: string;
  slide: number;
  slides: number;
  onSlide: (n: number) => void;
  stage: { w: number; h: number };
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0 border-t border-outline-variant px-4 py-3">
      <p className="font-body-ui text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-3">{title}</p>
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded-md overflow-hidden" style={{ width: "clamp(110px, 40%, 144px)", aspectRatio: `${stage.w} / ${stage.h}` }}>
          {children}
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <p className="font-body-ui text-[12px] text-on-surface truncate" title={label}>{label}</p>
          <p className="font-body-ui text-[12px] text-on-surface-variant whitespace-nowrap">Slide {slides === 0 ? 0 : slide + 1} of {slides}</p>
          <div className="flex ctl rounded-md overflow-hidden self-start">
            <button onClick={() => onSlide(Math.max(0, slide - 1))} disabled={slide <= 0} className="px-2 py-1 disabled:opacity-35 hover:bg-on-surface/10" aria-label="Previous slide">
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button onClick={() => onSlide(Math.min(slides - 1, slide + 1))} disabled={slide >= slides - 1} className="px-2 py-1 border-l border-outline-variant disabled:opacity-35 hover:bg-on-surface/10" aria-label="Next slide">
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
