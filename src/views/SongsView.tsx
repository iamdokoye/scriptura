import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, type Song, type SongSection } from "../lib/tauri";
import SideNav from "../components/SideNav";
import { useAppStore } from "../store/app";

export default function SongsView() {
  useAppStore();

  const [songs, setSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Song | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Song | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const list = await api.listSongs();
      setSongs(list);
    } catch {}
  }

  const filtered = songs.filter((s) =>
    !query || s.title.toLowerCase().includes(query.toLowerCase()) ||
    s.author?.toLowerCase().includes(query.toLowerCase())
  );

  // ── Import PPTX ──────────────────────────────────────────────────────────
  async function importPptx() {
    const result = await open({
      multiple: true,
      filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
    });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    if (paths.length === 0) return;
    setImporting(true);
    setImportMsg("");
    try {
      const r = await api.importPptxSongs(paths);
      setImportMsg(
        `Imported ${r.imported} song${r.imported !== 1 ? "s" : ""}` +
        (r.skipped ? `, ${r.skipped} skipped` : "") +
        (r.errors.length ? ` — ${r.errors.length} error(s)` : "")
      );
      await load();
    } catch (e: unknown) {
      setImportMsg(`Error: ${e}`);
    } finally {
      setImporting(false);
    }
  }

  // ── Import EWSX ──────────────────────────────────────────────────────────
  async function importEwsx() {
    const result = await open({
      multiple: false,
      filters: [{ name: "EasyWorship Export", extensions: ["ewsx"] }],
    });
    if (!result) return;
    const path = typeof result === "string" ? result : result[0];
    setImporting(true);
    setImportMsg("");
    try {
      const r = await api.importEwsxSongs(path);
      setImportMsg(
        `Imported ${r.imported} song${r.imported !== 1 ? "s" : ""}` +
        (r.skipped ? `, ${r.skipped} skipped` : "") +
        (r.errors.length ? ` — ${r.errors.length} error(s)` : "")
      );
      await load();
    } catch (e: unknown) {
      setImportMsg(`Error: ${e}`);
    } finally {
      setImporting(false);
    }
  }

  // ── Select / deselect ────────────────────────────────────────────────────
  function openSong(song: Song) {
    setSelected(song);
    setEditing(false);
    setDraft(null);
  }

  function startEdit() {
    if (!selected) return;
    setDraft(JSON.parse(JSON.stringify(selected)));
    setEditing(true);
  }

  async function saveEdit() {
    if (!draft) return;
    try {
      await api.saveSong(draft);
      setSongs((prev) => prev.map((s) => (s.id === draft.id ? draft : s)));
      setSelected(draft);
      setEditing(false);
      setDraft(null);
    } catch {}
  }

  async function deleteSong(song: Song) {
    if (!confirm(`Delete "${song.title}"?`)) return;
    await api.deleteSong(song.id);
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    if (selected?.id === song.id) setSelected(null);
  }

  function newSong() {
    const blank: Song = {
      id: `song-${Date.now()}`,
      title: "Untitled Song",
      sections: [{ label: "Verse 1", content: "" }],
      section_order: ["Verse 1"],
      tags: [],
      source: "manual",
      created_at: "",
    };
    setSelected(blank);
    setDraft(blank);
    setEditing(true);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />

      {/* ── Song list ────────────────────────────────────────────────────── */}
      <div className="w-[280px] shrink-0 border-r border-outline-variant flex flex-col bg-surface-container-lowest">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Songs</h2>
            <button
              onClick={newSong}
              className="p-1.5 rounded text-primary hover:bg-primary/10 transition-colors"
              title="New song"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
          </div>
          <input
            placeholder="Search songs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-ui text-[13px] placeholder:text-on-surface-variant"
          />
        </div>

        {/* Import banner */}
        <div className="px-3 py-2 border-b border-outline-variant bg-surface shrink-0 flex gap-2">
          <button
            onClick={importPptx}
            disabled={importing}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-body-ui text-secondary border border-outline-variant rounded-DEFAULT hover:bg-surface-container transition-colors disabled:opacity-50"
            title="Import from PowerPoint files"
          >
            <span className="material-symbols-outlined text-[15px]">upload_file</span>
            PPTX
          </button>
          <button
            onClick={importEwsx}
            disabled={importing}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-body-ui text-secondary border border-outline-variant rounded-DEFAULT hover:bg-surface-container transition-colors disabled:opacity-50"
            title="Import from EasyWorship export (.ewsx)"
          >
            <span className="material-symbols-outlined text-[15px]">upload_file</span>
            EWSX
          </button>
        </div>
        {importMsg && (
          <div className="px-3 py-1.5 bg-secondary-container text-on-secondary-container font-metadata-mono text-[11px] border-b border-outline-variant">
            {importMsg}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant opacity-30 mb-2">
                music_off
              </span>
              <p className="font-body-ui text-[13px] text-on-surface-variant">
                {songs.length === 0 ? "No songs yet. Import PPTX or EWSX files." : "No songs match your search."}
              </p>
            </div>
          )}
          {filtered.map((song) => (
            <button
              key={song.id}
              onClick={() => openSong(song)}
              className={`w-full text-left px-4 py-3 transition-colors border-b border-outline-variant/40 hover:bg-surface-container-low ${
                selected?.id === song.id ? "bg-secondary-container/50 border-l-2 border-l-primary" : ""
              }`}
            >
              <p className={`font-body-ui text-[13px] font-medium truncate ${selected?.id === song.id ? "text-primary" : "text-on-surface"}`}>
                {song.title}
              </p>
              {song.author && (
                <p className="font-metadata-mono text-[11px] text-on-surface-variant truncate mt-0.5">
                  {song.author}
                </p>
              )}
              <p className="font-metadata-mono text-[10px] text-on-surface-variant/60 mt-0.5">
                {song.sections.length} section{song.sections.length !== 1 ? "s" : ""}
                {" · "}
                <span className="capitalize">{song.source}</span>
              </p>
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-outline-variant shrink-0">
          <p className="font-metadata-mono text-[11px] text-on-surface-variant">
            {songs.length} song{songs.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* ── Song detail ──────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <span className="material-symbols-outlined text-[64px] text-on-surface-variant opacity-20 mb-4">
              library_music
            </span>
            <p className="font-body-ui text-[15px] text-on-surface font-medium">Select a song</p>
            <p className="font-body-ui text-[13px] text-on-surface-variant mt-1">
              Or import from PPTX / EWSX using the buttons on the left.
            </p>
          </div>
        ) : editing && draft ? (
          <SongEditor
            draft={draft}
            onChange={setDraft}
            onSave={saveEdit}
            onCancel={() => { setEditing(false); setDraft(null); if (!selected.created_at) setSelected(null); }}
          />
        ) : (
          <SongDetail
            song={selected}
            onEdit={startEdit}
            onDelete={() => deleteSong(selected)}
            onAddToQueue={(section) => {
              // placeholder — queue integration comes with presentation feature
              void section;
            }}
          />
        )}
      </main>
    </div>
  );
}

// ── Song detail (read mode) ───────────────────────────────────────────────────

function SongDetail({
  song,
  onEdit,
  onDelete,
}: {
  song: Song;
  onEdit: () => void;
  onDelete: () => void;
  onAddToQueue: (section: SongSection) => void;
}) {
  const orderedSections = song.section_order.length > 0
    ? song.section_order
        .map((label) => song.sections.find((s) => s.label === label))
        .filter(Boolean) as SongSection[]
    : song.sections;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant bg-surface shrink-0">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface font-bold">{song.title}</h1>
          {(song.author || song.copyright) && (
            <p className="font-metadata-mono text-[11px] text-on-surface-variant mt-0.5">
              {[song.author, song.copyright].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-body-ui text-secondary border border-outline-variant rounded-DEFAULT hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
            Edit
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-DEFAULT text-secondary hover:text-error hover:bg-error-container transition-colors"
            title="Delete song"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-2xl">
        {song.section_order.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {song.section_order.map((label, i) => (
              <span
                key={i}
                className="font-metadata-mono text-[10px] px-2 py-0.5 rounded-full bg-surface-container border border-outline-variant text-on-surface-variant"
              >
                {label}
              </span>
            ))}
          </div>
        )}
        {orderedSections.map((section, i) => (
          <div key={i} className="rounded-DEFAULT border border-outline-variant bg-surface p-4">
            <p className="font-metadata-mono text-[10px] text-secondary font-bold uppercase tracking-wide mb-2">
              {section.label}
            </p>
            <pre className="font-body-reading text-[14px] text-on-surface leading-relaxed whitespace-pre-wrap">
              {section.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Song editor ───────────────────────────────────────────────────────────────

function SongEditor({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Song;
  onChange: (song: Song) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function updateSection(i: number, field: "label" | "content", value: string) {
    const sections = draft.sections.map((s, idx) =>
      idx === i ? { ...s, [field]: value } : s
    );
    // Keep section_order labels in sync when label changes
    const section_order = field === "label"
      ? draft.section_order.map((l) => (l === draft.sections[i].label ? value : l))
      : draft.section_order;
    onChange({ ...draft, sections, section_order });
  }

  function addSection() {
    const label = `Section ${draft.sections.length + 1}`;
    onChange({
      ...draft,
      sections: [...draft.sections, { label, content: "" }],
      section_order: [...draft.section_order, label],
    });
  }

  function removeSection(i: number) {
    const removed = draft.sections[i].label;
    onChange({
      ...draft,
      sections: draft.sections.filter((_, idx) => idx !== i),
      section_order: draft.section_order.filter((l) => l !== removed),
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant bg-surface shrink-0">
        <span className="font-body-ui text-[14px] text-on-surface-variant">Editing song</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[13px] font-body-ui text-secondary border border-outline-variant rounded-DEFAULT hover:bg-surface-container transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-[13px] font-body-ui bg-primary text-on-primary rounded-DEFAULT hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-2xl">
        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="font-metadata-mono text-[10px] text-secondary uppercase tracking-wide block mb-1">Title</label>
            <input
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-ui text-[14px]"
            />
          </div>
          <div>
            <label className="font-metadata-mono text-[10px] text-secondary uppercase tracking-wide block mb-1">Author</label>
            <input
              value={draft.author ?? ""}
              onChange={(e) => onChange({ ...draft, author: e.target.value || undefined })}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-ui text-[13px]"
            />
          </div>
          <div>
            <label className="font-metadata-mono text-[10px] text-secondary uppercase tracking-wide block mb-1">Copyright</label>
            <input
              value={draft.copyright ?? ""}
              onChange={(e) => onChange({ ...draft, copyright: e.target.value || undefined })}
              className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-ui text-[13px]"
            />
          </div>
        </div>

        {/* Section order string */}
        <div>
          <label className="font-metadata-mono text-[10px] text-secondary uppercase tracking-wide block mb-1">
            Section Order <span className="text-on-surface-variant normal-case">(space-separated labels)</span>
          </label>
          <input
            value={draft.section_order.join(" ")}
            onChange={(e) =>
              onChange({
                ...draft,
                section_order: e.target.value.split(/\s+/).filter(Boolean),
              })
            }
            className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-metadata-mono text-[13px]"
            placeholder="Verse1 Chorus Verse2 Chorus Bridge Chorus"
          />
        </div>

        {/* Sections */}
        {draft.sections.map((section, i) => (
          <div key={i} className="rounded-DEFAULT border border-outline-variant bg-surface p-4 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={section.label}
                onChange={(e) => updateSection(i, "label", e.target.value)}
                className="flex-1 px-2 py-1 bg-surface-container border border-outline-variant rounded focus:outline-none focus:border-primary font-metadata-mono text-[11px] text-secondary"
              />
              <button
                onClick={() => removeSection(i)}
                className="p-1 text-secondary hover:text-error transition-colors"
                title="Remove section"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <textarea
              rows={4}
              value={section.content}
              onChange={(e) => updateSection(i, "content", e.target.value)}
              className="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary font-body-reading text-[14px] resize-y"
              placeholder="Lyrics…"
            />
          </div>
        ))}

        <button
          onClick={addSection}
          className="flex items-center gap-2 text-[13px] font-body-ui text-secondary hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          Add section
        </button>
      </div>
    </div>
  );
}
