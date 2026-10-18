import type { KeyboardEvent } from "react";
import type { VerseRef } from "../store/app";
import { parseScriptureInput, parseVerseJump } from "../lib/scriptureRef";

interface Options {
  value: string;
  setValue: (v: string) => void;
  setOpen: (open: boolean) => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  /** What "v5" and "jn 3" resolve against (the live ref, or a console's preview ref). */
  baseRef: VerseRef;
  goTo: (ref: VerseRef) => void;
}

/**
 * The reference-typing behaviour shared by every "jump to a verse" input
 * (Study's ScriptureNav and the Live Show bar): book completion, "v5" shorthand,
 * the resolved-reference preview and the Space/Enter keys. State and rendering stay
 * with the caller; this only turns typed text into suggestions and actions.
 */
export function useScriptureInput({ value, setValue, setOpen, inputRef, baseRef, goTo }: Options) {
  const verseJumpNumber = parseVerseJump(value);
  const { matchedBook, suggestions, chapter, verse, refPart } = parseScriptureInput(value);
  const showDropdown = suggestions.length > 0 && !matchedBook && !verseJumpNumber;
  const canNavigate = !!(verseJumpNumber || matchedBook || suggestions.length > 0);

  // After selecting / completing a book, put it in the input with a trailing space
  function applyBook(book: string) {
    setValue(refPart ? `${book} ${refPart}` : `${book} `);
    setOpen(true);
    inputRef.current?.focus();
  }

  function navigate() {
    if (verseJumpNumber) {
      goTo({ book: baseRef.book, chapter: baseRef.chapter, verse: verseJumpNumber });
    } else {
      const book = matchedBook ?? suggestions[0];
      if (!book) return;
      goTo({ book, chapter: chapter ?? 1, verse: verse ?? 1 });
    }
    setValue("");
    setOpen(false);
  }

  /** Space handling: completes a book name, or inserts ":" after a chapter number. */
  function handleSpace(e: KeyboardEvent<HTMLInputElement>) {
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
      // inside "chapter:verse" and break the parse, so swallow it instead
      // of inserting anything.
      e.preventDefault();
    }
    // Otherwise (no matched book and no suggestions yet, or a book just
    // matched with nothing typed after it) fall through to a normal space.
  }

  // The resolved reference, shown once the book is confirmed and the chapter known.
  const previewBook = matchedBook ?? (suggestions.length === 1 ? suggestions[0] : null);
  const previewText = verseJumpNumber
    ? `${baseRef.book} ${baseRef.chapter}:${verseJumpNumber}`
    : previewBook && chapter
    ? `${previewBook} ${chapter}${verse ? `:${verse}` : ""}`
    : null;

  return { matchedBook, suggestions, showDropdown, canNavigate, previewText, applyBook, navigate, handleSpace };
}
