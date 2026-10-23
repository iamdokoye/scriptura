import { useEffect, useRef, useState } from "react";
import { songsApi, type ImportSummary, type Song } from "./api";
import { useSongsStore } from "./songsStore";

interface Candidate {
  id: number;
  source: string;
  song: Song;
  selected: boolean;
}

const MAX_FILES = 200;

export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const afterImport = useSongsStore((s) => s.afterImport);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const nextId = useRef(1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function parse(name: string, content: string) {
    try {
      const songs = await songsApi.parseImport(name, content);
      setCandidates((prev) => [
        ...prev,
        ...songs.map((song) => ({ id: nextId.current++, source: name, song, selected: true })),
      ]);
    } catch (e) {
      setErrors((prev) => [...prev, `${name}: ${e instanceof Error ? e.message : String(e)}`]);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    for (const file of Array.from(files).slice(0, MAX_FILES)) {
      await parse(file.name, await file.text());
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function addPasted() {
    setBusy(true);
    await parse("Pasted lyrics", pasted);
    setPasted("");
    setBusy(false);
  }

  async function doImport() {
    const chosen = candidates.filter((c) => c.selected).map((c) => c.song);
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const summary = await songsApi.importSongs(chosen);
      setResult(summary);
      await afterImport(summary.imported[0]?.id);
    } catch (e) {
      setErrors((prev) => [...prev, e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = candidates.filter((c) => c.selected).length;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Import songs"
        className="w-full max-w-xl max-h-[85vh] flex flex-col glass glass-strong rounded-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant shrink-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Import songs</h2>
          <button onClick={onClose} aria-label="Close" className="text-secondary hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </header>

        {result ? (
          <div className="p-6 space-y-3 font-body-ui text-[13px] text-on-surface">
            <p>Imported {result.imported.length} {result.imported.length === 1 ? "song" : "songs"}.</p>
            {result.skipped.length > 0 && (
              <p className="text-on-surface-variant">Skipped {result.skipped.length} already in your library: {result.skipped.join(", ")}.</p>
            )}
            <button onClick={onClose} className="btn-primary rounded-md px-3 py-1.5 text-[12px]">Done</button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
            <div className="space-y-2">
              <p className="text-[12px] text-on-surface-variant font-body-ui leading-relaxed">
                Choose OpenLyrics (.xml) or text files — including CCLI SongSelect text downloads. You can pick many at once.
              </p>
              <input ref={fileRef} type="file" multiple accept=".txt,.xml,.text,.lyrics,text/plain,text/xml,application/xml" onChange={(e) => void onFiles(e.target.files)} className="block text-[12px] font-body-ui text-on-surface-variant" />
            </div>

            <div className="space-y-2">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                placeholder="…or paste lyrics here (title on the first line, then Verse 1, Chorus, …)"
                className="field w-full rounded-md px-3 py-2 text-[13px] font-body-ui text-on-surface outline-none resize-y"
              />
              <button disabled={!pasted.trim() || busy} onClick={() => void addPasted()} className="ctl rounded-md px-3 py-1.5 text-[12px] font-body-ui text-on-surface-variant disabled:opacity-40">
                Add pasted text
              </button>
            </div>

            {errors.length > 0 && (
              <ul className="space-y-1 text-[12px] text-error font-body-ui">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}

            {candidates.length > 0 && (
              <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => setCandidates((prev) => prev.map((x) => (x.id === c.id ? { ...x, selected: !x.selected } : x)))}
                        className="mt-1 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block font-body-ui text-[13px] text-on-surface truncate">{c.song.title}</span>
                        <span className="block font-body-ui text-[11px] text-on-surface-variant truncate">
                          {c.song.sections.length} sections{c.song.author ? ` · ${c.song.author}` : ""}{c.song.ccli_number ? ` · CCLI ${c.song.ccli_number}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!result && (
          <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-outline-variant shrink-0">
            <button onClick={onClose} className="ctl rounded-md px-3 py-1.5 text-[12px] font-body-ui text-on-surface-variant">Cancel</button>
            <button disabled={selectedCount === 0 || busy} onClick={() => void doImport()} className="btn-primary rounded-md px-3 py-1.5 text-[12px] font-body-ui disabled:opacity-40">
              Import {selectedCount > 0 ? selectedCount : ""}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
