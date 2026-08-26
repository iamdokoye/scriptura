import { useEffect, useMemo, useRef, useState } from "react";
import SideNav from "../components/SideNav";
import { api, type PresentationTheme, type PresentationThemeInput } from "../lib/tauri";
import { emitPresentation } from "../lib/presentation";
import { useAppStore } from "../store/app";

const STARTER_THEME: PresentationThemeInput = {
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
};

function toInput(theme: PresentationTheme): PresentationThemeInput {
  const { id: _id, is_default: _isDefault, is_builtin: _isBuiltin, created_at: _createdAt, updated_at: _updatedAt, ...input } = theme;
  return input;
}

export default function CustomizationStudio() {
  const {
    presentationThemes, activePresentationTheme, hydratePresentationThemes, setActivePresentationTheme,
    presentationActive, primaryModule, currentRef, parallelModule, parallelMode, selectedStrongs,
    displayPrefs, readingFontSize,
  } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(activePresentationTheme?.id ?? null);
  const [draft, setDraft] = useState<PresentationThemeInput>(STARTER_THEME);
  const [newTheme, setNewTheme] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const selectedTheme = useMemo(
    () => presentationThemes.find((theme) => theme.id === selectedId) ?? null,
    [presentationThemes, selectedId],
  );

  useEffect(() => {
    if (presentationThemes.length === 0) {
      api.listPresentationThemes().then(hydratePresentationThemes).catch(() => {});
    }
  }, [presentationThemes.length, hydratePresentationThemes]);

  useEffect(() => {
    if (selectedTheme && !newTheme) setDraft(toInput(selectedTheme));
  }, [selectedTheme, newTheme]);

  // ReadingView normally broadcasts live state. The Studio is a separate view,
  // so it also broadcasts while it is open—otherwise “Use live” would not take
  // effect until the operator returned to the Bible screen.
  useEffect(() => {
    if (!presentationActive || !primaryModule) return;
    emitPresentation({
      book: currentRef.book,
      chapter: currentRef.chapter,
      verse: currentRef.verse,
      primaryModule,
      parallelModule,
      parallelMode,
      selectedStrongs,
      displayPrefs,
      readingFontSize,
      presentationTheme: activePresentationTheme,
    });
  }, [presentationActive, primaryModule, currentRef, parallelModule, parallelMode, selectedStrongs, displayPrefs, readingFontSize, activePresentationTheme]);

  function chooseTheme(theme: PresentationTheme) {
    setSelectedId(theme.id);
    setNewTheme(false);
    setDraft(toInput(theme));
    setMessage(null);
    setConfirmingDelete(false);
  }

  function beginNewTheme() {
    setSelectedId(null);
    setDraft({
      ...STARTER_THEME,
      name: `Copy of ${activePresentationTheme?.name ?? "Scripture Theme"}`,
      ...(activePresentationTheme ? toInput(activePresentationTheme) : {}),
    });
    setNewTheme(true);
    setMessage(null);
    setConfirmingDelete(false);
  }

  async function refresh(activeId?: string) {
    const themes = await api.listPresentationThemes();
    hydratePresentationThemes(themes);
    const next = themes.find((theme) => theme.id === activeId) ?? themes.find((theme) => theme.is_default) ?? themes[0] ?? null;
    setActivePresentationTheme(next);
    if (next) setSelectedId(next.id);
  }

  async function save() {
    if (!draft.name.trim()) {
      setMessage("Give this theme a name before saving.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const theme = newTheme
        ? await api.createPresentationTheme({ ...draft, name: draft.name.trim() })
        : await api.updatePresentationTheme(selectedTheme!.id, { ...draft, name: draft.name.trim() });
      setNewTheme(false);
      await refresh(theme.id);
      setMessage("Saved. The live preview now uses this theme.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault() {
    if (!selectedTheme) return;
    setSaving(true);
    try {
      const theme = await api.setDefaultPresentationTheme(selectedTheme.id);
      await refresh(theme.id);
      setMessage("Set as the default Scripture presentation theme.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedTheme || selectedTheme.is_builtin) return;
    // window.confirm() is unreliable inside Tauri's embedded webview (most
    // visibly on macOS/WKWebView, which doesn't consistently support the
    // native confirm dialog) — it can silently no-op instead of prompting,
    // which made clicking Delete look like it did nothing at all. An
    // inline confirmation step doesn't depend on the webview's native
    // dialog support.
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    setSaving(true);
    try {
      await api.deletePresentationTheme(selectedTheme.id);
      await refresh();
      setNewTheme(false);
      setMessage("Theme deleted.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  }

  const preview = draft;
  const previewBackground = preview.background_gradient?.trim() || preview.background_color;

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
        <header className="px-8 py-6 border-b border-outline-variant bg-surface shrink-0 flex items-start justify-between gap-5">
          <div>
            <p className="font-metadata-mono text-[11px] tracking-widest uppercase text-primary mb-1">Customization Studio</p>
            <h1 className="font-display-lg text-display-lg text-on-surface">Presentation themes</h1>
            <p className="font-body-ui text-[14px] text-on-surface-variant mt-2 max-w-2xl">
              Design once, then apply a readable Scripture layout live or make it the default for every service.
            </p>
          </div>
          <button onClick={beginNewTheme} className="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-DEFAULT bg-primary text-on-primary font-body-ui text-[13px] hover:opacity-90">
            <span className="material-symbols-outlined text-[18px]">add</span>
            New theme
          </button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[250px_minmax(0,1fr)] overflow-hidden">
          <aside className="border-r border-outline-variant bg-surface-container-lowest overflow-y-auto p-3 space-y-2">
            <p className="px-2 pt-1 font-metadata-mono text-[10px] uppercase tracking-widest text-on-surface-variant">Theme library</p>
            {presentationThemes.map((theme) => {
              const active = theme.id === selectedId;
              return (
                <button key={theme.id} onClick={() => chooseTheme(theme)} className={`w-full text-left p-2.5 rounded-DEFAULT border transition-colors ${active ? "border-primary bg-primary-container/15" : "border-transparent hover:bg-surface-container-low"}`}>
                  <div className="h-9 rounded mb-2 border border-white/10" style={{ background: theme.background_gradient || theme.background_color }} />
                  <div className="flex items-center gap-1.5">
                    <span className="font-body-ui text-[13px] font-medium text-on-surface truncate">{theme.name}</span>
                    {theme.is_default && <span className="material-symbols-outlined text-[14px] text-primary" title="Default theme">star</span>}
                  </div>
                  <p className="font-metadata-mono text-[10px] text-on-surface-variant mt-0.5">{theme.text_align} · {Math.round(theme.font_scale * 100)}%</p>
                </button>
              );
            })}
          </aside>

          <div className="min-w-0 overflow-y-auto p-6 lg:p-8">
            <div className="grid xl:grid-cols-[minmax(300px,440px)_minmax(360px,1fr)] gap-8 max-w-6xl">
              <section className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-headline-sm text-headline-sm text-on-surface">{newTheme ? "New theme" : "Theme editor"}</p>
                    <p className="font-body-ui text-[12px] text-on-surface-variant mt-1">Changes stay local until you save.</p>
                  </div>
                  {!newTheme && selectedTheme?.is_default && <span className="px-2 py-1 rounded bg-primary-container/15 text-primary font-metadata-mono text-[10px] uppercase tracking-wide">Default</span>}
                </div>

                <label className="block">
                  <span className="field-label">Theme name</span>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="field-input" placeholder="Sunday morning" />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <ColorField label="Background" value={draft.background_color} onChange={(background_color) => setDraft({ ...draft, background_color })} />
                  <ColorField label="Scripture text" value={draft.text_color} onChange={(text_color) => setDraft({ ...draft, text_color })} />
                  <ColorField label="Reference" value={draft.reference_color} onChange={(reference_color) => setDraft({ ...draft, reference_color })} />
                  <label className="block">
                    <span className="field-label">Font</span>
                    <select value={draft.font_family} onChange={(e) => setDraft({ ...draft, font_family: e.target.value })} className="field-input">
                      <option value="system">Default</option><option value="serif">Serif</option><option value="times">Times</option><option value="mono">Mono</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="field-label">Background gradient <span className="normal-case tracking-normal">(optional CSS gradient)</span></span>
                  <input value={draft.background_gradient ?? ""} onChange={(e) => setDraft({ ...draft, background_gradient: e.target.value || null })} className="field-input font-metadata-mono text-[11px]" placeholder="linear-gradient(145deg, #172554, #000000)" />
                </label>

                <div className="grid grid-cols-2 gap-5">
                  <label className="block">
                    <span className="field-label">Text alignment</span>
                    <div className="flex gap-1">
                      {(["left", "center", "right"] as const).map((text_align) => <button key={text_align} onClick={() => setDraft({ ...draft, text_align })} className={`flex-1 py-1.5 rounded-DEFAULT text-[12px] capitalize ${draft.text_align === text_align ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"}`}>{text_align}</button>)}
                    </div>
                  </label>
                  <label className="flex items-end gap-2 pb-1.5 cursor-pointer">
                    <input type="checkbox" checked={draft.text_shadow} onChange={(e) => setDraft({ ...draft, text_shadow: e.target.checked })} className="accent-primary" />
                    <span className="font-body-ui text-[13px] text-on-surface">Text shadow</span>
                  </label>
                </div>

                <div>
                  <span className="field-label">Reference label position</span>
                  <div className="grid grid-cols-3 gap-1.5 max-w-[280px]">
                    {(["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const).map((reference_position) => (
                      <button key={reference_position} onClick={() => setDraft({ ...draft, reference_position })} className={`py-1.5 rounded-DEFAULT text-[11px] capitalize ${draft.reference_position === reference_position ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"}`}>
                        {reference_position.replace("-", " · ").replace("center", "middle")}
                      </button>
                    ))}
                  </div>
                </div>

                <RangeField label="Text scale" value={draft.font_scale} min={0.7} max={1.5} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(font_scale) => setDraft({ ...draft, font_scale })} />
                <RangeField label="Verse weight" value={draft.text_font_weight} min={100} max={900} step={100} format={(value) => `${value}`} onChange={(text_font_weight) => setDraft({ ...draft, text_font_weight })} />
                <RangeField label="Reference label size" value={draft.reference_font_scale} min={0.7} max={1.8} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(reference_font_scale) => setDraft({ ...draft, reference_font_scale })} />
                <RangeField label="Reference label weight" value={draft.reference_font_weight} min={100} max={900} step={100} format={(value) => `${value}`} onChange={(reference_font_weight) => setDraft({ ...draft, reference_font_weight })} />
                <RangeField label="Safe margin" value={draft.safe_margin} min={2} max={15} step={1} format={(value) => `${value}%`} onChange={(safe_margin) => setDraft({ ...draft, safe_margin })} />
                <div className="pt-1 border-t border-outline-variant space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><span className="field-label">Auto-layout</span><p className="font-body-ui text-[11px] text-on-surface-variant">Shrink long verses inside their text box.</p></div>
                    <input type="checkbox" checked={draft.auto_layout} onChange={(e) => setDraft({ ...draft, auto_layout: e.target.checked })} className="accent-primary" />
                  </div>
                  <RangeField label="Smallest auto-fit size" value={draft.min_font_scale} min={0.5} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(min_font_scale) => setDraft({ ...draft, min_font_scale })} />
                  <label className="block"><span className="field-label">Verse transition</span><select value={draft.transition_type} onChange={(e) => setDraft({ ...draft, transition_type: e.target.value as PresentationThemeInput["transition_type"] })} className="field-input"><option value="fade">Fade</option><option value="slide">Slide up</option><option value="none">None</option></select></label>
                  <RangeField label="Transition duration" value={draft.transition_duration} min={0} max={1200} step={50} format={(value) => value === 0 ? "Instant" : `${value}ms`} onChange={(transition_duration) => setDraft({ ...draft, transition_duration })} />
                </div>

                {message && <p className="rounded-DEFAULT px-3 py-2 bg-surface-container-low text-on-surface-variant font-body-ui text-[12px]">{message}</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={save} disabled={saving} className="px-3.5 py-2 rounded-DEFAULT bg-primary text-on-primary font-body-ui text-[13px] disabled:opacity-60">{saving ? "Saving…" : "Save theme"}</button>
                  {!newTheme && <button onClick={() => setActivePresentationTheme(selectedTheme)} className="px-3.5 py-2 rounded-DEFAULT bg-secondary-container text-on-secondary-container font-body-ui text-[13px]">Use live</button>}
                  {!newTheme && !selectedTheme?.is_default && <button onClick={makeDefault} disabled={saving} className="px-3.5 py-2 rounded-DEFAULT border border-outline-variant text-on-surface font-body-ui text-[13px]">Make default</button>}
                  {/* Delete stays available even for the active/default theme —
                      only the built-in Midnight theme is permanently protected.
                      Deleting the active theme falls back to Midnight (see
                      delete_presentation_theme). */}
                  {!newTheme && !selectedTheme?.is_builtin && (
                    confirmingDelete ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-body-ui text-[12px] text-on-surface-variant">Delete this theme?</span>
                        <button onClick={remove} disabled={saving} className="px-2.5 py-1.5 rounded-DEFAULT bg-error text-on-error font-body-ui text-[12px] disabled:opacity-60">{saving ? "Deleting…" : "Yes, delete"}</button>
                        <button onClick={() => setConfirmingDelete(false)} disabled={saving} className="px-2.5 py-1.5 rounded-DEFAULT border border-outline-variant text-on-surface font-body-ui text-[12px]">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={remove} disabled={saving} className="px-2.5 py-2 rounded-DEFAULT text-error hover:bg-error-container/30" title="Delete theme"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                    )
                  )}
                </div>
              </section>

              <section>
                <p className="font-headline-sm text-headline-sm text-on-surface mb-3">Live preview</p>
                <LayoutPreview preview={preview} background={previewBackground} onChange={setDraft} />
                <AccessibilityChecker theme={preview} />
                <div className="mt-4 p-4 rounded-DEFAULT bg-surface-container-low border border-outline-variant">
                  <p className="font-body-ui text-[13px] text-on-surface font-medium">How this applies</p>
                  <p className="font-body-ui text-[12px] leading-relaxed text-on-surface-variant mt-1.5">“Use live” applies the selected theme immediately to the presentation window. “Make default” applies it to future sessions too. Current verse context and reading controls remain independent.</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

type LayoutBox = "verse" | "reference";

function LayoutPreview({ preview, background, onChange }: { preview: PresentationThemeInput; background: string; onChange: (next: PresentationThemeInput) => void }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);

  function beginDrag(event: React.PointerEvent, box: LayoutBox, resize: boolean) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const prefix = box === "verse" ? "verse_box" : "reference_box";
    const start = {
      x: preview[`${prefix}_x` as keyof PresentationThemeInput] as number,
      y: preview[`${prefix}_y` as keyof PresentationThemeInput] as number,
      width: preview[`${prefix}_width` as keyof PresentationThemeInput] as number,
      height: preview[`${prefix}_height` as keyof PresentationThemeInput] as number,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
    const minWidth = box === "verse" ? 20 : 16;
    const minHeight = box === "verse" ? 18 : 8;
    const move = (pointer: PointerEvent) => {
      const dx = ((pointer.clientX - start.pointerX) / bounds.width) * 100;
      const dy = ((pointer.clientY - start.pointerY) / bounds.height) * 100;
      let x = start.x;
      let y = start.y;
      let width = start.width;
      let height = start.height;
      if (resize) {
        width = Math.max(minWidth, Math.min(100 - start.x, start.width + dx));
        height = Math.max(minHeight, Math.min(100 - start.y, start.height + dy));
      } else {
        x = Math.max(0, Math.min(100 - width, start.x + dx));
        y = Math.max(0, Math.min(100 - height, start.y + dy));
      }
      onChange({ ...preview, [`${prefix}_x`]: Math.round(x * 10) / 10, [`${prefix}_y`]: Math.round(y * 10) / 10, [`${prefix}_width`]: Math.round(width * 10) / 10, [`${prefix}_height`]: Math.round(height * 10) / 10 });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  const boxStyle = (box: LayoutBox): React.CSSProperties => {
    const prefix = box === "verse" ? "verse_box" : "reference_box";
    return {
      left: `${preview[`${prefix}_x` as keyof PresentationThemeInput]}%`, top: `${preview[`${prefix}_y` as keyof PresentationThemeInput]}%`,
      width: `${preview[`${prefix}_width` as keyof PresentationThemeInput]}%`, height: `${preview[`${prefix}_height` as keyof PresentationThemeInput]}%`,
    };
  };
  const [_, horizontal] = preview.reference_position.split("-");

  return <div ref={canvasRef} className="aspect-video rounded-xl border border-outline-variant shadow-lg overflow-hidden relative" style={{ background, color: preview.text_color }}>
    <EditableBox label="Verse text box" style={boxStyle("verse")} onPointerDown={(event) => beginDrag(event, "verse", false)} onResizePointerDown={(event) => beginDrag(event, "verse", true)}>
      <p className="leading-tight h-full flex items-center" style={{ fontFamily: fontFamilyCss(preview.font_family), fontSize: `${3.1 * preview.font_scale}vw`, fontWeight: preview.text_font_weight, textAlign: preview.text_align, textShadow: preview.text_shadow ? "0 2px 12px rgba(0,0,0,.75)" : undefined }}>For God so loved the world, that he gave his only begotten Son.</p>
    </EditableBox>
    <EditableBox label="Reference text box" style={boxStyle("reference")} onPointerDown={(event) => beginDrag(event, "reference", false)} onResizePointerDown={(event) => beginDrag(event, "reference", true)}>
      <p className="h-full flex items-center font-metadata-mono uppercase tracking-[0.18em]" style={{ color: preview.reference_color, fontSize: `${0.95 * preview.reference_font_scale}vw`, fontWeight: preview.reference_font_weight, justifyContent: horizontal === "left" ? "flex-start" : horizontal === "right" ? "flex-end" : "center", textAlign: horizontal as React.CSSProperties["textAlign"] }}>John 3:16 · KJV</p>
    </EditableBox>
    <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/30 font-metadata-mono text-[10px] text-white/70 pointer-events-none">Drag boxes · resize corners</div>
  </div>;
}

function EditableBox({ label, style, children, onPointerDown, onResizePointerDown }: { label: string; style: React.CSSProperties; children: React.ReactNode; onPointerDown: (event: React.PointerEvent) => void; onResizePointerDown: (event: React.PointerEvent) => void }) {
  return <div className="absolute border border-dashed border-white/45 bg-black/5 cursor-move p-2 select-none" style={style} onPointerDown={onPointerDown} title={`${label}: drag to move`}>
    <span className="absolute -top-4 left-0 px-1 rounded bg-black/45 text-white/80 font-metadata-mono text-[9px] tracking-wide">{label}</span>
    {children}
    <button type="button" aria-label={`Resize ${label}`} onPointerDown={onResizePointerDown} className="absolute -right-1 -bottom-1 w-3 h-3 rounded-sm bg-primary border border-white cursor-nwse-resize" />
  </div>;
}

function AccessibilityChecker({ theme }: { theme: PresentationThemeInput }) {
  const warnings: string[] = [];
  const textContrast = contrastRatio(theme.text_color, theme.background_color);
  const referenceContrast = contrastRatio(theme.reference_color, theme.background_color);
  if (textContrast !== null && textContrast < 4.5) warnings.push(`Scripture text contrast is ${textContrast.toFixed(1)}:1; aim for 4.5:1 or higher.`);
  if (referenceContrast !== null && referenceContrast < 3) warnings.push(`Reference contrast is ${referenceContrast.toFixed(1)}:1; aim for 3:1 or higher.`);
  if (theme.background_gradient) warnings.push("Gradient is enabled; contrast is checked against the base background colour only.");
  if (theme.safe_margin < 4) warnings.push("Safe margin is below 4%; edge-mounted projectors may crop content.");
  if (boxesOverlap(theme)) warnings.push("Verse and reference text boxes overlap.");
  if (theme.auto_layout && theme.min_font_scale < 0.6) warnings.push("Auto-layout can shrink below 60%, which may be hard to read from the back of a room.");
  if (theme.transition_duration > 800) warnings.push("A transition over 800ms may make fast verse changes feel sluggish.");
  return <div className={`mt-4 p-4 rounded-DEFAULT border ${warnings.length ? "bg-tertiary-container/15 border-tertiary/30" : "bg-secondary-container/15 border-secondary/30"}`}>
    <p className="font-body-ui text-[13px] font-medium text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">{warnings.length ? "warning" : "accessibility_new"}</span>{warnings.length ? "Readability checks" : "Readability checks passed"}</p>
    {warnings.length ? <ul className="mt-2 space-y-1 list-disc pl-4 font-body-ui text-[12px] leading-relaxed text-on-surface-variant">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="font-body-ui text-[12px] leading-relaxed text-on-surface-variant mt-1.5">Contrast, safe margins, box collisions, auto-fit, and transition speed look ready for projection.</p>}
  </div>;
}

function boxesOverlap(theme: PresentationThemeInput) {
  return theme.verse_box_x < theme.reference_box_x + theme.reference_box_width
    && theme.verse_box_x + theme.verse_box_width > theme.reference_box_x
    && theme.verse_box_y < theme.reference_box_y + theme.reference_box_height
    && theme.verse_box_y + theme.verse_box_height > theme.reference_box_y;
}

function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    const raw = match[1].length === 3 ? match[1].split("").map((part) => part + part).join("") : match[1];
    const channels = [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const first = luminance(a); const second = luminance(b);
  return first === null || second === null ? null : (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="field-label">{label}</span><div className="flex gap-2"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-10 h-9 p-1 rounded border border-outline-variant bg-surface" /><input value={value} onChange={(e) => onChange(e.target.value)} className="field-input min-w-0 font-metadata-mono text-[11px]" /></div></label>;
}

function RangeField({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void }) {
  return <label className="block"><span className="field-label flex justify-between"><span>{label}</span><span>{format(value)}</span></span><input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" /></label>;
}

function fontFamilyCss(font: string) {
  return ({ system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", serif: "Georgia, 'Palatino Linotype', serif", times: "'Times New Roman', Times, serif", mono: "'Courier New', monospace" } as Record<string, string>)[font] ?? "system-ui, sans-serif";
}
