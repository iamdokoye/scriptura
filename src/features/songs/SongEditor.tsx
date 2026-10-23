import { useState } from "react";
import { songsApi, type Song, type SongSection } from "./api";
import { cloneSection, newSection, SECTION_KINDS } from "./sections";
import { playOrder } from "./slides";
import { useSongsStore } from "./songsStore";

const STATUS_TEXT = {
  idle: "",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save",
} as const;

export default function SongEditor() {
  const { draft, update, status, saveError, remove } = useSongsStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!draft) return null;

  const sections = draft.sections;
  const effective = draft.arrangement.length > 0 ? draft.arrangement : sections.map((s) => s.key);
  const labelOf = (key: string) => sections.find((s) => s.key === key)?.label ?? key;

  function setSections(next: SongSection[], arrangement?: string[]) {
    // Keep the arrangement pointing only at sections that still exist.
    const keys = new Set(next.map((s) => s.key));
    const arr = (arrangement ?? draft!.arrangement).filter((k) => keys.has(k));
    update({ sections: next, arrangement: arr });
  }
  function patchSection(i: number, patch: Partial<SongSection>) {
    setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function moveSection(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  }
  function addSection(sec: SongSection) {
    // With a custom arrangement, a new section joins the end of it.
    const arr = draft!.arrangement.length > 0 ? [...draft!.arrangement, sec.key] : undefined;
    setSections([...sections, sec], arr);
  }
  function removeSection(i: number) {
    setSections(sections.filter((_, j) => j !== i));
  }
  function setArrangement(next: string[]) {
    // Back to the default when it matches stored order exactly.
    const isDefault = next.length === sections.length && next.every((k, i) => k === sections[i].key);
    update({ arrangement: isDefault ? [] : next });
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-6 space-y-6">
        {/* Title row */}
        <div className="flex items-start gap-3">
          <input
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Song title"
            autoFocus={draft.id === null}
            className="flex-1 min-w-0 bg-transparent outline-none font-headline-md text-headline-md text-on-surface border-b border-transparent focus:border-outline-variant pb-1"
          />
          <button
            onClick={() => update({ favourite: !draft.favourite })}
            aria-pressed={draft.favourite}
            title={draft.favourite ? "Remove from favourites" : "Add to favourites"}
            className="ghost p-1.5 rounded-md text-secondary"
          >
            <span className={`material-symbols-outlined text-[22px] ${draft.favourite ? "text-primary" : ""}`} style={{ fontVariationSettings: `'FILL' ${draft.favourite ? 1 : 0}` }}>star</span>
          </button>
          {draft.id !== null && (
            confirmDelete ? (
              <span className="flex items-center gap-1.5">
                <button onClick={() => void remove(draft.id!)} className="rounded-md px-2.5 py-1 text-[12px] bg-error text-on-error font-body-ui">Delete</button>
                <button onClick={() => setConfirmDelete(false)} className="ctl rounded-md px-2.5 py-1 text-[12px] font-body-ui text-on-surface-variant">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} title="Delete song" className="ghost p-1.5 rounded-md text-secondary">
                <span className="material-symbols-outlined text-[22px]">delete</span>
              </button>
            )
          )}
        </div>
        <p className={`-mt-4 h-4 font-metadata-mono text-[11px] ${status === "error" ? "text-error" : "text-on-surface-variant"}`}>
          {!draft.title.trim() && status === "dirty" ? "Add a title to save" : status === "error" && saveError ? saveError : STATUS_TEXT[status]}
        </p>

        {/* Details */}
        <section className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Author(s)" value={draft.author} onChange={(v) => update({ author: v })} />
          <Field label="CCLI song #" value={draft.ccli_number} onChange={(v) => update({ ccli_number: v })} />
          <Field label="Copyright" value={draft.copyright} onChange={(v) => update({ copyright: v })} className="col-span-2" />
          <Field label="Key" value={draft.key} onChange={(v) => update({ key: v })} />
          <Field label="Tempo (BPM)" value={draft.tempo} onChange={(v) => update({ tempo: v })} />
          <TagsField tags={draft.tags} onChange={(tags) => update({ tags })} />
        </section>

        {/* Paste lyrics */}
        <PasteLyrics draft={draft} />

        {/* Sections */}
        <section className="space-y-3">
          <h3 className="font-body-ui text-[13px] font-semibold text-on-surface">Lyrics</h3>
          {sections.length === 0 && (
            <p className="text-[12px] text-on-surface-variant font-body-ui">
              Paste lyrics above to split them into sections automatically, or add sections one at a time.
            </p>
          )}
          {sections.map((s, i) => (
            <div key={s.key} className="rounded-xl border border-outline-variant bg-surface-container-lowest/50">
              <div className="flex items-center gap-1 px-3 py-2 border-b border-outline-variant">
                <input
                  value={s.label}
                  onChange={(e) => patchSection(i, { label: e.target.value })}
                  aria-label="Section name"
                  className="flex-1 min-w-0 bg-transparent outline-none font-body-ui text-[13px] font-semibold text-on-surface"
                />
                <IconBtn icon="arrow_upward" title="Move up" disabled={i === 0} onClick={() => moveSection(i, -1)} />
                <IconBtn icon="arrow_downward" title="Move down" disabled={i === sections.length - 1} onClick={() => moveSection(i, 1)} />
                <IconBtn icon="content_copy" title="Duplicate" onClick={() => setSections([...sections.slice(0, i + 1), cloneSection(s, sections), ...sections.slice(i + 1)])} />
                <IconBtn icon="close" title="Remove section" onClick={() => removeSection(i)} />
              </div>
              <textarea
                value={s.lyrics}
                onChange={(e) => patchSection(i, { lyrics: e.target.value })}
                rows={Math.max(3, s.lyrics.split("\n").length + 1)}
                placeholder="One line of lyrics per line. A blank line forces a new slide."
                spellCheck
                className="w-full resize-none bg-transparent outline-none px-3 py-2.5 font-body-ui text-[14px] leading-relaxed text-on-surface"
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            {SECTION_KINDS.map((k) => (
              <button key={k.prefix} onClick={() => addSection(newSection(k, sections))} className="ctl rounded-md px-2.5 py-1 text-[12px] font-body-ui text-on-surface-variant">
                + {k.name}
              </button>
            ))}
          </div>
        </section>

        {/* Arrangement */}
        {sections.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-body-ui text-[13px] font-semibold text-on-surface">Play order</h3>
              {draft.arrangement.length > 0 && (
                <button onClick={() => update({ arrangement: [] })} className="text-[12px] font-body-ui text-secondary hover:text-primary">Reset to section order</button>
              )}
            </div>
            <ol className="flex flex-wrap gap-1.5">
              {playOrder(draft).map((s, i) => (
                <li key={i} className="ctl-active rounded-md pl-2.5 pr-1 py-1 text-[12px] font-body-ui flex items-center gap-1">
                  {labelOf(s.key)}
                  <button
                    aria-label={`Remove ${s.label} from play order`}
                    onClick={() => setArrangement(effective.filter((_, j) => j !== i))}
                    className="material-symbols-outlined text-[14px] opacity-70 hover:opacity-100"
                  >close</button>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-on-surface-variant font-body-ui">Add to order:</span>
              {sections.map((s) => (
                <button key={s.key} onClick={() => setArrangement([...effective, s.key])} className="ctl rounded-md px-2 py-0.5 text-[11px] font-body-ui text-on-surface-variant">
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <Field label="Notes" value={draft.notes} onChange={(v) => update({ notes: v })} multiline />
      </div>
    </div>
  );
}

function PasteLyrics({ draft }: { draft: Song }) {
  const update = useSongsStore((s) => s.update);
  const [open, setOpen] = useState(draft.sections.length === 0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setError(null);
    try {
      const [parsed] = await songsApi.parseImport(draft.title || "Untitled", text);
      // Fill details only where the user hasn't already typed something.
      update({
        title: draft.title.trim() ? draft.title : parsed.title,
        author: draft.author || parsed.author,
        copyright: draft.copyright || parsed.copyright,
        ccli_number: draft.ccli_number || parsed.ccli_number,
        sections: parsed.sections,
        arrangement: parsed.arrangement,
      });
      setText("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="ctl rounded-md px-3 py-1.5 text-[12px] font-body-ui text-on-surface-variant flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[15px]">content_paste</span>
        Paste lyrics
      </button>
    );
  }
  return (
    <section className="rounded-xl border border-outline-variant p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-body-ui text-[13px] font-semibold text-on-surface">Paste lyrics</h3>
        {draft.sections.length > 0 && (
          <button onClick={() => setOpen(false)} className="text-[12px] font-body-ui text-secondary hover:text-primary">Close</button>
        )}
      </div>
      <p className="text-[12px] text-on-surface-variant font-body-ui leading-relaxed">
        Paste the full lyrics. Blank lines separate sections; headings like “Verse 1” or “[Chorus]” are recognised, and repeated blocks reuse one section.
        {draft.sections.length > 0 && " This replaces the current lyrics."}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="field w-full rounded-md px-3 py-2 text-[13px] font-body-ui text-on-surface outline-none resize-y"
      />
      {error && <p className="text-[12px] text-error font-body-ui">{error}</p>}
      <button disabled={!text.trim()} onClick={() => void apply()} className="btn-primary rounded-md px-3 py-1.5 text-[12px] font-body-ui disabled:opacity-40">
        Split into sections
      </button>
    </section>
  );
}

function TagsField({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  // Edit as raw text so typing a comma doesn't get eaten mid-word.
  const [raw, setRaw] = useState(tags.join(", "));
  return (
    <Field
      label="Tags"
      value={raw}
      onChange={(v) => {
        setRaw(v);
        onChange(v.split(",").map((t) => t.trim()).filter(Boolean));
      }}
    />
  );
}

function Field({ label, value, onChange, className = "", multiline }: {
  label: string; value: string; onChange: (v: string) => void; className?: string; multiline?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="field w-full rounded-md px-3 py-2 text-[13px] font-body-ui text-on-surface outline-none resize-y" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="field-input" />
      )}
    </label>
  );
}

function IconBtn({ icon, title, onClick, disabled }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="ghost p-1 rounded-md text-secondary disabled:opacity-30 disabled:pointer-events-none">
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}
