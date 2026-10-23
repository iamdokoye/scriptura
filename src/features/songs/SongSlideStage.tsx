import type { SongSlidePayload } from "../../lib/presentation";
import type { PresentationTheme } from "../../lib/tauri";

const FONT_FAMILY_CSS: Record<string, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  serif: `Georgia, "Palatino Linotype", Palatino, serif`,
  times: `"Times New Roman", Times, serif`,
  mono: `"Courier New", Courier, monospace`,
};

/**
 * What the output screen shows for a song slide. Laid out against the stage's
 * CSS-pixel size (the real window, or the console thumbnail's virtual one), with
 * the font shrunk until the lines fit — styled by the active presentation theme
 * so songs and scripture share a look.
 */
export default function SongSlideStage({ slide, theme, stage }: {
  slide: SongSlidePayload;
  theme: PresentationTheme | null;
  stage: { w: number; h: number };
}) {
  const lines = slide.text.split("\n");
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const count = Math.max(lines.length, 1);
  const base = stage.h * 0.085 * (theme?.font_scale ?? 1);
  const fontSize = Math.max(
    12,
    Math.min(base, (stage.h * 0.72) / (count * 1.3), (stage.w * 0.9) / (longest * 0.52)),
  );

  const image = theme?.background_image;
  const dim = theme?.background_image_dim ?? 0;
  const backdrop: React.CSSProperties = image
    ? {
        backgroundColor: theme?.background_color || "#000000",
        backgroundImage: `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${image}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: theme?.background_gradient || theme?.background_color || "#000000" };

  return (
    <div className="h-full w-full relative overflow-hidden select-none" style={backdrop}>
      <div className="absolute inset-0 flex items-center justify-center" style={{ padding: `0 ${stage.w * 0.05}px ${stage.h * 0.06}px` }}>
        <p
          className="m-0 whitespace-pre-wrap"
          style={{
            fontSize,
            lineHeight: 1.3,
            textAlign: (theme?.text_align as React.CSSProperties["textAlign"]) ?? "center",
            color: theme?.text_color ?? "#ffffff",
            fontFamily: FONT_FAMILY_CSS[theme?.font_family ?? "system"] ?? FONT_FAMILY_CSS.system,
            fontWeight: theme?.text_font_weight ?? 700,
            textShadow: theme?.text_shadow ? "0 2px 12px rgba(0,0,0,.75)" : undefined,
          }}
        >
          {slide.text}
        </p>
      </div>
      {slide.copyright && (
        <p
          className="absolute bottom-0 inset-x-0 m-0 truncate text-center"
          style={{ fontSize: Math.max(10, stage.h * 0.022), padding: `${stage.h * 0.012}px ${stage.w * 0.03}px`, color: "rgba(255,255,255,0.65)" }}
        >
          {slide.copyright}
        </p>
      )}
    </div>
  );
}
