import type { PresentationTheme, PresentationThemeInput } from "./tauri";

/** Reference frame the designer shows positions/sizes in — same 1920×1080 frame
 * the split logic treats the output as. Boxes are stored as % of the screen. */
export const FRAME_W = 1920;
export const FRAME_H = 1080;

export const STARTER_THEME: PresentationThemeInput = {
  name: "New Scripture Theme",
  background_color: "#101827",
  background_gradient: "linear-gradient(145deg, #172554 0%, #101827 55%, #065f46 100%)",
  text_color: "#ffffff",
  reference_color: "#b8c4d8",
  font_family: "system",
  text_align: "center",
  font_scale: 1,
  text_font_weight: 600,
  reference_font_scale: 1,
  reference_font_weight: 500,
  safe_margin: 5,
  text_shadow: true,
  reference_position: "bottom-center",
  verse_box_x: 10,
  verse_box_y: 24,
  verse_box_width: 80,
  verse_box_height: 48,
  reference_box_x: 10,
  reference_box_y: 76,
  reference_box_width: 80,
  reference_box_height: 10,
  auto_layout: true,
  min_font_scale: 0.65,
  transition_type: "fade",
  transition_duration: 300,
  scroll_v_padding: 32,
  font_size: 56,
  line_spacing: 0.3,
  letter_spacing: 0,
  background_image: null,
  background_image_dim: 0.35,
  verse_box_fill: null,
};

export function toInput(theme: PresentationTheme): PresentationThemeInput {
  const { id: _id, is_default: _d, is_builtin: _b, created_at: _c, updated_at: _u, ...input } = theme;
  return input;
}

export type ThemeElement = "verse" | "reference";

export function boxKey(element: ThemeElement) {
  return element === "verse" ? "verse_box" : "reference_box";
}

export function fontFamilyCss(font: string) {
  return ({
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    serif: "Georgia, 'Palatino Linotype', serif",
    times: "'Times New Roman', Times, serif",
    mono: "'Courier New', monospace",
  } as Record<string, string>)[font] ?? "system-ui, sans-serif";
}

export function boxesOverlap(theme: PresentationThemeInput) {
  return theme.verse_box_x < theme.reference_box_x + theme.reference_box_width
    && theme.verse_box_x + theme.verse_box_width > theme.reference_box_x
    && theme.verse_box_y < theme.reference_box_y + theme.reference_box_height
    && theme.verse_box_y + theme.verse_box_height > theme.reference_box_y;
}

export function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    const raw = match[1].length === 3 ? match[1].split("").map((part) => part + part).join("") : match[1];
    const channels = [0, 2, 4]
      .map((index) => parseInt(raw.slice(index, index + 2), 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const first = luminance(a);
  const second = luminance(b);
  return first === null || second === null ? null : (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Readability warnings shown under the inspector — pure, so it's testable. */
export function readabilityWarnings(theme: PresentationThemeInput): string[] {
  const warnings: string[] = [];
  const textContrast = contrastRatio(theme.text_color, theme.background_color);
  const referenceContrast = contrastRatio(theme.reference_color, theme.background_color);
  if (textContrast !== null && textContrast < 4.5) warnings.push(`Scripture text contrast is ${textContrast.toFixed(1)}:1; aim for 4.5:1 or higher.`);
  if (referenceContrast !== null && referenceContrast < 3) warnings.push(`Reference contrast is ${referenceContrast.toFixed(1)}:1; aim for 3:1 or higher.`);
  if (theme.background_image) warnings.push("A picture background is in use; contrast is checked against the base colour only, so check the text is legible over the photo.");
  if (theme.background_gradient) warnings.push("Gradient is enabled; contrast is checked against the base background colour only.");
  if (theme.safe_margin < 4) warnings.push("Safe margin is below 4%; edge-mounted projectors may crop content.");
  if (boxesOverlap(theme)) warnings.push("Verse and reference text boxes overlap.");
  if (theme.auto_layout && theme.min_font_scale < 0.6) warnings.push("Auto-layout can shrink below 60%, which may be hard to read from the back of a room.");
  if (theme.transition_duration > 800) warnings.push("A transition over 800ms may make fast verse changes feel sluggish.");
  return warnings;
}

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  theme: PresentationThemeInput;
}

/** Starting points offered by "New theme". Each is a complete theme the user
 * then tweaks — they are templates, not stored rows. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "plain",
    label: "Plain background",
    description: "One solid colour, centred text. Quiet and easy to read.",
    icon: "crop_square",
    theme: {
      ...STARTER_THEME,
      name: "Plain background",
      background_color: "#000000",
      background_gradient: null,
      text_shadow: false,
      font_size: 64,
    },
  },
  {
    id: "lower-third",
    label: "Lower third",
    description: "A bar along the bottom with the reference above it, for overlaying video. Chroma-key green background.",
    icon: "bottom_panel_open",
    theme: {
      ...STARTER_THEME,
      name: "Lower third",
      background_color: "#00b140",
      background_gradient: null,
      text_align: "left",
      text_shadow: false,
      text_font_weight: 700,
      font_size: 44,
      safe_margin: 4,
      reference_position: "top-left",
      reference_color: "#ffffff",
      reference_font_weight: 700,
      reference_font_scale: 0.9,
      verse_box_x: 4,
      verse_box_y: 78,
      verse_box_width: 92,
      verse_box_height: 16,
      verse_box_fill: "rgba(11, 18, 32, 0.92)",
      reference_box_x: 4,
      reference_box_y: 71,
      reference_box_width: 34,
      reference_box_height: 6,
      min_font_scale: 0.6,
    },
  },
  {
    id: "picture",
    label: "Picture background",
    description: "Your own photo behind the text, darkened so it stays readable.",
    icon: "image",
    theme: {
      ...STARTER_THEME,
      name: "Picture background",
      background_color: "#000000",
      background_gradient: null,
      background_image: null,
      background_image_dim: 0.4,
      text_font_weight: 700,
      font_size: 64,
    },
  },
];
