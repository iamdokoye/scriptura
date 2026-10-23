import type { Song } from "./api";
import { Field, TagsField } from "./fields";
import { playOrder } from "./slides";

export default function DetailsPane({ song, onChange }: { song: Song; onChange: (p: Partial<Song>) => void }) {
  const sections = song.sections;
  const effective = song.arrangement.length > 0 ? song.arrangement : sections.map((s) => s.key);
  const labelOf = (key: string) => sections.find((s) => s.key === key)?.label ?? key;

  function setArrangement(next: string[]) {
    // Back to the default when it matches stored order exactly.
    const isDefault = next.length === sections.length && next.every((k, i) => k === sections[i].key);
    onChange({ arrangement: isDefault ? [] : next });
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <Field label="Author(s)" value={song.author} onChange={(v) => onChange({ author: v })} />
      <Field label="Copyright" value={song.copyright} onChange={(v) => onChange({ copyright: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="CCLI song #" value={song.ccli_number} onChange={(v) => onChange({ ccli_number: v })} />
        <Field label="Key" value={song.key} onChange={(v) => onChange({ key: v })} />
        <Field label="Tempo (BPM)" value={song.tempo} onChange={(v) => onChange({ tempo: v })} />
      </div>
      <TagsField tags={song.tags} onChange={(tags) => onChange({ tags })} />

      {sections.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="field-label !mb-0">Play order</span>
            {song.arrangement.length > 0 && (
              <button onClick={() => onChange({ arrangement: [] })} className="text-[11px] font-body-ui text-secondary hover:text-primary">Reset</button>
            )}
          </div>
          <ol className="flex flex-wrap gap-1.5">
            {playOrder(song).map((s, i) => (
              <li key={i} className="ctl-active rounded-md pl-2 pr-1 py-0.5 text-[12px] font-body-ui flex items-center gap-0.5">
                {labelOf(s.key)}
                <button
                  aria-label={`Remove ${s.label} from play order`}
                  onClick={() => setArrangement(effective.filter((_, j) => j !== i))}
                  className="material-symbols-outlined text-[14px] opacity-70 hover:opacity-100"
                >close</button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-on-surface-variant font-body-ui">Add:</span>
            {sections.map((s) => (
              <button key={s.key} onClick={() => setArrangement([...effective, s.key])} className="ctl rounded-md px-2 py-0.5 text-[11px] font-body-ui text-on-surface-variant">
                {s.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <Field label="Notes" value={song.notes} onChange={(v) => onChange({ notes: v })} multiline />
    </div>
  );
}
