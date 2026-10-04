import { useEffect, useRef } from "react";
import { useAppStore, type Theme } from "../store/app";
import { api } from "../lib/tauri";
import ScriptureNav from "./ScriptureNav";
import SettingsSheet from "./Settings";

export default function TopBar() {
  const {
    currentRef, theme, setTheme, parallelMode, setParallelMode,
    setSearchQuery, setView, searchMode, setSearchMode,
    settingsOpen, setSettingsOpen,
    serviceOrderOpen, setServiceOrderOpen, serviceOrder,
    workspace,
  } = useAppStore();

  const wordInputRef = useRef<HTMLInputElement>(null);
  const scriptureInputRef = useRef<HTMLInputElement>(null);

  const refLabel = `${currentRef.book} ${currentRef.chapter}:${currentRef.verse}`;

  function cycleTheme() {
    const next: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
    const t = next[theme];
    setTheme(t);
    api.setPreferences({ theme: t }).catch(() => {});
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === "h" || e.code === "KeyH")) {
        e.preventDefault();
        setView("history");
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "k") {
        e.preventDefault();
        setSearchMode("word");
        setView("search");
        setTimeout(() => wordInputRef.current?.focus(), 30);
      } else if (e.key === "l") {
        e.preventDefault();
        setSearchMode("scripture");
        setView("reading");
        setTimeout(() => scriptureInputRef.current?.focus(), 30);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // setters and refs are stable

  function toggleMode() {
    if (searchMode === "word") {
      setSearchMode("scripture");
      setView("reading");
      setTimeout(() => scriptureInputRef.current?.focus(), 30);
    } else {
      setSearchMode("word");
      setView("search");
      setTimeout(() => wordInputRef.current?.focus(), 30);
    }
  }

  const themeIcon = theme === "dark" ? "light_mode" : theme === "system" ? "contrast" : "dark_mode";
  const modeLabel = searchMode === "word" ? "Scripture navigation (Ctrl+L)" : "Word search (Ctrl+K)";
  // Icon shows what you'll switch TO (not current mode)
  const modeIcon = searchMode === "word" ? "auto_stories" : "search";

  return (
    <header className="flex justify-between items-center h-14 px-content-margin w-full z-50 glass !rounded-none !border-x-0 !border-t-0 shrink-0">
      {/* Left: logo + current reading position */}
      <div className="flex items-center gap-4">
        <span className="font-headline-md text-headline-md font-bold text-primary select-none">
          Scriptura
        </span>
        <button
          className="ctl rounded-lg px-3 py-1.5 text-on-surface font-semibold font-body-ui text-body-ui"
          onClick={() => setView("reading")}
        >
          {refLabel}
        </button>
      </div>

      {/* Center: dual-mode search */}
      <div className="flex-1 flex justify-center px-8 max-w-xl mx-auto">
        <div className="w-full max-w-sm hidden lg:flex items-center gap-1.5">

          {/* Mode-switch icon button */}
          <button
            onClick={toggleMode}
            title={modeLabel}
            className="ctl rounded-lg p-1.5 text-secondary hover:text-primary shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">{modeIcon}</span>
          </button>

          {/* Word search input */}
          {searchMode === "word" && (
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
                search
              </span>
              <input
                ref={wordInputRef}
                className="w-full pl-9 pr-3 py-1.5 field rounded-lg focus:outline-none text-body-ui font-body-ui transition-colors placeholder:text-on-surface-variant"
                placeholder="Search (Ctrl+K)"
                onFocus={() => setView("search")}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {/* Scripture navigator */}
          {searchMode === "scripture" && (
            <ScriptureNav inputRef={scriptureInputRef} />
          )}
        </div>
      </div>

      {/* Right: toolbar actions */}
      <div className="flex items-center gap-2.5">
        {workspace === "presentation" && (
          <button
            aria-label="Service queue"
            onClick={() => setServiceOrderOpen(!serviceOrderOpen)}
            className={`relative p-2 rounded-lg ${
              serviceOrderOpen ? "ctl-active" : "ctl text-secondary"
            }`}
            title="Service queue (Ctrl+Q)"
          >
            <span className="material-symbols-outlined text-[20px]">queue_play_next</span>
            {serviceOrder.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full btn-primary text-on-primary font-metadata-mono text-[9px] flex items-center justify-center px-0.5 leading-none">
                {serviceOrder.length}
              </span>
            )}
          </button>
        )}
        <button
          aria-label="Toggle parallel view"
          onClick={() => setParallelMode(!parallelMode)}
          className={`p-2 rounded-lg ${parallelMode ? "ctl-active" : "ctl text-secondary"}`}
        >
          <span className="material-symbols-outlined text-[20px]">splitscreen</span>
        </button>
        <button
          aria-label="Font size"
          className="p-2 rounded-md ghost text-secondary"
        >
          <span className="material-symbols-outlined text-[20px]">format_size</span>
        </button>
        <button
          aria-label="Toggle theme"
          onClick={cycleTheme}
          className="p-2 rounded-md ghost text-secondary"
        >
          <span className="material-symbols-outlined text-[20px]">{themeIcon}</span>
        </button>
        <button
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
          className={`p-2 rounded-lg ${settingsOpen ? "ctl-active" : "ctl text-secondary"}`}
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
        </button>
      </div>

      <SettingsSheet />
    </header>
  );
}
