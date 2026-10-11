import { useEffect, useRef } from "react";
import { GRIDS, type GridId, type GridSettings } from "./grids";

interface Props {
  settings: GridSettings;
  onChange: (next: GridSettings) => void;
  onClose: () => void;
}

/** Popover for the canvas toolbar: pick any combination of guide grids and
 * switch snapping on. Snapping needs lines to snap to, so turning it on with
 * no grid showing also turns on the 10% grid. */
export default function GridMenu({ settings, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      // The toolbar button toggles the menu itself; ignore clicks on it here.
      const target = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && !target.closest("[data-grid-menu-trigger]")) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const toggleGrid = (id: GridId) =>
    onChange({
      ...settings,
      enabled: settings.enabled.includes(id) ? settings.enabled.filter((g) => g !== id) : [...settings.enabled, id],
    });

  const setSnap = (snap: boolean) =>
    onChange({
      snap,
      enabled: snap && settings.enabled.length === 0 ? ["tens"] : settings.enabled,
    });

  return (
    <div ref={ref} role="dialog" aria-label="Grids and snapping" className="absolute left-1/2 -translate-x-1/2 top-full mt-3 z-30 w-[280px] glass glass-strong rounded-2xl p-2 flex flex-col max-h-[max(14rem,calc(100vh-17rem))]">
      <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl cursor-pointer ghost shrink-0">
        <span>
          <span className="block font-body-ui text-[13px] font-medium text-on-surface">Snap to grid</span>
          <span className="block font-body-ui text-[11px] text-on-surface-variant">Boxes lock to the lines. Hold Alt to move freely.</span>
        </span>
        <input type="checkbox" checked={settings.snap} onChange={(e) => setSnap(e.target.checked)} className="accent-primary w-4 h-4 shrink-0" />
      </label>

      <div className="flex items-center justify-between px-3 pt-2 pb-1 mt-1 border-t border-outline-variant shrink-0">
        <p className="field-label !mb-0">Grids</p>
        {settings.enabled.length > 0 && (
          <button type="button" onClick={() => onChange({ ...settings, enabled: [] })} className="font-body-ui text-[12px] text-on-surface-variant hover:text-on-surface">
            Hide all
          </button>
        )}
      </div>

      <ul className="space-y-0.5 overflow-y-auto min-h-0">
        {GRIDS.map((grid) => (
          <li key={grid.id}>
            <label className="flex items-center gap-3 px-3 py-1.5 rounded-xl cursor-pointer ghost">
              <input type="checkbox" checked={settings.enabled.includes(grid.id)} onChange={() => toggleGrid(grid.id)} className="accent-primary w-4 h-4 shrink-0" />
              <span className="min-w-0">
                <span className="block font-body-ui text-[13px] text-on-surface">{grid.label}</span>
                <span className="block font-body-ui text-[11px] text-on-surface-variant">{grid.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
