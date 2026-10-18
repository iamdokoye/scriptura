interface Props {
  /** Book completions to offer; the first is the one Space accepts. */
  suggestions: string[];
  /** The resolved "Book ch:v" line shown when there are no completions to pick. */
  previewText: string | null;
  showDropdown: boolean;
  onPick: (book: string) => void;
}

/** The dropdown under a verse-reference input: book completions, or the resolved reference. */
export default function ScriptureSuggestions({ suggestions, previewText, showDropdown, onPick }: Props) {
  if (showDropdown) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl z-[200] overflow-hidden">
        {suggestions.slice(0, 6).map((book, i) => (
          <button
            key={book}
            className={`w-full text-left px-3 py-1.5 font-body-ui text-body-ui flex items-center justify-between transition-colors ${
              i === 0
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface hover:bg-surface-container-low"
            }`}
            onMouseDown={(e) => { e.preventDefault(); onPick(book); }}
          >
            <span>{book}</span>
            {i === 0 && (
              <kbd className="font-metadata-mono text-[10px] opacity-60 bg-surface-container px-1.5 py-0.5 rounded ml-3">
                Space
              </kbd>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (previewText) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 z-[200] px-3 py-1.5 flex items-center gap-2 glass rounded-2xl">
        <span className="material-symbols-outlined text-[14px] text-primary">arrow_forward</span>
        <span className="font-body-ui text-body-ui text-primary">{previewText}</span>
        <kbd className="font-metadata-mono text-[10px] text-secondary ml-auto bg-surface-container px-1.5 py-0.5 rounded">
          Enter
        </kbd>
      </div>
    );
  }

  return null;
}
