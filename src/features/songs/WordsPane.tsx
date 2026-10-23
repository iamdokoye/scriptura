import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Song, SongSection } from "./api";
import { IconBtn } from "./fields";
import { cloneSection, newSection, SECTION_KINDS, sectionColor } from "./sections";

/** Section blocks, each a coloured label bar over its editable lyrics. */
export default function WordsPane({ song, onChange, onFocusSection }: {
  song: Song;
  onChange: (patch: Partial<Song>) => void;
  onFocusSection: (key: string) => void;
}) {
  const sections = song.sections;
  const [menu, setMenu] = useState(false);
  const areas = useRef(new Map<string, HTMLTextAreaElement>());
  // A section to move the caret into once it has rendered (after a split or auto-create).
  const pendingFocus = useRef<string | null>(null);
  const menuWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuWrap.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  // Keep the play order pointing only at sections that still exist.
  function setSections(next: SongSection[], arrangement = song.arrangement) {
    const keys = new Set(next.map((s) => s.key));
    onChange({ sections: next, arrangement: arrangement.filter((k) => keys.has(k)) });
  }
  const patch = (i: number, p: Partial<SongSection>) => setSections(sections.map((s, j) => (j === i ? { ...s, ...p } : s)));
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  }
  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    const el = areas.current.get(key);
    el?.focus();
    el?.setSelectionRange(0, 0);
  }, [sections]);

  const verse = SECTION_KINDS[0];

  /** Down arrow with the caret already at the very end of the last section starts a new one. */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    const el = e.currentTarget;
    const collapsed = el.selectionStart === el.selectionEnd;
    if (e.key === "ArrowDown" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
        && collapsed && el.selectionStart === el.value.length
        && i === sections.length - 1 && el.value.trim() !== "") {
      e.preventDefault();
      const sec = newSection(verse, sections);
      pendingFocus.current = sec.key;
      add(sec);
      return;
    }
    // Cmd/Ctrl+Enter breaks the text at the caret into a new section.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const before = el.value.slice(0, el.selectionStart).replace(/\s+$/, "");
      const after = el.value.slice(el.selectionEnd).replace(/^\s+/, "");
      const sec = { ...newSection(verse, sections), lyrics: after };
      const next = sections.map((s, j) => (j === i ? { ...s, lyrics: before } : s));
      next.splice(i + 1, 0, sec);
      // Keep a custom play order in step: the new section follows the one it was split from.
      const at = song.arrangement.indexOf(sections[i].key);
      const arrangement = at >= 0
        ? [...song.arrangement.slice(0, at + 1), sec.key, ...song.arrangement.slice(at + 1)]
        : song.arrangement;
      pendingFocus.current = sec.key;
      setSections(next, arrangement);
    }
  }

  function add(sec: SongSection) {
    // With a custom play order, a new section joins its end.
    setSections([...sections, sec], song.arrangement.length ? [...song.arrangement, sec.key] : song.arrangement);
    setMenu(false);
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {sections.length === 0 && (
          <p className="px-1 py-2 text-[12px] font-body-ui text-on-surface-variant leading-relaxed">
            No lyrics yet. Use “Paste lyrics” above to split a whole song into sections automatically, or add a section below.
          </p>
        )}
        {sections.map((s, i) => (
          <div key={s.key} className="group rounded-lg overflow-hidden border border-outline-variant bg-surface-container-lowest/60">
            <div className="flex items-center gap-1 pl-3 pr-1 py-1 text-white" style={{ background: sectionColor(s.label) }}>
              <input
                value={s.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                aria-label="Section name"
                className="flex-1 min-w-0 bg-transparent outline-none font-body-ui text-[13px] font-semibold"
              />
              <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-white [&_button]:!text-white">
                <IconBtn icon="arrow_upward" title="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconBtn icon="arrow_downward" title="Move down" disabled={i === sections.length - 1} onClick={() => move(i, 1)} />
                <IconBtn icon="content_copy" title="Duplicate section" onClick={() => setSections([...sections.slice(0, i + 1), cloneSection(s, sections), ...sections.slice(i + 1)])} />
                <IconBtn icon="close" title="Remove section" onClick={() => setSections(sections.filter((_, j) => j !== i))} />
              </span>
            </div>
            <textarea
              value={s.lyrics}
              onChange={(e) => patch(i, { lyrics: e.target.value })}
              ref={(el) => { if (el) areas.current.set(s.key, el); else areas.current.delete(s.key); }}
              onKeyDown={(e) => onKeyDown(e, i)}
              onFocus={() => onFocusSection(s.key)}
              rows={Math.max(3, s.lyrics.split("\n").length + 1)}
              placeholder="One line per line. A blank line starts a new slide. Cmd/Ctrl+Enter splits into a new section."
              className="w-full resize-none bg-transparent outline-none px-3 py-2 font-body-ui text-[14px] leading-snug text-on-surface"
            />
          </div>
        ))}
      </div>

      <div className="h-11 shrink-0 flex items-center px-3 border-t border-outline-variant">
        <div ref={menuWrap} className="relative">
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} title="Add a section" className="ghost p-1.5 rounded-md text-on-surface flex items-center gap-1">
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span className="font-body-ui text-[12px]">Section</span>
          </button>
          {menu && (
            <div role="menu" className="absolute bottom-full left-0 mb-1 w-40 glass glass-strong rounded-xl py-1 z-10">
              {SECTION_KINDS.map((k) => (
                <button key={k.prefix} role="menuitem" onClick={() => add(newSection(k, sections))} className="w-full flex items-center gap-2 px-3 py-1.5 text-left font-body-ui text-[13px] text-on-surface hover:bg-surface-container-low">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sectionColor(k.name) }} />
                  {k.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
