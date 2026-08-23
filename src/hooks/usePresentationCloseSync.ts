import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Now that the presentation window is a normal decorated window (see
 * open_presentation_window in src-tauri/src/commands/presentation.rs), an
 * operator can close it with its native close button, not just Scriptura's
 * own "Stop presentation" toggle. Without this, closing it that way would
 * leave the main window stuck showing "● LIVE" for a window that's gone.
 */
export function usePresentationCloseSync(setPresentationActive: (active: boolean) => void) {
  useEffect(() => {
    const unlisten = listen("presentation-closed", () => setPresentationActive(false));
    return () => { unlisten.then((f) => f()); };
  }, [setPresentationActive]);
}
