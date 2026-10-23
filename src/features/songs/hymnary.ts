import { open as shellOpen } from "@tauri-apps/plugin-shell";

/**
 * Hymnary.org sits behind a bot challenge, so Scriptura doesn't fetch from it
 * itself. Instead this opens its search in the user's own browser; they copy a
 * public-domain text and paste it into the editor (the paste parser understands
 * hymnal-style verse numbers and refrains), keeping the page link as attribution.
 */
export function openHymnarySearch(query: string) {
  const q = query.trim();
  const url = q
    ? `https://hymnary.org/search?qu=${encodeURIComponent(`${q} in:texts`)}`
    : "https://hymnary.org/";
  return shellOpen(url).catch(() => {});
}

/** The attribution line stored in a song's notes, or null if `url` isn't a web link. */
export function sourceLine(url: string): string | null {
  const u = url.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(u)) return null;
  return `Source: ${u}`;
}

/** Add the attribution line to `notes` unless it's already there. */
export function withSource(notes: string, url: string): string {
  const line = sourceLine(url);
  if (!line || notes.includes(line)) return notes;
  return notes.trim() ? `${notes.trimEnd()}\n${line}` : line;
}
