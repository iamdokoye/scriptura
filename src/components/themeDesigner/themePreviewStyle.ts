import type { CSSProperties } from "react";
import type { PresentationThemeInput } from "../../lib/tauri";
import { FRAME_W, fontFamilyCss } from "../../lib/themeDraft";

/** px on the 1920-wide reference frame → container-width units, so previews
 * scale with whatever size they're drawn at while matching the real output. */
const cqw = (px: number) => `${(px / FRAME_W) * 100}cqw`;

export function previewBackground(theme: PresentationThemeInput): CSSProperties {
  if (theme.background_image) {
    const dim = theme.background_image_dim;
    return {
      backgroundColor: theme.background_color,
      backgroundImage: `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${theme.background_image}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: theme.background_gradient?.trim() || theme.background_color };
}

export function verseTextStyle(theme: PresentationThemeInput): CSSProperties {
  return {
    color: theme.text_color,
    fontFamily: fontFamilyCss(theme.font_family),
    fontSize: cqw(theme.font_size * theme.font_scale),
    fontWeight: theme.text_font_weight,
    textAlign: theme.text_align,
    lineHeight: 1 + theme.line_spacing,
    letterSpacing: `${theme.letter_spacing * 0.1}em`,
    textShadow: theme.text_shadow ? "0 2px 12px rgba(0,0,0,.75)" : undefined,
  };
}

/** Mirrors PresentationView's reference label size (28% of the verse size,
 * floored at 12px, then scaled by the theme). */
export function referenceTextStyle(theme: PresentationThemeInput): CSSProperties {
  const px = Math.max(12, Math.round(theme.font_size * 0.28)) * theme.reference_font_scale;
  return {
    color: theme.reference_color,
    fontSize: cqw(px),
    fontWeight: theme.reference_font_weight,
  };
}

export function referenceJustify(theme: PresentationThemeInput): CSSProperties["justifyContent"] {
  const horizontal = theme.reference_position.split("-")[1];
  return horizontal === "left" ? "flex-start" : horizontal === "right" ? "flex-end" : "center";
}
