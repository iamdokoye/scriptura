import { useEffect, useRef, useState } from "react";
import type { ChapterText } from "../lib/tauri";
import type { PresentState } from "../lib/presentation";
import { PresentationStage, StageSizeContext, type StageSize } from "../views/PresentationView";

interface Props {
  state: PresentState;
  chapter: ChapterText | null;
  parallelChapter: ChapterText | null;
  stage: StageSize;
  /** False while the output window is closed — the preview then shows what would go out. */
  outputOpen: boolean;
}

/**
 * A miniature of the real output screen: the same PresentationStage the
 * output window renders, laid out at the output's actual size and scaled down
 * to fit, so wrapping, shrinking and verse parts match the live feed exactly.
 */
export default function OutputPreview({ state, chapter, parallelChapter, stage, outputOpen }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = avail.w && avail.h ? Math.min(avail.w / stage.w, avail.h / stage.h) : 0;

  return (
    <div ref={hostRef} className="w-full h-full flex items-center justify-center">
      {scale > 0 && (
        <div
          className="relative overflow-hidden rounded-lg bg-black shrink-0"
          style={{ width: stage.w * scale, height: stage.h * scale }}
          aria-label="Live output preview"
        >
          <div
            className="absolute top-0 left-0 pointer-events-none select-none"
            style={{ width: stage.w, height: stage.h, transform: `scale(${scale})`, transformOrigin: "top left" }}
            aria-hidden
          >
            <StageSizeContext.Provider value={stage}>
              <PresentationStage state={state} chapter={chapter} parallelChapter={parallelChapter} />
            </StageSizeContext.Provider>
          </div>
          {!outputOpen && (
            <span className="absolute bottom-1 right-1.5 font-metadata-mono text-[9px] uppercase tracking-widest text-white/50 bg-black/60 rounded px-1.5 py-0.5">
              Output closed
            </span>
          )}
        </div>
      )}
    </div>
  );
}
