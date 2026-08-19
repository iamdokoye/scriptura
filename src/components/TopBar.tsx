import { useEffect, useRef } from "react";
import { useAppStore, type Theme } from "../store/app";
import { api } from "../lib/tauri";
import ScriptureNav from "./ScriptureNav";
import SettingsSheet from "./SettingsSheet";

export default function TopBar() {
  const {
    currentRef, theme, setTheme, parallelMode, setParallelMode,
    setSearchQuery, setView, searchMode, setSearchMode,
    settingsOpen, setSettingsOpen,
    serviceOrderOpen, setServiceOrderOpen, serviceOrder,
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
    <header className="flex justify-between items-center h-12 px-content-margin w-full z-50 bg-surface border-b border-outline-variant shrink-0">
      {/* Left: logo + current reading position */}
      <div className="flex items-center gap-4">
        <span className="font-headline-md text-headline-md font-bold text-primary select-none">
          Scriptura
        </span>
        <button
          className="text-primary border-b-2 border-primary pb-0.5 translate-y-[1px] font-body-ui text-body-ui transition-colors hover:opacity-80"
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
            className="p-1 rounded text-secondary hover:bg-surface-container-low hover:text-primary transition-colors shrink-0"
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
                className="w-full pl-8 pr-3 py-1 bg-surface-container-low border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary text-body-ui font-body-ui transition-colors placeholder:text-on-surface-variant"
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
      <div className="flex items-center gap-1">
        <button
          aria-label="Service queue"
          onClick={() => setServiceOrderOpen(!serviceOrderOpen)}
          className={`relative p-1.5 rounded transition-colors ${
            serviceOrderOpen ? "bg-secondary-container text-on-secondary-container" : "text-secondary hover:bg-surface-container-low"
          }`}
          title="Service queue (Ctrl+Q)"
        >
          <span className="material-symbols-outlined text-[20px]">queue_play_next</span>
          {serviceOrder.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-primary text-on-primary font-metadata-mono text-[9px] flex items-center justify-center px-0.5 leading-none">
              {serviceOrder.length}
            </span>
          )}
        </button>
        <button
          aria-label="Toggle parallel view"
          onClick={() => setParallelMode(!parallelMode)}
          className={`p-1.5 rounded text-secondary hover:bg-surface-container-low transition-colors ${
            parallelMode ? "bg-secondary-container" : ""
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">splitscreen</span>
        </button>
        <button
          aria-label="Font size"
          className="p-1.5 rounded text-secondary hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">format_size</span>
        </button>
        <button
          aria-label="Toggle theme"
          onClick={cycleTheme}
          className="p-1.5 rounded text-secondary hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">{themeIcon}</span>
        </button>
        <button
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
          className={`p-1.5 rounded transition-colors ${
            settingsOpen
              ? "bg-secondary-container text-on-secondary-container"
              : "text-secondary hover:bg-surface-container-low"
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
        </button>
      </div>

      <SettingsSheet />
    </header>
  );
}
