import { useState, KeyboardEvent } from "react";
import { useAppStore, type VerseRef } from "../store/app";
import { useScriptureInput } from "../hooks/useScriptureInput";
import ScriptureSuggestions from "./ScriptureSuggestions";

interface Props {
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  /**
   * The ref "vN" shorthand and the "book confirmed, chapter known" preview
   * jump from — defaults to the live currentRef (TopBar's usage). Callers
   * navigating something other than the live ref (e.g. LiveShowRunner's
   * preview) pass their own so "v5" means "verse 5 of what I'm previewing,"
   * not of whatever happens to be live.
   */
  baseRef?: VerseRef;
  /** Called with the resolved ref instead of setCurrentRef + setView("reading")
   *  — callers that navigate a preview rather than the live ref pass this. */
  onNavigate?: (ref: VerseRef) => void;
  placeholder?: string;
}

export default function ScriptureNav({ inputRef, baseRef, onNavigate, placeholder }: Props) {
  const { setCurrentRef, setView, currentRef: liveRef } = useAppStore();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  function goTo(ref: VerseRef) {
    if (onNavigate) {
      onNavigate(ref);
    } else {
      setCurrentRef(ref);
      setView("reading");
    }
  }

  const nav = useScriptureInput({ value, setValue, setOpen, inputRef, baseRef: baseRef ?? liveRef, goTo });

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === " ") nav.handleSpace(e);
    else if (e.key === "Enter" && nav.canNavigate) nav.navigate();
    else if (e.key === "Escape") {
      setValue("");
      setOpen(false);
    }
  }

  return (
    <div className="relative flex-1">
      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none select-none">
        auto_stories
      </span>
      <input
        ref={inputRef}
        className="w-full pl-8 pr-3 py-1 focus:outline-none text-body-ui font-body-ui transition-colors placeholder:text-on-surface-variant field rounded-lg"
        placeholder={placeholder ?? "Go to… jn 3:16 or v5  (Ctrl+L)"}
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onKeyDown={handleKey}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        spellCheck={false}
        autoComplete="off"
      />

      {open && (
        <ScriptureSuggestions
          suggestions={nav.suggestions}
          previewText={nav.previewText}
          showDropdown={nav.showDropdown}
          onPick={nav.applyBook}
        />
      )}
    </div>
  );
}
