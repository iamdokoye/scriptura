import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type CrossReference } from "../lib/tauri";
import { useAppStore } from "../store/app";
import SheetShell from "./SheetShell";

interface Props {
  isOpen: boolean;
  book: string;
  chapter: number;
  verse: number;
  onClose: () => void;
}

type Status = "loading" | "installing" | "ready" | "no-tsk" | "no-refs";

interface CrossReferencePassage extends CrossReference {
  text: string | null;
}

function plainText(spans: { text: string }[]) {
  return spans.map((span) => span.text).join("").trim();
}

export default function CrossRefSheet({ isOpen, book, chapter, verse, onClose }: Props) {
  const { primaryModule, setCurrentRef, setView } = useAppStore();
  const [refs, setRefs] = useState<CrossReference[]>([]);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [passages, setPassages] = useState<CrossReferencePassage[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [installProgress, setInstallProgress] = useState(0);
  const [installMessage, setInstallMessage] = useState("");

  const loadCrossReferences = useCallback(async () => {
    if (!primaryModule) {
      setStatus("no-tsk");
      return;
    }

    setStatus("loading");
    setRefs([]);
    setSourceText(null);
    setPassages([]);

    try {
      const [allRefs, source] = await Promise.all([
        api.getCrossReferences(book, chapter, verse),
        api.getVerse(primaryModule, book, chapter, verse),
      ]);
      setSourceText(plainText(source.spans));

      // TSK includes links back to the selected verse in some entries. The
      // selected passage is already displayed first, so do not repeat it.
      const related = allRefs.filter(
        (ref) => ref.book !== book || ref.chapter !== chapter || ref.verse !== verse,
      );
      setRefs(related);

      if (related.length === 0) {
        setStatus("no-refs");
        return;
      }

      const resolved = await Promise.all(
        related.map(async (ref): Promise<CrossReferencePassage> => {
          try {
            const relatedVerse = await api.getVerse(primaryModule, ref.book, ref.chapter, ref.verse);
            return { ...ref, text: plainText(relatedVerse.spans) };
          } catch {
            // Keep the reference visible even if this Bible module does not
            // contain the exact verse (for example, versification differences).
            return { ...ref, text: null };
          }
        }),
      );
      setPassages(resolved);
      setStatus("ready");
    } catch {
      setStatus("no-tsk");
    }
  }, [book, chapter, primaryModule, verse]);

  // Fetch cross-refs whenever the sheet opens or the verse changes
  useEffect(() => {
    if (isOpen) void loadCrossReferences();
  }, [isOpen, loadCrossReferences]);

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
          void loadCrossReferences();
        }
      }
    );
    return () => { unlisten.then((f) => f()); };
  }, [loadCrossReferences]);

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

  return (
    <SheetShell
      isOpen={isOpen}
      onClose={onClose}
      icon="link"
      title={`Cross-references — ${book} ${chapter}:${verse}`}
      maxHeightVh={55}
    >
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

      {/* Installed, but this verse has no related passages */}
      {status === "no-refs" && sourceText !== null && (
        <div className="flex flex-col gap-4">
          <PassageCard
            label="Selected verse"
            reference={`${book} ${chapter}:${verse}`}
            text={sourceText}
            highlighted
          />
          <p className="text-on-surface-variant font-body-ui text-[13px]">
            No cross-references were found for this verse.
          </p>
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
      {status === "ready" && sourceText !== null && (
        <div className="flex flex-col gap-4">
          <PassageCard
            label="Selected verse"
            reference={`${book} ${chapter}:${verse}`}
            text={sourceText}
            highlighted
          />

          <div className="pt-1">
            <p className="mb-2 font-metadata-mono text-[11px] uppercase tracking-wide text-secondary">
              Cross-references ({refs.length})
            </p>
            <div className="flex flex-col gap-2">
              {passages.map((ref, i) => (
                <button
                  key={`${ref.book}-${ref.chapter}-${ref.verse}-${i}`}
                  onClick={() => navigate(ref)}
                  className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-left transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
                >
                  <span className="block font-metadata-mono text-[12px] text-secondary">
                    {ref.book} {ref.chapter}:{ref.verse}
                    {ref.end_verse ? `–${ref.end_verse}` : ""}
                  </span>
                  <span className="mt-1 block font-body-reading text-[15px] leading-relaxed text-on-surface">
                    {ref.text ?? "Verse text is unavailable in the selected Bible module."}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </SheetShell>
  );
}

function PassageCard({ label, reference, text, highlighted = false }: {
  label: string;
  reference: string;
  text: string;
  highlighted?: boolean;
}) {
  return (
    <article className={`rounded-xl border px-4 py-3 ${
      highlighted
        ? "border-primary/40 bg-primary-container/25"
        : "border-outline-variant bg-surface-container-low"
    }`}>
      <p className="font-metadata-mono text-[11px] uppercase tracking-wide text-secondary">
        {label} · {reference}
      </p>
      <p className="mt-1 font-body-reading text-[16px] leading-relaxed text-on-surface">{text}</p>
    </article>
  );
}
