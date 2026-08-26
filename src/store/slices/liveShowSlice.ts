import type { StateCreator } from "zustand";
import type { AppState, VerseRef } from "../app";

const MAX_LIVE_HISTORY = 20;

/**
 * State for the dedicated Live Show console — kept separate from the plain
 * "browse the Bible, and if presenting, whatever I browse goes out live"
 * flow that ReadingView's own Go Live button already offers. That flow is
 * intentionally left alone: it's the simple path for one person reading
 * with no queue. This slice backs the deliberate preview → Go → live
 * workflow for running a real service off the queue, where the operator
 * needs to be able to look ahead without whatever they're looking at
 * appearing on the screen behind them.
 *
 * None of this is persisted — it's live-session state, meaningless once
 * the show is over.
 */
export interface LiveShowSlice {
  /** Cut the live output to a plain black screen without losing liveRef's position. */
  liveBlack: boolean;
  setLiveBlack: (v: boolean) => void;

  /** A dedicated "something's wrong" screen that overrides black and live content alike. */
  liveEmergency: boolean;
  setLiveEmergency: (v: boolean) => void;

  /** Refs bumped off `currentRef` by Go, most recent first — what Back steps through. */
  liveHistory: VerseRef[];
  pushLiveHistory: (ref: VerseRef) => void;
  /** Removes and returns the most recent entry, or undefined if the stack is empty. */
  popLiveHistory: () => VerseRef | undefined;
}

export const createLiveShowSlice: StateCreator<AppState, [], [], LiveShowSlice> = (set, get) => ({
  liveBlack: false,
  setLiveBlack: (liveBlack) => set({ liveBlack }),

  liveEmergency: false,
  setLiveEmergency: (liveEmergency) => set({ liveEmergency }),

  liveHistory: [],
  pushLiveHistory: (ref) =>
    set((s) => ({ liveHistory: [ref, ...s.liveHistory].slice(0, MAX_LIVE_HISTORY) })),
  popLiveHistory: () => {
    const [top, ...rest] = get().liveHistory;
    if (top) set({ liveHistory: rest });
    return top;
  },
});
