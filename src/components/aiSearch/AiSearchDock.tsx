import { useEffect } from "react";
import type { VerseRef } from "../../store/app";
import { useAiSearchStore } from "../../store/aiSearchStore";
import { ResizeHandle, useResizable } from "../../hooks/useResizable";
import ErrorBoundary from "../ErrorBoundary";
import AiSearchPanel from "./AiSearchPanel";

interface Props {
  onNavigate: (ref: VerseRef) => void;
  activeRef: VerseRef;
}

/**
 * The resizable "Ask Scripture" side panel that sits beside the verse list. Renders
 * nothing while closed, so the feature costs the console nothing until it's opened, and
 * a crash inside it is contained to this panel (the boundary remounts on every open).
 */
export default function AiSearchDock({ onNavigate, activeRef }: Props) {
  const open = useAiSearchStore((s) => s.open);
  const setOpen = useAiSearchStore((s) => s.setOpen);

  const width = useResizable({
    storageKey: "scriptura.live.aiWidth", initial: 340, min: 260, axis: "x", invert: true,
    max: () => Math.round(window.innerWidth * 0.5),
  });

  // Ctrl/Cmd+Shift+K: open Ask Scripture (or close it, if it's open).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        useAiSearchStore.getState().toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <>
      <ResizeHandle axis="x" label="Ask Scripture" dragging={width.dragging} handleProps={width.handleProps} />
      <aside style={{ width: width.size }} className="shrink-0 min-h-0 my-1 mr-1 rounded-2xl overflow-hidden border border-outline-variant bg-surface-container-lowest/60">
        <ErrorBoundary compact label="Ask Scripture">
          <AiSearchPanel onNavigate={onNavigate} activeRef={activeRef} onClose={() => setOpen(false)} />
        </ErrorBoundary>
      </aside>
    </>
  );
}
