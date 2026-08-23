import type { StateCreator } from "zustand";
import { api } from "../../lib/tauri";
import type { AppState, ServiceItem } from "../app";

export interface ServiceOrderSlice {
  serviceOrder: ServiceItem[];
  serviceOrderOpen: boolean;
  setServiceOrderOpen: (v: boolean) => void;
  addToServiceOrder: (item: Omit<ServiceItem, "id">) => void;
  removeFromServiceOrder: (id: string) => void;
  reorderServiceOrder: (fromIdx: number, toIdx: number) => void;
  clearServiceOrder: () => void;
  /** Populates from the backend at startup. */
  hydrateServiceOrder: (items: ServiceItem[]) => void;
}

// Persisted to SQLite as a whole ordered list — matches how this was already
// treated as one unit against localStorage (add/remove/reorder are local array
// edits, persisted afterward), just replacing the storage backend underneath.
function persist(items: ServiceItem[]) {
  api.setServiceOrder(items).catch((e) => console.error("[serviceOrder] failed to persist", e));
}

export const createServiceOrderSlice: StateCreator<AppState, [], [], ServiceOrderSlice> = (set) => ({
  serviceOrder: [],
  serviceOrderOpen: false,
  setServiceOrderOpen: (serviceOrderOpen) => set({ serviceOrderOpen }),
  addToServiceOrder: (item) =>
    set((s) => {
      // Deduplicate by same book+chapter+verse+module
      const exists = s.serviceOrder.some(
        (x) => x.book === item.book && x.chapter === item.chapter && x.verse === item.verse && x.module === item.module
      );
      if (exists) return s;
      const next = [...s.serviceOrder, { ...item, id: crypto.randomUUID() }];
      persist(next);
      return { serviceOrder: next };
    }),
  removeFromServiceOrder: (id) =>
    set((s) => {
      const next = s.serviceOrder.filter((x) => x.id !== id);
      persist(next);
      return { serviceOrder: next };
    }),
  reorderServiceOrder: (fromIdx, toIdx) =>
    set((s) => {
      const next = [...s.serviceOrder];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      persist(next);
      return { serviceOrder: next };
    }),
  clearServiceOrder: () => {
    persist([]);
    set({ serviceOrder: [] });
  },

  hydrateServiceOrder: (serviceOrder) => set({ serviceOrder }),
});
