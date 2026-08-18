import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type CrossReference } from "../lib/tauri";
import { useAppStore } from "../store/app";

interface Props {
  isOpen: boolean;
  book: string;
  chapter: number;
  verse: number;
  onClose: () => void;
}

type Status = "loading" | "installing" | "ready" | "no-tsk";

export default function CrossRefSheet({ isOpen, book, chapter, verse, onClose }: Props) {
  const { setCurrentRef, setView } = useAppStore();
  const [refs, setRefs] = useState<CrossReference[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [installProgress, setInstallProgress] = useState(0);
  const [installMessage, setInstallMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Slide-in animation
  useEffect(() => {
    if (isOpen) {
      rafRef.current = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isOpen]);

  // Fetch cross-refs whenever the sheet opens or the verse changes
  useEffect(() => {
    if (!isOpen) return;
    setStatus("loading");
    setRefs([]);

    api.getCrossReferences(book, chapter, verse).then((r) => {
      if (r.length > 0) {
        setRefs(r);
        setStatus("ready");
      } else {
        // Empty result means TSK isn't installed
        setStatus("no-tsk");
      }
    }).catch(() => setStatus("no-tsk"));
  }, [isOpen, book, chapter, verse]);

  // Listen for TSK install progress
  useEffect(() => {
    const unlisten = listen<{ module_id: string; progress: number; message: string }>(
      "module-install-progress",
      (event) => {
        const { module_id, progress, message } = event.payload;
        if (module_id !== "TSK") return;
        setInstallProgress(progress);
        setInstallMessage(message);
        if (progress === 100) {
          // TSK just finished — re-fetch
          api.getCrossReferences(book, chapter, verse).then((r) => {
            setRefs(r);
            setStatus(r.length > 0 ? "ready" : "no-tsk");
          });
        }
      }
    );
    return () => { unlisten.then((f) => f()); };
  }, [book, chapter, verse]);

  function startInstall() {
    setStatus("installing");
    setInstallProgress(0);
    setInstallMessage("Starting…");
    api.installModule("TSK").catch(() => setStatus("no-tsk"));
  }

  function navigate(ref: CrossReference) {
    setCurrentRef({ book: ref.book, chapter: ref.chapter, verse: ref.verse });
    setView("reading");
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className={`absolute bottom-0 left-0 right-0 bg-surface border-t border-outline-variant rounded-t-2xl shadow-xl transition-all duration-300 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-secondary">link</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">
              Cross-references — {book} {chapter}:{verse}
            </span>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[55vh] overflow-y-auto">

          {/* Loading */}
          {status === "loading" && (
            <p className="text-secondary font-body-ui text-body-ui">Loading…</p>
          )}

          {/* TSK not installed — offer to install */}
          {status === "no-tsk" && (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant">link_off</span>
              <div>
                <p className="text-on-surface font-body-ui text-body-ui font-medium mb-1">
                  Cross-references require TSK
                </p>
                <p className="text-on-surface-variant font-body-ui text-[12px]">
                  Treasury of Scripture Knowledge — 340,000+ cross-references
                </p>
              </div>
              <button
                onClick={startInstall}
                className="mt-1 px-4 py-2 rounded-full bg-primary text-on-primary font-body-ui text-[13px] font-medium hover:opacity-90 transition-opacity"
              >
                Install TSK (~2 MB)
              </button>
            </div>
          )}

          {/* Installing with progress bar */}
          {status === "installing" && (
            <div className="py-8 flex flex-col items-center gap-4">
              <span className="material-symbols-outlined text-[36px] text-primary animate-pulse">downloading</span>
              <div className="w-full max-w-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-body-ui text-[12px] text-on-surface-variant">{installMessage}</span>
                  <span className="font-metadata-mono text-[11px] text-secondary">{installProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${installProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Cross-refs ready */}
          {status === "ready" && refs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {refs.map((ref, i) => (
                <button
                  key={i}
                  onClick={() => navigate(ref)}
                  className="px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-secondary-container hover:text-on-secondary-container text-on-surface-variant font-metadata-mono text-[12px] transition-colors border border-outline-variant"
                >
                  {ref.book} {ref.chapter}:{ref.verse}
                  {ref.end_verse ? `–${ref.end_verse}` : ""}
                </button>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
