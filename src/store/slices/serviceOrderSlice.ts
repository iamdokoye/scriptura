import type { StateCreator } from "zustand";
import type { AppState, ServiceItem } from "../app";

const SERVICE_ORDER_KEY = "scriptura-service-order-v1";
function loadServiceOrder(): ServiceItem[] {
  try { return JSON.parse(localStorage.getItem(SERVICE_ORDER_KEY) ?? "[]"); } catch { return []; }
}
function saveServiceOrder(items: ServiceItem[]) {
  try { localStorage.setItem(SERVICE_ORDER_KEY, JSON.stringify(items)); } catch {}
}

export interface ServiceOrderSlice {
  serviceOrder: ServiceItem[];
  serviceOrderOpen: boolean;
  setServiceOrderOpen: (v: boolean) => void;
  addToServiceOrder: (item: Omit<ServiceItem, "id">) => void;
  removeFromServiceOrder: (id: string) => void;
  reorderServiceOrder: (fromIdx: number, toIdx: number) => void;
  clearServiceOrder: () => void;
}

export const createServiceOrderSlice: StateCreator<AppState, [], [], ServiceOrderSlice> = (set) => ({
  serviceOrder: loadServiceOrder(),
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
      saveServiceOrder(next);
      return { serviceOrder: next };
    }),
  removeFromServiceOrder: (id) =>
    set((s) => {
      const next = s.serviceOrder.filter((x) => x.id !== id);
      saveServiceOrder(next);
      return { serviceOrder: next };
    }),
  reorderServiceOrder: (fromIdx, toIdx) =>
    set((s) => {
      const next = [...s.serviceOrder];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      saveServiceOrder(next);
      return { serviceOrder: next };
    }),
  clearServiceOrder: () => {
    saveServiceOrder([]);
    set({ serviceOrder: [] });
  },
});
