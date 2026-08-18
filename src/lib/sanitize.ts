/**
 * Sanitize an FTS snippet that may contain <mark>…</mark> highlight tags.
 * All other HTML is escaped. Only bare <mark> and </mark> are allowed through.
 */
export function sanitizeSnippet(raw: string): string {
  return raw
    .split(/(<\/?mark>)/i)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "<mark>" || lower === "</mark>") return part.toLowerCase();
      return part
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    })
    .join("");
}
