import { useMemo } from "react";
import type { Song } from "./api";
import { buildSlides, MAX_LINES, MIN_LINES } from "./slides";

export default function SlidePreview({
  song, maxLines, onMaxLines,
}: { song: Song; maxLines: number; onMaxLines: (n: number) => void }) {
  const slides = useMemo(() => buildSlides(song, maxLines), [song.sections, song.arrangement, maxLines]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="w-[340px] shrink-0 flex flex-col border-l border-outline-variant bg-surface-container-lowest/40">
      <div className="px-4 py-3 border-b border-outline-variant flex items-center justify-between gap-3">
        <div>
          <h3 className="font-body-ui text-[13px] font-semibold text-on-surface">Slides</h3>
          <p className="font-metadata-mono text-[10px] text-on-surface-variant">{slides.length} total</p>
        </div>
        <label className="flex items-center gap-2 font-body-ui text-[12px] text-on-surface-variant" title="Longer sections split into more slides">
          Max lines
          <select
            value={maxLines}
            onChange={(e) => onMaxLines(Number(e.target.value))}
            className="field rounded-md h-7 px-1.5 text-[12px] text-on-surface bg-transparent"
          >
            {Array.from({ length: MAX_LINES - MIN_LINES + 1 }, (_, i) => MIN_LINES + i).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {slides.length === 0 && (
          <p className="text-[12px] text-on-surface-variant font-body-ui">Slides appear here as you add lyrics.</p>
        )}
        {slides.map((s, i) => (
          <figure key={i} className="m-0">
            <div className="aspect-video rounded-lg bg-[#111] text-white flex items-center justify-center px-4 text-center overflow-hidden">
              <p className="whitespace-pre-wrap text-[13px] leading-snug">{s.text}</p>
            </div>
            <figcaption className="mt-1 flex justify-between font-metadata-mono text-[10px] text-on-surface-variant">
              <span>{s.label}{s.parts > 1 ? ` (${s.part}/${s.parts})` : ""}</span>
              <span>{i + 1}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </aside>
  );
}
