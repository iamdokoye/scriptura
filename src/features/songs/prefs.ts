import { useState } from "react";
import { DEFAULT_MAX_LINES, MAX_LINES, MIN_LINES } from "./slides";

/** A value kept in localStorage; falls back to `initial` if storage is unavailable. */
export function usePref<T>(key: string, initial: T, valid: (v: unknown) => v is T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, initial, valid));
  return [value, (v) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }];
}

export function readPref<T>(key: string, initial: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (valid(parsed)) return parsed;
    }
  } catch { /* storage unavailable or corrupt */ }
  return initial;
}

export const MAX_LINES_KEY = "scriptura.songs.maxLines";
export const isLines = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= MIN_LINES && v <= MAX_LINES;
export const isBool = (v: unknown): v is boolean => typeof v === "boolean";
export const readMaxLines = () => readPref(MAX_LINES_KEY, DEFAULT_MAX_LINES, isLines);
