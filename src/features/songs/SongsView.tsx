import { useEffect, useState } from "react";
import ErrorBoundary from "../../components/ErrorBoundary";
import { ResizeHandle, useResizable } from "../../hooks/useResizable";
import { usePresentationStage } from "../../hooks/usePresentationStage";
import { useAppStore } from "../../store/app";
import ImportDialog from "./ImportDialog";
import LivePanel from "./LivePanel";
import PreviewPanel from "./PreviewPanel";
import SchedulePanel from "./SchedulePanel";
import SongEditorDialog from "./SongEditorDialog";
import SongList from "./SongList";
import { useSongsLive } from "./liveStore";
import { useSongsStore } from "./songsStore";
import { useSongOutput } from "./useSongOutput";

/**
 * The Songs tab of the presentation workspace. Mirrors the Scriptures screen:
 * Schedule | Preview | Live across the top and the library below, with the song
 * editor opening as a dialog. Each region has its own boundary so a failure in
 * one (a bad song, a broken output) doesn't blank the rest.
 */
export default function SongsView() {
  const editing = useSongsStore((s) => s.editing);
  const draftKey = useSongsStore((s) => s.draftKey);
  const cancel = useSongsStore((s) => s.cancel);
  const songs = useSongsStore((s) => s.songs);
  const presentationActive = useAppStore((s) => s.presentationActive);
  const [importing, setImporting] = useState(false);
  const stage = usePresentationStage(presentationActive);

  const queueW = useResizable({
    storageKey: "scriptura.songs.queueWidth", initial: Math.round(window.innerWidth * 0.24), min: 180, axis: "x",
    max: () => Math.round(window.innerWidth * 0.4),
  });
  const liveW = useResizable({
    storageKey: "scriptura.songs.liveWidth", initial: Math.round(window.innerWidth * 0.3), min: 240, axis: "x", invert: true,
    max: () => Math.round(window.innerWidth * 0.5),
  });
  const bottomH = useResizable({
    storageKey: "scriptura.songs.bottomHeight", initial: Math.round(window.innerHeight * 0.4), min: 220, axis: "y", invert: true,
    max: () => window.innerHeight - 260,
  });

  useSongOutput();

  useEffect(() => { void useSongsLive.getState().load(); }, []);
  // The library changed (edit, delete, import): refresh scheduled titles and the preview.
  useEffect(() => { void useSongsLive.getState().syncWithLibrary(); }, [songs]);

  // PageDown / PageUp step the live slide, like a clicker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "PageDown") { e.preventDefault(); useSongsLive.getState().stepLive(1); }
      if (e.key === "PageUp") { e.preventDefault(); useSongsLive.getState().stepLive(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-2.5 gap-2.5">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <ErrorBoundary compact label="Schedule"><SchedulePanel width={queueW.size} /></ErrorBoundary>
        <ResizeHandle spaced axis="x" label="schedule" dragging={queueW.dragging} handleProps={queueW.handleProps} />
        <ErrorBoundary compact label="Preview"><PreviewPanel stage={stage} /></ErrorBoundary>
        <ResizeHandle spaced axis="x" label="live" dragging={liveW.dragging} handleProps={liveW.handleProps} />
        <ErrorBoundary compact label="Live"><LivePanel width={liveW.size} stage={stage} /></ErrorBoundary>
      </div>

      <ResizeHandle axis="y" label="library" dragging={bottomH.dragging} handleProps={bottomH.handleProps} />

      <div style={{ height: bottomH.size }} className="shrink-0 panel rounded-3xl flex overflow-hidden">
        <ErrorBoundary compact label="Song library"><SongList onImport={() => setImporting(true)} /></ErrorBoundary>
      </div>

      {editing && (
        <ErrorBoundary key={draftKey} compact label="Song editor" onReset={cancel}>
          <SongEditorDialog key={draftKey} />
        </ErrorBoundary>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
