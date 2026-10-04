import { useEffect, useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useAppStore } from "../store/app";
import { usePresentationOutput } from "../hooks/usePresentationOutput";
import OutputsPanel from "./OutputsPanel";
import SettingsSheet from "./Settings";

type PresentationTab = "scriptures" | "slides" | "songs";

/**
 * Top bar for the presentation workspace only (study mode keeps the plain
 * TopBar + SideNav). Replaces the left sidebar with a tab switcher, and adds
 * the LIVE/BLACK/CLEAR transport controls that used to live inline in
 * LiveShowRunner's own header — they belong here so they're visible no
 * matter which presentation screen (Live Show, Customize) is on screen.
 */
export default function PresentationTopBar() {
  const {
    view, setView, settingsOpen, setSettingsOpen, liveBlack, setLiveBlack, liveEmergency, setLiveEmergency,
    serviceOrderOpen, setServiceOrderOpen, setDisplayPrefs, presentationActive,
  } = useAppStore();
  const output = usePresentationOutput();
  const [outputsOpen, setOutputsOpen] = useState(false);

  const activeTab: PresentationTab = "scriptures";
  const cleared = !liveBlack && !liveEmergency;

  function clearOverrides() {
    setLiveBlack(false);
    setLiveEmergency(false);
  }

  const presentationContextKeys: Record<string, 1 | 2 | 3 | 4> = {
    Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4,
    Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4,
  };

  // Shortcuts that apply across the whole presentation workspace (not just
  // LiveShowRunner), scoped here since this bar is mounted regardless of
  // which presentation screen is on screen:
  //  - C / Ctrl+Shift+E: black/emergency, this bar's own BLACK/CLEAR buttons
  //  - Ctrl+Q: open the queue editor (reorder/remove — the inline Queue
  //    column in LiveShowRunner is preview-only)
  //  - Ctrl+1-4: presentation verse context, while output is live
  // These used to only fire from inside ReadingView (see
  // useReadingShortcuts.ts), which is no longer reachable once presenting —
  // the sidebar nav that reached it is gone in this design.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setLiveEmergency(!liveEmergency);
        return;
      }
      if (e.ctrlKey && !e.altKey && e.code === "KeyQ") {
        e.preventDefault();
        setServiceOrderOpen(!serviceOrderOpen);
        return;
      }
      if (e.ctrlKey && presentationActive && e.code in presentationContextKeys) {
        e.preventDefault();
        setDisplayPrefs({ presentationContext: presentationContextKeys[e.code] });
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setLiveBlack(!liveBlack);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [liveBlack, setLiveBlack, liveEmergency, setLiveEmergency, serviceOrderOpen, setServiceOrderOpen, presentationActive, setDisplayPrefs]);

  return (
    <header className="flex items-center h-14 px-content-margin w-full z-50 glass !rounded-none !border-x-0 !border-t-0 shrink-0 gap-6">
      <span className="font-headline-md text-headline-md font-bold text-primary select-none shrink-0">
        Scriptura
      </span>

      <nav className="flex items-center gap-1 shrink-0">
        <TabButton label="Scriptures" active={activeTab === "scriptures"} onClick={() => setView("live")} />
        <TabButton label="Slides" active={false} disabled />
        <TabButton label="Songs" active={false} disabled />
      </nav>

      <div className="flex-1 flex items-center justify-center gap-2">
        <button
          onClick={output.toggle}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-body-ui text-[13px] font-bold transition-colors ${
            output.presentationActive ? "btn-live" : "ctl text-on-surface"
          }`}
          title={output.presentationActive ? "Stop the presentation output" : "Send output live"}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${output.presentationActive ? "bg-on-error animate-pulse" : "bg-on-surface-variant"}`} />
          LIVE
        </button>
        <button
          onClick={() => setLiveBlack(!liveBlack)}
          className={`px-4 py-1.5 rounded-lg font-body-ui text-[13px] font-bold transition-colors ${
            liveBlack ? "bg-on-surface text-surface" : "ctl text-on-surface"
          }`}
          title="Cut the live output to black (C)"
        >
          BLACK
        </button>
        <button
          onClick={clearOverrides}
          disabled={cleared}
          className={`px-4 py-1.5 rounded-lg font-body-ui text-[13px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            cleared ? "field text-on-surface-variant" : "ctl text-primary"
          }`}
          title="Clear black/emergency overrides and resume normal output"
        >
          CLEAR
        </button>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="relative">
          <IconButton
            icon="cast"
            label="Outputs"
            active={outputsOpen}
            onClick={() => setOutputsOpen((v) => !v)}
          />
          {outputsOpen && <OutputsPanel output={output} onClose={() => setOutputsOpen(false)} />}
        </div>
        <IconButton icon="palette" label="Themes" active={view === "customize"} onClick={() => setView("customize")} />
        <IconButton icon="movie" label="Studio" disabled title="Coming soon" />
        <IconButton icon="notifications" label="Alerts" disabled title="Coming soon" />
        <IconButton icon="help" label="Get help" onClick={() => openExternal("https://github.com/iamdokoye/scriptura/issues")} />
        <IconButton icon="settings" label="Settings" active={settingsOpen} onClick={() => setSettingsOpen(true)} />
      </div>

      <SettingsSheet />
    </header>
  );
}

function TabButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      className={`px-3.5 py-1.5 rounded-lg font-body-ui text-[14px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "btn-primary" : "text-on-surface hover:text-primary"
      }`}
    >
      {label}
    </button>
  );
}

function IconButton({ icon, label, active, disabled, title, onClick }: {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "ctl-active" : "ghost text-secondary"
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}
