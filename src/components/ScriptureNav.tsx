import { useState, KeyboardEvent } from "react";
import { useAppStore } from "../store/app";
import { BIBLE_BOOKS, findBooks } from "../data/books";

// Longest-first so "1 Corinthians" is tried before "1 Chronicles"
const BOOKS_BY_LENGTH = [...BIBLE_BOOKS].sort((a, b) => b.length - a.length);

function parseRef(ref: string): { chapter: number | null; verse: number | null } {
  const s = ref.trim();
  if (!s) return { chapter: null, verse: null };
  const idx = s.indexOf(":");
  if (idx >= 0) {
    return {
      chapter: parseInt(s.slice(0, idx)) || null,
      verse: parseInt(s.slice(idx + 1)) || null,
    };
  }
  return { chapter: parseInt(s) || null, verse: null };
}

interface Parsed {
  bookPart: string;
  refPart: string;
  matchedBook: string | null;
  suggestions: string[];
  chapter: number | null;
  verse: number | null;
}

function parseInput(raw: string): Parsed {
  const input = raw.trimStart();
  if (!input) {
    return { bookPart: "", refPart: "", matchedBook: null, suggestions: [], chapter: null, verse: null };
  }

  // 1. Try to match a complete book name at the start (longest match wins)
  for (const book of BOOKS_BY_LENGTH) {
    if (input.toLowerCase().startsWith(book.toLowerCase())) {
      const after = input.slice(book.length).trimStart();
      if (!after || /^\d/.test(after)) {
        const { chapter, verse } = parseRef(after);
        return { bookPart: book, refPart: after, matchedBook: book, suggestions: [book], chapter, verse };
      }
    }
  }

  // 2. Partial: split at first "word(s) then space then digits" boundary
  //    handles "gen 1:2", "1 sam 3:5", "1co 2:3"
  const spaceRef = input.match(/^(.*?)\s+(\d[\d:]*)$/);
  const bookPart = spaceRef ? spaceRef[1] : input;
  const refPart = spaceRef ? spaceRef[2] : "";

  const suggestions = findBooks(bookPart);
  const { chapter, verse } = parseRef(refPart);
  return { bookPart, refPart, matchedBook: null, suggestions, chapter, verse };
}

interface Props {
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
}

export default function ScriptureNav({ inputRef }: Props) {
  const { setCurrentRef, setView } = useAppStore();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const { matchedBook, suggestions, chapter, verse, refPart } = parseInput(value);
  const showDropdown = open && suggestions.length > 0 && !matchedBook;

  // After selecting / completing a book, put it in the input with a trailing space
  function applyBook(book: string) {
    const newVal = refPart ? `${book} ${refPart}` : `${book} `;
    setValue(newVal);
    setOpen(true);
    inputRef.current?.focus();
  }

  function navigate() {
    const book = matchedBook ?? suggestions[0];
    if (!book) return;
    setCurrentRef({ book, chapter: chapter ?? 1, verse: verse ?? 1 });
    setView("reading");
    setValue("");
    setOpen(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === " ") {
      if (!matchedBook && suggestions.length > 0) {
        // "mat" + space -> "Matthew " — same completion Tab used to do.
        e.preventDefault();
        applyBook(suggestions[0]);
      } else if (matchedBook && /^\d+$/.test(refPart)) {
        // Chapter typed, no ":" yet — "Matthew 1" + space -> "Matthew 1:",
        // so the next keys typed are straight into the verse number.
        e.preventDefault();
        setValue(`${matchedBook} ${refPart}:`);
      } else if (matchedBook && refPart.includes(":")) {
        // Verse digits already started — a literal space here would land
        // inside "chapter:verse" and break parseRef's parsing, so swallow it
        // instead of inserting anything.
        e.preventDefault();
      }
      // Otherwise (no matched book and no suggestions yet, or a book just
      // matched with nothing typed after it) fall through to a normal space.
    } else if (e.key === "Enter" && (matchedBook || suggestions.length > 0)) {
      navigate();
    } else if (e.key === "Escape") {
      setValue("");
      setOpen(false);
    }
  }

  // Show resolved reference as a preview when book is confirmed and chapter is known
  const previewBook = matchedBook ?? (suggestions.length === 1 ? suggestions[0] : null);
  const previewText =
    previewBook && chapter
      ? `${previewBook} ${chapter}${verse ? `:${verse}` : ""}`
      : null;

  return (
    <div className="relative flex-1">
      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none select-none">
        auto_stories
      </span>
      <input
        ref={inputRef}
        className="w-full pl-8 pr-3 py-1 bg-surface-container-low border border-outline-variant rounded-DEFAULT focus:outline-none focus:border-primary text-body-ui font-body-ui transition-colors placeholder:text-on-surface-variant"
        placeholder="Go to… e.g. jn 3:16  (Ctrl+L)"
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onKeyDown={handleKey}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        spellCheck={false}
        autoComplete="off"
      />

      {/* Book suggestion dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-outline-variant rounded-DEFAULT shadow-lg z-[200] overflow-hidden">
          {suggestions.slice(0, 6).map((book, i) => (
            <button
              key={book}
              className={`w-full text-left px-3 py-1.5 font-body-ui text-body-ui flex items-center justify-between transition-colors ${
                i === 0
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface hover:bg-surface-container-low"
              }`}
              onMouseDown={(e) => { e.preventDefault(); applyBook(book); }}
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
      )}

      {/* Resolved reference preview (book confirmed, chapter known) */}
      {previewText && !showDropdown && open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-outline-variant rounded-DEFAULT shadow-sm z-[200] px-3 py-1.5 flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px] text-primary">arrow_forward</span>
          <span className="font-body-ui text-body-ui text-primary">{previewText}</span>
          <kbd className="font-metadata-mono text-[10px] text-secondary ml-auto bg-surface-container px-1.5 py-0.5 rounded">
            Enter
          </kbd>
        </div>
      )}
    </div>
  );
}
