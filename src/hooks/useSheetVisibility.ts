import { useEffect, useRef, useState } from "react";

/**
 * Slide-up-on-open animation state shared by every sheet/overlay in the app.
 * Starts hidden and flips visible one frame after mount — setting the "visible"
 * class in the same frame as mount would skip the CSS transition entirely, since
 * the browser never gets a paint with the "hidden" state to transition from.
 *
 * `skip`, when true, returns visible immediately with no animation. Used by
 * StrongsSheet's presentation-window instance: macOS can pause
 * requestAnimationFrame callbacks for an unfocused WKWebView, so a sheet that
 * starts transparent and waits for the next frame can stay invisible until that
 * window happens to gain focus.
 *
 * `onVisible` fires once the sheet actually becomes visible (not called at all
 * when `skip` is true, since there's no transition to react to). Used by
 * NotesSheet to focus its textarea only once the slide-in has started.
 */
export function useSheetVisibility(
  isOpen: boolean,
  options?: { skip?: boolean; onVisible?: () => void },
): boolean {
  const { skip = false, onVisible } = options ?? {};
  const [animatedVisible, setAnimatedVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && !skip) {
      rafRef.current = requestAnimationFrame(() => {
        setAnimatedVisible(true);
        onVisible?.();
      });
    } else {
      setAnimatedVisible(false);
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // Deliberately not depending on onVisible: it fires once per open transition,
    // not on every re-render, so a fresh inline callback identity each render
    // (the common case — see NotesSheet) shouldn't retrigger the animation.
  }, [isOpen, skip]);

  return skip || animatedVisible;
}
