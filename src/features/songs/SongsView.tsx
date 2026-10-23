import { useEffect, useState } from "react";
import SideNav from "../../components/SideNav";
import ErrorBoundary from "../../components/ErrorBoundary";
import { useAppStore } from "../../store/app";
import ImportDialog from "./ImportDialog";
import SlidePreview from "./SlidePreview";
import SongEditor from "./SongEditor";
import SongLibrary from "./SongLibrary";
import { DEFAULT_MAX_LINES, MAX_LINES, MIN_LINES } from "./slides";
import { useSongsStore } from "./songsStore";

const LINES_KEY = "scriptura.songs.maxLines";

function loadMaxLines(): number {
  try {
    const n = Number(localStorage.getItem(LINES_KEY));
    if (Number.isInteger(n) && n >= MIN_LINES && n <= MAX_LINES) return n;
  } catch { /* storage unavailable */ }
  return DEFAULT_MAX_LINES;
}

export default function SongsView() {
  const setView = useAppStore((s) => s.setView);
  const draft = useSongsStore((s) => s.draft);
  const draftKey = useSongsStore((s) => s.draftKey);
  const flush = useSongsStore((s) => s.flush);
  const [importing, setImporting] = useState(false);
  const [maxLines, setMaxLines] = useState(loadMaxLines);

  // Don't lose a pending edit when leaving the view or closing the window.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      void flush();
    };
  }, [flush]);

  function changeMaxLines(n: number) {
    setMaxLines(n);
    try { localStorage.setItem(LINES_KEY, String(n)); } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav variant="full" />
      <main className="flex flex-1 min-w-0 overflow-hidden bg-background">
        <SongLibrary onImport={() => setImporting(true)} />
        {/* The editor and preview get their own boundary: a bad song can't take the library list down. */}
        <ErrorBoundary key={draftKey} label="Song editor" onReset={() => setView("reading")} resetLabel="Go to Reading">
          {draft ? (
            <>
              <SongEditor key={draftKey} />
              <SlidePreview song={draft} maxLines={maxLines} onMaxLines={changeMaxLines} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div className="max-w-sm space-y-2">
                <span className="material-symbols-outlined text-[40px] text-secondary">library_music</span>
                <p className="font-body-ui text-[14px] text-on-surface">Pick a song, or create one.</p>
                <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
                  Paste lyrics and they split into verses and a chorus automatically, with slides sized to your line limit.
                </p>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </main>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
