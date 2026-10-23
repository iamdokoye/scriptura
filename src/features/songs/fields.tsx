import { useState } from "react";

export function Field({ label, value, onChange, className = "", multiline }: {
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

export function TagsField({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  // Edited as raw text so typing a comma doesn't get eaten mid-word.
  const [raw, setRaw] = useState(tags.join(", "));
  return (
    <Field
      label="Collections (comma separated)"
      value={raw}
      onChange={(v) => {
        setRaw(v);
        onChange(v.split(",").map((t) => t.trim()).filter(Boolean));
      }}
    />
  );
}

export function IconBtn({ icon, title, onClick, disabled }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="ghost p-1 rounded-md text-secondary disabled:opacity-30 disabled:pointer-events-none">
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}
