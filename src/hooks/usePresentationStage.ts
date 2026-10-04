import { useEffect, useState } from "react";
import { api, type MonitorInfo } from "../lib/tauri";
import type { StageSize } from "../views/PresentationView";

const DEFAULT_STAGE: StageSize = { w: 1920, h: 1080 };

function fromMonitor(m: MonitorInfo | undefined): StageSize | null {
  if (!m || !m.width || !m.height) return null;
  const scale = m.scale_factor || 1;
  return { w: Math.round(m.width / scale), h: Math.round(m.height / scale) };
}

/**
 * The CSS-pixel size the output screen lays its text out against — what the
 * console must measure verse splits with and draw its Main Output preview at.
 * While the output window is open this is its real content size (polled, so
 * resizing or moving it to another display is picked up); otherwise it falls
 * back to the primary monitor's logical size.
 *
 * Monitor sizes from the OS are physical pixels, so they are divided by the
 * scale factor: on a Retina display the page sees half the physical width, and
 * measuring with the physical size made every verse look like it fit.
 */
export function usePresentationStage(presentationActive: boolean): StageSize {
  const [fallback, setFallback] = useState<StageSize>(DEFAULT_STAGE);
  const [live, setLive] = useState<StageSize | null>(null);

  useEffect(() => {
    api.listMonitors()
      .then((ms) => setFallback(fromMonitor(ms.find((m) => m.is_primary) ?? ms[0]) ?? DEFAULT_STAGE))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!presentationActive) { setLive(null); return; }
    let cancelled = false;
    async function poll() {
      try {
        const size = await api.getPresentationWindowSize();
        if (cancelled) return;
        const next = size ? { w: Math.round(size[0]), h: Math.round(size[1]) } : null;
        setLive((prev) => (prev?.w === next?.w && prev?.h === next?.h ? prev : next));
      } catch {
        // Not running under Tauri, or the window just closed — keep the last value.
      }
    }
    poll();
    const timer = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [presentationActive]);

  return live ?? fallback;
}
