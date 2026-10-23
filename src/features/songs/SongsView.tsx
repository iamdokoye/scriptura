import { useState } from "react";
import ErrorBoundary from "../../components/ErrorBoundary";
import ImportDialog from "./ImportDialog";
import SongEditorDialog from "./SongEditorDialog";
import SongList from "./SongList";
import { useSongsStore } from "./songsStore";

/**
 * The Songs tab of the presentation workspace: a library list, with the editor
 * opening as a dialog on top (like a song's own window). The editor has its own
 * boundary so a bad song can't take the library list down with it.
 */
export default function SongsView() {
  const editing = useSongsStore((s) => s.editing);
  const draftKey = useSongsStore((s) => s.draftKey);
  const cancel = useSongsStore((s) => s.cancel);
  const [importing, setImporting] = useState(false);

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden bg-background">
      <SongList onImport={() => setImporting(true)} />
      {editing && (
        <ErrorBoundary key={draftKey} compact label="Song editor" onReset={cancel}>
          <SongEditorDialog key={draftKey} />
        </ErrorBoundary>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
