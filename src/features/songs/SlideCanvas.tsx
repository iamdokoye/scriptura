import type { Slide } from "./slides";

/**
 * A 16:9 slide. Everything is sized in container-query units, so the same
 * component renders a thumbnail or the large preview and the text always fits.
 */
export default function SlideCanvas({
  slide, copyright, className = "",
}: { slide: Slide | null; copyright?: string; className?: string }) {
  const lines = slide ? slide.text.split("\n") : [];
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const fontCqw = Math.min(5.5, 36 / (Math.max(lines.length, 1) * 1.3), 92 / (longest * 0.55));
  return (
    <div className={`relative aspect-video overflow-hidden bg-black text-white ${className}`} style={{ containerType: "inline-size" }}>
      <div className="absolute inset-0 flex items-center justify-center px-[4cqw] pb-[6cqw] text-center">
        {slide && (
          <p
            className="m-0 whitespace-pre-wrap font-bold"
            style={{ fontSize: `${fontCqw}cqw`, lineHeight: 1.3 }}
          >
            {slide.text}
          </p>
        )}
      </div>
      {copyright && (
        <div className="absolute bottom-0 inset-x-0 px-[1.5cqw] py-[0.8cqw] bg-black/80 text-[1.6cqw] font-semibold truncate">
          {copyright}
        </div>
      )}
    </div>
  );
}
