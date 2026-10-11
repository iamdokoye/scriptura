import { useEffect, useMemo, useRef, useState } from "react";
import type { PresentationTheme, PresentationThemeInput } from "../../lib/tauri";
import { THEME_PRESETS, type ThemePreset } from "../../lib/themeDraft";
import { previewBackground, referenceJustify, referenceTextStyle, verseTextStyle } from "./themePreviewStyle";

interface Props {
  themes: PresentationTheme[];
  selectedId: string | null;
  /** The theme currently applied to the live output. */
  liveThemeId: string | null;
  creatingNew: boolean;
  busy: boolean;
  onSelect: (theme: PresentationTheme) => void;
  /** A preset to start from, or "copy" to duplicate the live theme. */
  onNew: (from: ThemePreset | "copy") => void;
  onUseLive: (theme: PresentationTheme) => void;
  onMakeDefault: (theme: PresentationTheme) => void;
  onDelete: (theme: PresentationTheme) => void;
}

export default function ThemeLibrary({ themes, selectedId, liveThemeId, creatingNew, busy, onSelect, onNew, onUseLive, onMakeDefault, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? themes.filter((t) => t.name.toLowerCase().includes(q)) : themes;
  }, [themes, query]);

  return (
    <aside className="panel rounded-3xl flex flex-col min-h-0 overflow-hidden">
      <div className="p-4 space-y-4 shrink-0">
        <NewThemeMenu active={creatingNew} onNew={onNew} />

        <div>
          <p className="field-label">All themes ({themes.length})</p>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant pointer-events-none">search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search themes" className="field-input !pl-10" />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
        {creatingNew && (
          <div className="rounded-2xl border border-dashed border-primary/60 px-3 py-4 text-center font-body-ui text-[12px] text-primary">
            New theme — unsaved
          </div>
        )}
        {filtered.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            selected={theme.id === selectedId && !creatingNew}
            live={theme.id === liveThemeId}
            busy={busy}
            onSelect={() => onSelect(theme)}
            onUseLive={() => onUseLive(theme)}
            onMakeDefault={() => onMakeDefault(theme)}
            onDelete={() => onDelete(theme)}
          />
        ))}
        {filtered.length === 0 && !creatingNew && (
          <p className="px-2 py-6 text-center font-body-ui text-[12px] text-on-surface-variant">No themes match “{query}”.</p>
        )}
      </div>
    </aside>
  );
}

function ThemeCard({ theme, selected, live, busy, onSelect, onUseLive, onMakeDefault, onDelete }: {
  theme: PresentationTheme;
  selected: boolean;
  live: boolean;
  busy: boolean;
  onSelect: () => void;
  onUseLive: () => void;
  onMakeDefault: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    setConfirming(false);
  }

  return (
    <div
      ref={ref}
      className={`relative rounded-2xl overflow-hidden border-2 transition-colors ${selected ? "border-primary" : "border-transparent hover:border-outline-variant"}`}
    >
      <div className="relative">
        <button onClick={onSelect} className="block w-full text-left" aria-pressed={selected}>
          <ThemeThumb theme={theme} />
        </button>
        {(theme.is_default || live) && (
          <div className="absolute top-2 left-2 flex items-center gap-1 pointer-events-none">
            {theme.is_default && (
              <span className="w-5 h-5 rounded-full bg-black/55 flex items-center justify-center" title="Default theme">
                <span className="material-symbols-outlined text-[13px] text-white">star</span>
              </span>
            )}
            {live && <span className="px-1.5 h-5 rounded-full bg-error text-on-error font-metadata-mono text-[9px] uppercase tracking-wide flex items-center">Live</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pr-2 bg-surface-container-low">
        <button onClick={onSelect} className="flex-1 min-w-0 pl-3 py-2.5 text-left">
          <span className="block font-body-ui text-[13px] font-medium text-on-surface truncate">{theme.name}</span>
        </button>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1 rounded-md ghost text-on-surface-variant shrink-0"
          aria-label={`Actions for ${theme.name}`}
          aria-haspopup="menu"
        >
          <span className="material-symbols-outlined text-[18px]">more_horiz</span>
        </button>
      </div>

      {menuOpen && (
        <div role="menu" className="absolute right-2 bottom-12 z-20 min-w-[170px] glass rounded-xl py-1 overflow-hidden">
          <MenuItem icon="cast" disabled={live} onClick={() => { onUseLive(); closeMenu(); }}>{live ? "Currently live" : "Use live"}</MenuItem>
          <MenuItem icon="star" disabled={theme.is_default || busy} onClick={() => { onMakeDefault(); closeMenu(); }}>{theme.is_default ? "Default theme" : "Make default"}</MenuItem>
          {!theme.is_builtin && (
            confirming ? (
              <MenuItem icon="delete_forever" danger disabled={busy} onClick={() => { onDelete(); closeMenu(); }}>Confirm delete</MenuItem>
            ) : (
              <MenuItem icon="delete" danger disabled={busy} onClick={() => setConfirming(true)}>Delete…</MenuItem>
            )
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, danger, disabled, onClick, children }: { icon: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left font-body-ui text-[13px] ghost disabled:opacity-40 disabled:cursor-not-allowed ${danger ? "text-error" : "text-on-surface"}`}
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
      {children}
    </button>
  );
}

/** Miniature render of a theme: sized in container-width units so it scales
 * with the card and matches the canvas and the real output. */
function ThemeThumb({ theme }: { theme: PresentationThemeInput }) {
  return (
    <div className="aspect-video relative overflow-hidden" style={{ ...previewBackground(theme), containerType: "inline-size" }}>
      <div
        className="absolute flex items-center"
        style={{
          left: `${theme.verse_box_x}%`, top: `${theme.verse_box_y}%`,
          width: `${theme.verse_box_width}%`, height: `${theme.verse_box_height}%`,
          background: theme.verse_box_fill || undefined,
          padding: theme.verse_box_fill ? "0 1.2%" : undefined,
          overflow: "hidden",
        }}
      >
        <span className="w-full" style={verseTextStyle(theme)}>In the beginning God created the heaven and the earth.</span>
      </div>
      <div
        className="absolute flex items-center font-metadata-mono uppercase"
        style={{
          left: `${theme.reference_box_x}%`, top: `${theme.reference_box_y}%`,
          width: `${theme.reference_box_width}%`, height: `${theme.reference_box_height}%`,
          letterSpacing: "0.12em", justifyContent: referenceJustify(theme), ...referenceTextStyle(theme),
        }}
      >
        Genesis 1:1
      </div>
    </div>
  );
}

function NewThemeMenu({ active, onNew }: { active: boolean; onNew: Props["onNew"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(from: ThemePreset | "copy") {
    setOpen(false);
    onNew(from);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-full flex items-center justify-center gap-2 h-10 rounded-xl font-body-ui text-[13px] font-medium ${active || open ? "ctl-active" : "ctl text-on-surface"}`}
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
        New theme
        <span className="material-symbols-outlined text-[18px] -mr-1">expand_more</span>
      </button>

      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full mt-2 z-30 glass glass-strong rounded-2xl p-1.5 max-h-[min(60vh,380px)] overflow-y-auto">
          <p className="px-3 pt-2 pb-1 field-label !mb-0">Start from</p>
          {THEME_PRESETS.map((preset) => (
            <button key={preset.id} role="menuitem" onClick={() => choose(preset)} className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left ghost">
              <span className="material-symbols-outlined text-[20px] text-primary mt-0.5">{preset.icon}</span>
              <span className="min-w-0">
                <span className="block font-body-ui text-[13px] font-medium text-on-surface">{preset.label}</span>
                <span className="block font-body-ui text-[11px] leading-snug text-on-surface-variant">{preset.description}</span>
              </span>
            </button>
          ))}
          <div className="my-1 border-t border-outline-variant" />
          <button role="menuitem" onClick={() => choose("copy")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left ghost">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">content_copy</span>
            <span className="font-body-ui text-[13px] text-on-surface">Copy of the live theme</span>
          </button>
        </div>
      )}
    </div>
  );
}
