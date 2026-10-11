import { useEffect, useState, type ReactNode } from "react";

export function InspectorSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-outline-variant last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left ghost"
        aria-expanded={open}
      >
        <span className="font-body-ui text-[13px] font-semibold text-on-surface">{title}</span>
        <span className={`material-symbols-outlined text-[18px] text-on-surface-variant transition-transform ${open ? "" : "-rotate-90"}`}>expand_more</span>
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </section>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="field-label">{children}</span>;
}

/** Number input with an inline prefix (X / Y / W / H) and optional suffix.
 * Keeps its own text while focused so the field can be cleared and retyped;
 * commits any valid number as you type and snaps back on blur. */
export function NumberField({ prefix, suffix, value, min, max, step = 1, onChange }: {
  prefix?: string;
  suffix?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  // Re-sync when the value changes underneath us (undo, clamping, a locked
  // aspect ratio) — but never while the field is empty mid-edit, or it could
  // not be cleared and retyped.
  useEffect(() => {
    if (!focused || (text.trim() !== "" && Number(text) !== value)) setText(String(value));
  }, [value, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(raw: string) {
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() === "" || Number.isNaN(parsed)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    onChange(clamped);
  }

  return (
    <label className="field-input flex items-center gap-2 !px-3 focus-within:border-primary">
      {prefix && <span className="font-metadata-mono text-[11px] text-on-surface-variant shrink-0">{prefix}</span>}
      <input
        inputMode="decimal"
        value={text}
        step={step}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setText(String(value)); }}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const next = value + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1);
            commit(String(Math.round(next * 100) / 100));
          }
        }}
        className="w-full min-w-0 bg-transparent outline-none font-body-ui text-[13px] text-on-surface"
      />
      {suffix && <span className="font-metadata-mono text-[11px] text-on-surface-variant shrink-0">{suffix}</span>}
    </label>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  icon?: string;
  label?: string;
  title: string;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: SegmentOption<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex gap-0.5 p-0.5 rounded-lg ctl" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-label={option.title}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`h-8 min-w-8 px-2 rounded-md flex items-center justify-center text-[12px] font-body-ui transition-colors ${
            option.value === value ? "ctl-active" : "ghost text-on-surface-variant"
          }`}
        >
          {option.icon && <span className="material-symbols-outlined text-[18px]">{option.icon}</span>}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="field-input flex items-center gap-2 !px-1.5 focus-within:border-primary">
      <span className="relative w-7 h-7 rounded-md border border-outline-variant overflow-hidden shrink-0" style={{ background: value }}>
        <input
          type="color"
          value={/^#[\da-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label="Pick colour"
        />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full min-w-0 bg-transparent outline-none font-metadata-mono text-[12px] uppercase text-on-surface"
      />
    </div>
  );
}

export function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span>
        <span className="block font-body-ui text-[13px] text-on-surface">{label}</span>
        {hint && <span className="block font-body-ui text-[11px] text-on-surface-variant">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-primary w-4 h-4 shrink-0" />
    </label>
  );
}

export function RangeRow({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="field-label flex justify-between"><span>{label}</span><span>{format(value)}</span></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </label>
  );
}
