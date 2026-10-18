import type { StateCreator } from "zustand";
import { api } from "../../lib/tauri";
import { itemEndVerse, type AppState, type ServiceItem } from "../app";
import type { PresentationItemOverride } from "../../lib/tauri";

export interface ServiceOrderSlice {
  serviceOrder: ServiceItem[];
  serviceOrderOpen: boolean;
  setServiceOrderOpen: (v: boolean) => void;
  addToServiceOrder: (item: Omit<ServiceItem, "id"> | Array<Omit<ServiceItem, "id">>) => void;
  removeFromServiceOrder: (id: string) => void;
  reorderServiceOrder: (fromIdx: number, toIdx: number) => void;
  clearServiceOrder: () => void;
  updateServiceItemOverride: (id: string, presentation_override: PresentationItemOverride | null) => void;
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
  addToServiceOrder: (itemOrItems) =>
    set((s) => {
      const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
      let changed = false;
      const next = [...s.serviceOrder];
      for (const rawItem of items) {
        const end = itemEndVerse(rawItem);
        const isRange = end > rawItem.verse;
        const baseId = (rawItem as any).id ?? crypto.randomUUID();
        const id = isRange && !baseId.includes("#end:") ? `${baseId}#end:${end}` : baseId;
        const item: ServiceItem = {
          ...rawItem,
          verse_end: isRange ? end : undefined,
          id,
        };
        // Deduplicate by same book+chapter+verse+endVerse+module
        const exists = next.some(
          (x) =>
            x.book === item.book &&
            x.chapter === item.chapter &&
            x.verse === item.verse &&
            itemEndVerse(x) === itemEndVerse(item) &&
            x.module === item.module
        );
        if (!exists) {
          next.push(item);
          changed = true;
        }
      }
      if (!changed) return s;
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
  updateServiceItemOverride: (id, presentation_override) =>
    set((s) => {
      const next = s.serviceOrder.map((item) => item.id === id ? { ...item, presentation_override } : item);
      persist(next);
      return { serviceOrder: next };
    }),

  hydrateServiceOrder: (serviceOrder) =>
    set({
      serviceOrder: serviceOrder.map((item) => {
        const end = itemEndVerse(item);
        return {
          ...item,
          verse_end: end > item.verse ? end : undefined,
        };
      }),
    }),
});
