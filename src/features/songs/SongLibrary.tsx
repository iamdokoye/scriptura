import { useEffect } from "react";
import { useSongsStore } from "./songsStore";

export default function SongLibrary({ onImport }: { onImport: () => void }) {
  const { songs, query, setQuery, loading, libraryError, draft, select, newSong, refresh } = useSongsStore();

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <aside className="w-72 shrink-0 flex flex-col border-r border-outline-variant bg-surface-container-lowest/40">
      <div className="p-4 space-y-3 border-b border-outline-variant">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Songs</h2>
          <div className="flex gap-1.5">
            <button onClick={onImport} className="ctl rounded-md px-2.5 py-1 text-[12px] font-body-ui text-on-surface-variant flex items-center gap-1" title="Import songs">
              <span className="material-symbols-outlined text-[15px]">upload_file</span>Import
            </button>
            <button onClick={() => void newSong()} className="btn-primary rounded-md px-2.5 py-1 text-[12px] font-body-ui flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">add</span>New
            </button>
          </div>
        </div>
        <label className="field flex items-center gap-2 rounded-md px-2.5 h-9">
          <span className="material-symbols-outlined text-[18px] text-secondary">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, authors, lyrics"
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-body-ui text-on-surface"
          />
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {libraryError && (
          <p className="m-4 text-[12px] text-error font-body-ui">{libraryError}</p>
        )}
        {!libraryError && songs.length === 0 && !loading && (
          <p className="m-4 text-[12px] text-on-surface-variant font-body-ui leading-relaxed">
            {query ? "No songs match that search." : "No songs yet. Create one, or import from a file or pasted text."}
          </p>
        )}
        <ul>
          {songs.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => void select(s.id)}
                className={`w-full text-left px-4 py-2.5 transition-colors ${
                  draft?.id === s.id ? "row-selected" : "hover:bg-surface-container-low"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="font-body-ui text-[13px] text-on-surface truncate">{s.title}</span>
                  {s.favourite && <span className="material-symbols-outlined text-[13px] text-primary">star</span>}
                </span>
                {(s.author || s.ccli_number) && (
                  <span className="block font-body-ui text-[11px] text-on-surface-variant truncate">
                    {[s.author, s.ccli_number && `CCLI ${s.ccli_number}`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
