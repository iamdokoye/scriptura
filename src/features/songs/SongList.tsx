import { useEffect, useMemo, useRef, useState } from "react";
import type { SongSummary } from "./api";
import { useSongsLive } from "./liveStore";
import { useSongsStore } from "./songsStore";

type SortKey = "title" | "author" | "copyright";
type Source = { kind: "all" } | { kind: "favourites" } | { kind: "tag"; tag: string };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "copyright", label: "Copyright" },
];
const GRID = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)]";

export default function SongList({ onImport }: { onImport: () => void }) {
  const {
    songs, query, setQuery, loading, libraryError, selectedId,
    selectRow, openEditor, newSong, refresh, remove, toggleFavourite,
  } = useSongsStore();
  const [source, setSource] = useState<Source>({ kind: "all" });
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  // null = server order (relevance while searching, title otherwise)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  useEffect(() => { void refresh(); }, [refresh]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of songs) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [songs]);

  const rows = useMemo(() => {
    let out = songs;
    if (source.kind === "favourites") out = out.filter((s) => s.favourite);
    if (source.kind === "tag") out = out.filter((s) => s.tags.includes(source.tag));
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => a[key].localeCompare(b[key], undefined, { sensitivity: "base" }) * dir);
    }
    return out;
  }, [songs, source, sort]);

  function toggleSort(key: SortKey) {
    setSort((cur) => (cur?.key === key ? (cur.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (rows.length === 0) return;
    const i = rows.findIndex((r) => r.id === selectedId);
    if (e.key === "ArrowDown") { e.preventDefault(); selectRow(rows[Math.min(rows.length - 1, i + 1)].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selectRow(rows[Math.max(0, i - 1)].id); }
    else if (e.key === "Enter" && selectedId !== null) { e.preventDefault(); void useSongsLive.getState().addToSchedule(selectedId); }
  }

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 min-w-0 min-h-0 flex-col">
      <div className="flex flex-1 min-h-0">
        {/* Sources */}
        <nav className="w-56 shrink-0 border-r border-outline-variant bg-surface-container-lowest/40 overflow-y-auto py-2">
          <SourceHeading>Songs</SourceHeading>
          <SourceRow icon="library_music" active={source.kind === "all"} onClick={() => setSource({ kind: "all" })}>All Songs</SourceRow>
          <SourceRow icon="star" active={source.kind === "favourites"} onClick={() => setSource({ kind: "favourites" })}>Favourites</SourceRow>

          <SourceHeading>Online</SourceHeading>
          <SourceRow icon="cloud" disabled title="Coming soon">SongSelect</SourceRow>

          <button
            onClick={() => setCollectionsOpen((o) => !o)}
            className="w-full flex items-center gap-1 px-3 pt-3 pb-1 text-left font-metadata-mono text-[11px] uppercase tracking-widest text-on-surface-variant"
            aria-expanded={collectionsOpen}
          >
            <span className={`material-symbols-outlined text-[16px] transition-transform ${collectionsOpen ? "rotate-90" : ""}`}>chevron_right</span>
            Collections
          </button>
          {collectionsOpen && (
            tags.length === 0
              ? <p className="px-4 py-1 text-[11px] font-body-ui text-on-surface-variant leading-relaxed">Tag a song to group it here.</p>
              : tags.map(([tag, n]) => (
                <SourceRow key={tag} icon="folder" active={source.kind === "tag" && source.tag === tag} onClick={() => setSource({ kind: "tag", tag })} count={n}>
                  {tag}
                </SourceRow>
              ))
          )}
        </nav>

        {/* Table */}
        <div className="flex flex-1 min-w-0 flex-col">
          <label className="field flex items-center gap-2 mx-3 mt-3 mb-2 rounded-md px-2.5 h-9 shrink-0">
            <span className="material-symbols-outlined text-[18px] text-secondary">search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, authors and lyrics"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-body-ui text-on-surface"
            />
          </label>

          <div role="row" className={`${GRID} border-y border-outline-variant bg-surface-container-low/60 shrink-0`}>
            {COLUMNS.map((c) => (
              <button
                key={c.key}
                onClick={() => toggleSort(c.key)}
                className="flex items-center justify-between gap-1 px-3 py-2 text-left font-body-ui text-[13px] text-on-surface border-r border-outline-variant last:border-r-0 hover:bg-surface-container-low"
              >
                {c.label}
                {sort?.key === c.key && (
                  <span className="material-symbols-outlined text-[16px] text-secondary">{sort.dir === 1 ? "expand_less" : "expand_more"}</span>
                )}
              </button>
            ))}
          </div>

          <div
            role="grid"
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-label="Songs"
            className="flex-1 min-h-0 overflow-y-auto outline-none"
          >
            {libraryError && <p className="m-4 text-[12px] text-error font-body-ui">{libraryError}</p>}
            {!libraryError && rows.length === 0 && !loading && (
              <p className="m-4 text-[12px] text-on-surface-variant font-body-ui leading-relaxed">
                {query || source.kind !== "all"
                  ? "No songs match."
                  : "No songs yet. Use + to add one, or the gear to import from a file or pasted text."}
              </p>
            )}
            {rows.map((s) => <Row key={s.id} song={s} selected={s.id === selectedId} onSelect={() => selectRow(s.id)} onOpen={() => void useSongsLive.getState().addToSchedule(s.id)} />)}
          </div>
        </div>
      </div>

      <Footer
        count={rows.length}
        selected={selected}
        onNew={newSong}
        onImport={onImport}
        onEdit={() => selected && void openEditor(selected.id)}
        onFavourite={() => selected && void toggleFavourite(selected.id)}
        onDelete={() => selected && void remove(selected.id)}
      />
    </div>
  );
}

function Row({ song, selected, onSelect, onOpen }: { song: SongSummary; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected) ref.current?.scrollIntoView({ block: "nearest" }); }, [selected]);
  return (
    <div
      ref={ref}
      role="row"
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      title="Double-click to add to the schedule"
      className={`${GRID} cursor-default select-none ${selected ? "row-selected" : "hover:bg-surface-container-low"}`}
    >
      <span className="px-3 py-2 font-body-ui text-[13px] text-on-surface truncate flex items-center gap-1.5">
        {song.favourite && <span className="material-symbols-outlined text-[14px] text-primary shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>}
        <span className="truncate">{song.title}</span>
      </span>
      <span className="px-3 py-2 font-body-ui text-[13px] text-on-surface-variant truncate">{song.author}</span>
      <span className="px-3 py-2 font-body-ui text-[13px] text-on-surface-variant truncate">{song.copyright}</span>
    </div>
  );
}

function Footer({ count, selected, onNew, onImport, onEdit, onFavourite, onDelete }: {
  count: number; selected: SongSummary | null;
  onNew: () => void; onImport: () => void; onEdit: () => void; onFavourite: () => void; onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) { setMenu(false); setConfirm(false); } };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <div className="h-11 shrink-0 flex items-center gap-1 px-3 border-t border-outline-variant bg-surface-container-lowest/40">
      <button onClick={onNew} title="New song" aria-label="New song" className="ghost p-1.5 rounded-md text-on-surface">
        <span className="material-symbols-outlined text-[20px]">add</span>
      </button>
      <button onClick={onEdit} disabled={!selected} title="Edit song" aria-label="Edit song" className="ghost p-1.5 rounded-md text-on-surface disabled:opacity-30 disabled:pointer-events-none">
        <span className="material-symbols-outlined text-[20px]">edit</span>
      </button>
      <div ref={wrap} className="relative">
        <button onClick={() => { setMenu((m) => !m); setConfirm(false); }} title="More" aria-label="More actions" aria-expanded={menu} className="ghost p-1.5 rounded-md text-secondary flex items-center">
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="material-symbols-outlined text-[16px]">expand_more</span>
        </button>
        {menu && (
          <div role="menu" className="absolute bottom-full left-0 mb-1 w-52 glass glass-strong rounded-xl py-1 z-10">
            <MenuItem icon="upload_file" onClick={() => { setMenu(false); onImport(); }}>Import songs…</MenuItem>
            <MenuItem icon="edit" disabled={!selected} onClick={() => { setMenu(false); onEdit(); }}>Edit selected</MenuItem>
            <MenuItem icon="star" disabled={!selected} onClick={() => { setMenu(false); onFavourite(); }}>
              {selected?.favourite ? "Remove favourite" : "Add to favourites"}
            </MenuItem>
            {confirm
              ? <MenuItem icon="delete" danger onClick={() => { setMenu(false); setConfirm(false); onDelete(); }}>Click to confirm delete</MenuItem>
              : <MenuItem icon="delete" disabled={!selected} onClick={() => setConfirm(true)}>Delete selected</MenuItem>}
          </div>
        )}
      </div>
      <span className="flex-1 text-center font-body-ui text-[13px] text-on-surface-variant">
        {count} {count === 1 ? "song" : "songs"}
      </span>
    </div>
  );
}

function MenuItem({ icon, children, onClick, disabled, danger }: { icon: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} disabled={disabled} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left font-body-ui text-[13px] hover:bg-surface-container-low disabled:opacity-40 disabled:pointer-events-none ${danger ? "text-error" : "text-on-surface"}`}>
      <span className="material-symbols-outlined text-[16px]">{icon}</span>{children}
    </button>
  );
}

function SourceHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="px-3 pt-3 pb-1 font-metadata-mono text-[11px] uppercase tracking-widest text-on-surface-variant">{children}</h3>;
}

function SourceRow({ icon, children, active, disabled, title, count, onClick }: {
  icon: string; children: React.ReactNode; active?: boolean; disabled?: boolean; title?: string; count?: number; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-current={active ? "true" : undefined}
      className={`w-full flex items-center gap-2 px-4 py-2 text-left font-body-ui text-[13px] disabled:opacity-40 disabled:cursor-not-allowed ${active ? "row-selected text-primary font-semibold" : "text-on-surface hover:bg-surface-container-low"}`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {count !== undefined && <span className="font-metadata-mono text-[11px] text-on-surface-variant">{count}</span>}
    </button>
  );
}
