/** "free" → "Scriptura Free"; any other plan id is capitalised. */
export function planName(plan: string | null | undefined): string {
  const id = (plan ?? "free").trim() || "free";
  return `Scriptura ${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}
