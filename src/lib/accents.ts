/** App accent presets. Colours themselves live in styles/accents.css (keyed by
 *  `data-accent` on <html>); indigo is the built-in default and needs no rule. */
export const ACCENTS = [
  { id: "indigo", label: "Indigo", swatch: "#5b5bf0" },
  { id: "blue",   label: "Blue",   swatch: "#2563eb" },
  { id: "teal",   label: "Teal",   swatch: "#0f766e" },
  { id: "green",  label: "Green",  swatch: "#15803d" },
  { id: "gold",   label: "Gold",   swatch: "#a16207" },
  { id: "orange", label: "Orange", swatch: "#c2410c" },
  { id: "rose",   label: "Rose",   swatch: "#e11d48" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export function isAccentId(v: unknown): v is AccentId {
  return ACCENTS.some((a) => a.id === v);
}

/** Sets or clears the root attribute the accent CSS keys off. */
export function applyAccent(id: string) {
  const root = document.documentElement;
  if (isAccentId(id) && id !== "indigo") root.setAttribute("data-accent", id);
  else root.removeAttribute("data-accent");
}
