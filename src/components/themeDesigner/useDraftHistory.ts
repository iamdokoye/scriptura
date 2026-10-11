import { useCallback, useRef, useState } from "react";

const COALESCE_MS = 500;
const MAX_HISTORY = 100;

/**
 * Draft state with undo/redo. Edits made within COALESCE_MS of each other
 * share one undo step, so dragging a box or scrubbing a slider undoes as a
 * single gesture instead of one step per pointer event.
 *
 * The stacks live in refs (not state) so undo/redo never nest setState calls
 * inside updater functions — those double-run under React StrictMode.
 */
export function useDraftHistory<T>(initial: T) {
  const [draft, setDraftState] = useState<T>(initial);
  const [, bump] = useState(0);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastPush = useRef(0);
  const current = useRef(draft);
  current.current = draft;

  const set = useCallback((next: T) => {
    const now = Date.now();
    if (now - lastPush.current > COALESCE_MS) {
      past.current = [...past.current.slice(-(MAX_HISTORY - 1)), current.current];
    }
    lastPush.current = now;
    future.current = [];
    current.current = next;
    setDraftState(next);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current[past.current.length - 1];
    if (previous === undefined) return;
    past.current = past.current.slice(0, -1);
    future.current = [current.current, ...future.current];
    lastPush.current = 0;
    current.current = previous;
    setDraftState(previous);
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const [next, ...rest] = future.current;
    if (next === undefined) return;
    future.current = rest;
    past.current = [...past.current, current.current];
    lastPush.current = 0;
    current.current = next;
    setDraftState(next);
    bump((n) => n + 1);
  }, []);

  /** Replace the draft without recording history (switching theme, saving). */
  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    lastPush.current = 0;
    current.current = next;
    setDraftState(next);
    bump((n) => n + 1);
  }, []);

  return { draft, set, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
