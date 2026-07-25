import { create } from "zustand";

interface GuidesState {
  vertical: number | null;
  horizontal: number | null;
  setVertical: (x: number | null) => void;
  setHorizontal: (y: number | null) => void;
  clearGuides: () => void;
}

export const useGuidesStore = create<GuidesState>((set) => ({
  vertical: null,
  horizontal: null,
  setVertical: (x) => set({ vertical: x }),
  setHorizontal: (y) => set({ horizontal: y }),
  clearGuides: () => set({ vertical: null, horizontal: null }),
}));
