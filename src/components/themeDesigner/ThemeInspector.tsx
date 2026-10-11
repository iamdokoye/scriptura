import { useRef, useState } from "react";
import type { PresentationThemeInput } from "../../lib/tauri";
import { fileToBackgroundDataUrl } from "../../lib/imageToDataUrl";
import { FRAME_H, FRAME_W, boxKey, readabilityWarnings, type ThemeElement } from "../../lib/themeDraft";
import { ColorField, FieldLabel, InspectorSection, NumberField, RangeRow, Segmented, ToggleRow } from "./fields";

type Patch = Partial<PresentationThemeInput>;
type RefPosition = PresentationThemeInput["reference_position"];

interface Props {
  draft: PresentationThemeInput;
  onChange: (patch: Patch) => void;
  selected: ThemeElement;
  onSelect: (element: ThemeElement) => void;
  lockAspect: boolean;
  onLockAspect: (locked: boolean) => void;
}

const WEIGHTS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra bold" },
  { value: 900, label: "Black" },
];

const px = (pct: number, frame: number) => Math.round((pct / 100) * frame);
// Two decimals so a typed pixel value reads back exactly (0.01% ≈ 0.2px).
const pct = (value: number, frame: number) => Math.round((value / frame) * 10000) / 100;

export default function ThemeInspector({ draft, onChange, selected, onSelect, lockAspect, onLockAspect }: Props) {
  const k = boxKey(selected);
  const box = {
    x: draft[`${k}_x` as keyof PresentationThemeInput] as number,
    y: draft[`${k}_y` as keyof PresentationThemeInput] as number,
    width: draft[`${k}_width` as keyof PresentationThemeInput] as number,
    height: draft[`${k}_height` as keyof PresentationThemeInput] as number,
  };
  // Moving clamps position against the box's current size; resizing clamps
  // size against its current position. Mixing the two let an out-of-range X
  // shrink the width as a side effect.
  const setBox = (next: Partial<typeof box>) => {
    const merged = { ...box, ...next };
    const moving = next.x !== undefined || next.y !== undefined;
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
    const result = moving
      ? { x: clamp(merged.x, 0, 100 - box.width), y: clamp(merged.y, 0, 100 - box.height), width: box.width, height: box.height }
      : { x: box.x, y: box.y, width: clamp(merged.width, 1, 100 - box.x), height: clamp(merged.height, 1, 100 - box.y) };
    onChange({
      [`${k}_x`]: result.x,
      [`${k}_y`]: result.y,
      [`${k}_width`]: result.width,
      [`${k}_height`]: result.height,
    } as Patch);
  };

  // With the lock on, changing one dimension scales the other to keep the
  // box's current proportions in real frame pixels.
  const setWidth = (widthPx: number) => {
    const width = pct(widthPx, FRAME_W);
    if (!lockAspect) return setBox({ width });
    const aspect = (box.width * FRAME_W) / (box.height * FRAME_H);
    setBox({ width, height: ((width * FRAME_W) / aspect / FRAME_H) });
  };
  const setHeight = (heightPx: number) => {
    const height = pct(heightPx, FRAME_H);
    if (!lockAspect) return setBox({ height });
    const aspect = (box.width * FRAME_W) / (box.height * FRAME_H);
    setBox({ height, width: ((height * FRAME_H * aspect) / FRAME_W) });
  };

  const [vertical, horizontal] = draft.reference_position.split("-") as ["top" | "bottom", "left" | "center" | "right"];
  const setRefPosition = (v: string, h: string) => onChange({ reference_position: `${v}-${h}` as RefPosition });

  const horizontalValue = selected === "verse" ? draft.text_align : horizontal;
  const setHorizontal = (value: "left" | "center" | "right") =>
    selected === "verse" ? onChange({ text_align: value }) : setRefPosition(vertical ?? "bottom", value);

  const warnings = readabilityWarnings(draft);

  return (
    <aside className="panel rounded-3xl flex flex-col min-h-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-outline-variant shrink-0 space-y-3">
        <p className="font-body-ui text-[15px] font-semibold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">{selected === "verse" ? "title" : "label"}</span>
          {selected === "verse" ? "Verse" : "Reference"}
        </p>
        <Segmented
          value={selected}
          onChange={onSelect}
          options={[
            { value: "verse", label: "Verse", title: "Edit the verse text" },
            { value: "reference", label: "Reference", title: "Edit the reference label" },
          ]}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <InspectorSection title="Layout">
          <div>
            <FieldLabel>Alignment</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Segmented
                value={horizontalValue as "left" | "center" | "right"}
                onChange={setHorizontal}
                options={[
                  { value: "left", icon: "format_align_left", title: "Align left" },
                  { value: "center", icon: "format_align_center", title: "Align centre" },
                  { value: "right", icon: "format_align_right", title: "Align right" },
                ]}
              />
              {selected === "reference" && (
                <Segmented
                  value={vertical ?? "bottom"}
                  onChange={(v) => setRefPosition(v, horizontal ?? "center")}
                  options={[
                    { value: "top", icon: "vertical_align_top", title: "Place above the verse (modes 2–3)" },
                    { value: "bottom", icon: "vertical_align_bottom", title: "Place below the verse (modes 2–3)" },
                  ]}
                />
              )}
            </div>
          </div>

          <div>
            <FieldLabel>Position</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <NumberField prefix="X" value={px(box.x, FRAME_W)} min={0} max={FRAME_W} onChange={(v) => setBox({ x: pct(v, FRAME_W) })} />
              <NumberField prefix="Y" value={px(box.y, FRAME_H)} min={0} max={FRAME_H} onChange={(v) => setBox({ y: pct(v, FRAME_H) })} />
            </div>
          </div>

          <div>
            <FieldLabel>Dimension</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <NumberField prefix="W" value={px(box.width, FRAME_W)} min={1} max={FRAME_W} onChange={setWidth} />
              <NumberField prefix="H" value={px(box.height, FRAME_H)} min={1} max={FRAME_H} onChange={setHeight} />
            </div>
            <p className="mt-1.5 font-body-ui text-[11px] text-on-surface-variant/70">Measured on a {FRAME_W}×{FRAME_H} screen.</p>
          </div>

          <ToggleRow label="Lock aspect ratio" checked={lockAspect} onChange={onLockAspect} />
        </InspectorSection>

        {selected === "verse" ? (
          <>
            <InspectorSection title="Scripture">
              <div>
                <FieldLabel>Font</FieldLabel>
                <select value={draft.font_family} onChange={(e) => onChange({ font_family: e.target.value })} className="field-input">
                  <option value="system">Default</option>
                  <option value="serif">Serif</option>
                  <option value="times">Times</option>
                  <option value="mono">Mono</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Weight</FieldLabel>
                  <select value={draft.text_font_weight} onChange={(e) => onChange({ text_font_weight: Number(e.target.value) })} className="field-input">
                    {WEIGHTS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel>Size</FieldLabel>
                  <NumberField suffix="px" value={Math.round(draft.font_size)} min={12} max={300} step={2} onChange={(font_size) => onChange({ font_size })} />
                </div>
              </div>
              <div>
                <FieldLabel>Color</FieldLabel>
                <ColorField value={draft.text_color} onChange={(text_color) => onChange({ text_color })} />
              </div>
              <RangeRow label="Line height" value={draft.line_spacing} min={0} max={1} step={0.05} format={(v) => `×${(1 + v).toFixed(2)}`} onChange={(line_spacing) => onChange({ line_spacing })} />
              <RangeRow label="Letter spacing" value={draft.letter_spacing} min={0} max={1} step={0.05} format={(v) => `${(v * 0.1).toFixed(2)}em`} onChange={(letter_spacing) => onChange({ letter_spacing })} />
              <ToggleRow label="Auto-fit long verses" hint="Shrink text to stay inside its box." checked={draft.auto_layout} onChange={(auto_layout) => onChange({ auto_layout })} />
              {draft.auto_layout && (
                <RangeRow label="Smallest auto-fit size" value={draft.min_font_scale} min={0.5} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(min_font_scale) => onChange({ min_font_scale })} />
              )}
            </InspectorSection>

            <InspectorSection title="Effects">
              <ToggleRow label="Drop shadow" hint="Soft shadow behind the scripture text." checked={draft.text_shadow} onChange={(text_shadow) => onChange({ text_shadow })} />
              <ToggleRow
                label="Filled bar"
                hint="A solid band behind the verse — used for lower thirds."
                checked={!!draft.verse_box_fill}
                onChange={(on) => onChange({ verse_box_fill: on ? "rgba(11, 18, 32, 0.92)" : null })}
              />
              {draft.verse_box_fill && (
                <div>
                  <FieldLabel>Bar colour (any CSS colour, e.g. rgba)</FieldLabel>
                  <ColorField value={draft.verse_box_fill} onChange={(verse_box_fill) => onChange({ verse_box_fill })} />
                </div>
              )}
            </InspectorSection>
          </>
        ) : (
          <InspectorSection title="Reference label">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>Weight</FieldLabel>
                <select value={draft.reference_font_weight} onChange={(e) => onChange({ reference_font_weight: Number(e.target.value) })} className="field-input">
                  {WEIGHTS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Size</FieldLabel>
                <NumberField suffix="%" value={Math.round(draft.reference_font_scale * 100)} min={50} max={250} step={5} onChange={(v) => onChange({ reference_font_scale: v / 100 })} />
              </div>
            </div>
            <div>
              <FieldLabel>Color</FieldLabel>
              <ColorField value={draft.reference_color} onChange={(reference_color) => onChange({ reference_color })} />
            </div>
            <p className="font-body-ui text-[11px] text-on-surface-variant/70">In single-verse mode the label sits where you drag it; in modes 2–3 it follows the placement above.</p>
          </InspectorSection>
        )}

        <InspectorSection title="Theme">
          <div>
            <FieldLabel>Name</FieldLabel>
            <input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} className="field-input" placeholder="Sunday morning" />
          </div>
        </InspectorSection>

        <BackgroundSection draft={draft} onChange={onChange} />

        <InspectorSection title="Spacing & motion" defaultOpen={false}>
          <RangeRow label="Safe margin" value={draft.safe_margin} min={2} max={15} step={1} format={(v) => `${v}%`} onChange={(safe_margin) => onChange({ safe_margin })} />
          <RangeRow label="Scroll padding" value={draft.scroll_v_padding} min={0} max={120} step={4} format={(v) => `${v}px`} onChange={(scroll_v_padding) => onChange({ scroll_v_padding })} />
          <div>
            <FieldLabel>Verse transition</FieldLabel>
            <select value={draft.transition_type} onChange={(e) => onChange({ transition_type: e.target.value as PresentationThemeInput["transition_type"] })} className="field-input">
              <option value="fade">Fade</option>
              <option value="slide">Slide up</option>
              <option value="none">None</option>
            </select>
          </div>
          <RangeRow label="Transition duration" value={draft.transition_duration} min={0} max={1200} step={50} format={(v) => (v === 0 ? "Instant" : `${v}ms`)} onChange={(transition_duration) => onChange({ transition_duration })} />
        </InspectorSection>

        <div className="p-5">
          <div className={`rounded-xl border p-4 ${warnings.length ? "bg-tertiary-container/15 border-tertiary/30" : "bg-secondary-container/15 border-secondary/30"}`}>
            <p className="font-body-ui text-[13px] font-medium text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">{warnings.length ? "warning" : "accessibility_new"}</span>
              {warnings.length ? "Readability checks" : "Readability checks passed"}
            </p>
            {warnings.length ? (
              <ul className="mt-2 space-y-1 list-disc pl-4 font-body-ui text-[12px] leading-relaxed text-on-surface-variant">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            ) : (
              <p className="font-body-ui text-[12px] leading-relaxed text-on-surface-variant mt-1.5">Contrast, safe margins, box collisions, auto-fit and transition speed look ready for projection.</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function BackgroundSection({ draft, onChange }: { draft: PresentationThemeInput; onChange: (patch: Patch) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange({ background_image: await fileToBackgroundDataUrl(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <InspectorSection title="Background">
      <div>
        <FieldLabel>Colour</FieldLabel>
        <ColorField value={draft.background_color} onChange={(background_color) => onChange({ background_color })} />
      </div>

      <div>
        <FieldLabel>Picture</FieldLabel>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {draft.background_image ? (
          <div className="space-y-3">
            <div className="aspect-video rounded-lg border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url("${draft.background_image}")` }} />
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex-1 h-9 rounded-lg ctl font-body-ui text-[13px] text-on-surface disabled:opacity-50">
                {busy ? "Loading…" : "Replace"}
              </button>
              <button type="button" onClick={() => onChange({ background_image: null })} className="flex-1 h-9 rounded-lg ctl font-body-ui text-[13px] text-error">
                Remove
              </button>
            </div>
            <RangeRow label="Darken picture" value={draft.background_image_dim} min={0} max={0.9} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(background_image_dim) => onChange({ background_image_dim })} />
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="w-full h-20 rounded-lg border border-dashed border-outline flex flex-col items-center justify-center gap-1 text-on-surface-variant ghost disabled:opacity-50">
            <span className="material-symbols-outlined text-[22px]">add_photo_alternate</span>
            <span className="font-body-ui text-[12px]">{busy ? "Loading…" : "Choose a picture"}</span>
          </button>
        )}
        {error && <p className="mt-2 font-body-ui text-[12px] text-error" role="alert">{error}</p>}
      </div>

      <div>
        <FieldLabel>Gradient (optional CSS, used when no picture)</FieldLabel>
        <input
          value={draft.background_gradient ?? ""}
          onChange={(e) => onChange({ background_gradient: e.target.value || null })}
          className="field-input font-metadata-mono !text-[11px]"
          placeholder="linear-gradient(145deg, #172554, #000000)"
          spellCheck={false}
        />
      </div>
    </InspectorSection>
  );
}
