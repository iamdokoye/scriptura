import { useEffect, useState } from "react";
import { api, type MonitorInfo } from "../lib/tauri";
import { useAppStore } from "../store/app";
import { usePresentationCloseSync } from "./usePresentationCloseSync";

/**
 * Owns the presentation output window's open/closed state and monitor list —
 * shared by the top bar's LIVE button and the Outputs panel so both act on
 * the same "which monitor did we last open on" choice instead of guessing
 * independently. Also keeps `presentationActive` in sync when the operator
 * closes the window natively (via its own close button), regardless of
 * which presentation-workspace screen is currently mounted.
 */
export function usePresentationOutput() {
  const { presentationActive, setPresentationActive } = useAppStore();
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [lastMonitorIndex, setLastMonitorIndex] = useState<number | undefined>(undefined);

  usePresentationCloseSync(setPresentationActive);

  useEffect(() => {
    api.listMonitors().then(setMonitors).catch(() => {});
  }, []);

  async function open(monitorIndex?: number) {
    const index = monitorIndex ?? lastMonitorIndex ?? monitors.find((m) => m.is_primary)?.index ?? monitors[0]?.index;
    await api.openPresentationWindow(index).catch(() => {});
    setLastMonitorIndex(index);
    setPresentationActive(true);
  }

  async function close() {
    await api.closePresentationWindow().catch(() => {});
    setPresentationActive(false);
  }

  async function toggle() {
    if (presentationActive) await close();
    else await open();
  }

  return { presentationActive, monitors, lastMonitorIndex, open, close, toggle };
}
