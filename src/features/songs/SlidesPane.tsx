import { useEffect, useRef } from "react";
import SlideCanvas from "./SlideCanvas";
import { sectionColor } from "./sections";
import type { Slide } from "./slides";

export default function SlidesPane({ slides, selected, onSelect, copyright }: {
  slides: Slide[]; selected: number; onSelect: (i: number) => void; copyright?: string;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { selectedRef.current?.scrollIntoView({ block: "nearest" }); }, [selected]);

  if (slides.length === 0) {
    return <p className="p-4 text-[12px] font-body-ui text-on-surface-variant">Slides appear here as you add lyrics.</p>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      {slides.map((s, i) => (
        <button
          key={i}
          ref={i === selected ? selectedRef : undefined}
          onClick={() => onSelect(i)}
          aria-current={i === selected}
          className={`block w-full text-left rounded-lg overflow-hidden border-2 transition-colors ${i === selected ? "border-primary" : "border-transparent hover:border-outline-variant"}`}
        >
          <div className="flex items-center gap-2 px-2 py-1 text-white font-body-ui text-[12px]" style={{ background: sectionColor(s.sectionKey) }}>
            <span className="font-metadata-mono opacity-80">{i + 1}</span>
            <span className="font-semibold truncate">{s.label}{s.parts > 1 ? ` · ${s.part}/${s.parts}` : ""}</span>
          </div>
          <SlideCanvas slide={s} copyright={copyright} />
        </button>
      ))}
    </div>
  );
}
