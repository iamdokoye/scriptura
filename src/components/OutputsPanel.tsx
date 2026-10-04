import { useEffect, useRef } from "react";
import type { usePresentationOutput } from "../hooks/usePresentationOutput";

interface Props {
  output: ReturnType<typeof usePresentationOutput>;
  onClose: () => void;
}

/** Dropdown opened from the top bar's Outputs button — pick which monitor the
 * presentation window goes to, or close it. Single-monitor setups skip the
 * picker and just show status, since there's nothing to choose. */
export default function OutputsPanel({ output, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { presentationActive, monitors, lastMonitorIndex, open, close } = output;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 bg-surface border border-outline-variant rounded-DEFAULT shadow-lg min-w-[240px] overflow-hidden"
    >
      <div className="px-3 py-1.5 bg-surface-container-low border-b border-outline-variant">
        <span className="font-metadata-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Present on…</span>
      </div>
      {monitors.length === 0 ? (
        <div className="px-3 py-2.5 font-body-ui text-[13px] text-on-surface-variant">No displays detected</div>
      ) : (
        monitors.map((m) => {
          const active = presentationActive && (lastMonitorIndex ?? monitors.find((mm) => mm.is_primary)?.index) === m.index;
          return (
            <button
              key={m.index}
              onClick={() => { open(m.index); onClose(); }}
              className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 font-body-ui text-body-ui text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="flex items-center gap-1.5">
                {active && <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />}
                {m.name ?? `Display ${m.index + 1}`}
              </span>
              <span className="font-metadata-mono text-[11px] text-on-surface-variant shrink-0">
                {m.is_primary ? "Primary · " : ""}{m.width}×{m.height}
              </span>
            </button>
          );
        })
      )}
      {presentationActive && (
        <button
          onClick={() => { close(); onClose(); }}
          className="w-full text-left px-3 py-2 font-body-ui text-[13px] text-error hover:bg-error-container/20 transition-colors border-t border-outline-variant"
        >
          Stop output
        </button>
      )}
    </div>
  );
}
