import { useState } from "react";
import { songsApi, type Song } from "./api";

/** Pasted text -> sections, via the same parser the importer uses. */
export default function PasteLyrics({ song, onChange, onDone }: {
  song: Song; onChange: (p: Partial<Song>) => void; onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setError(null);
    try {
      const [parsed] = await songsApi.parseImport(song.title || "Untitled", text);
      // Fill details only where the user hasn't already typed something.
      onChange({
        title: song.title.trim() ? song.title : parsed.title,
        author: song.author || parsed.author,
        copyright: song.copyright || parsed.copyright,
        ccli_number: song.ccli_number || parsed.ccli_number,
        sections: parsed.sections,
        arrangement: parsed.arrangement,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      <p className="text-[12px] text-on-surface-variant font-body-ui leading-relaxed">
        Paste the full lyrics. Blank lines separate sections; headings like “Verse 1” or “[Chorus]” are recognised and repeated blocks reuse one section.
        {song.sections.length > 0 && " This replaces the current lyrics."}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        autoFocus
        className="field w-full rounded-md px-3 py-2 text-[13px] font-body-ui text-on-surface outline-none resize-y"
      />
      {error && <p className="text-[12px] text-error font-body-ui">{error}</p>}
      <div className="flex gap-2">
        <button disabled={!text.trim()} onClick={() => void apply()} className="btn-primary rounded-md px-3 py-1.5 text-[12px] font-body-ui disabled:opacity-40">Split into sections</button>
        <button onClick={onDone} className="ctl rounded-md px-3 py-1.5 text-[12px] font-body-ui text-on-surface-variant">Cancel</button>
      </div>
    </div>
  );
}
