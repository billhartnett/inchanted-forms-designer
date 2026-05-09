import { create } from "zustand";
import { DesignerField } from "../types/Field";

interface DesignerState {
  fields: DesignerField[];
  selectedId: string | null;
  zoom: number;

  pdfPages: string[];
  currentPage: number;

  addField: (field: DesignerField) => void;
  updateField: (id: string, updates: Partial<DesignerField>) => void;
  setSelected: (id: string | null) => void;

  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;

  setPdfPages: (pages: string[]) => void;
  setCurrentPage: (page: number) => void;
}

export const useDesignerStore = create<DesignerState>((set) => ({
  fields: [],
  selectedId: null,
  zoom: 1,

  pdfPages: [],
  currentPage: 0,

  addField: (field) =>
    set((state) => ({ fields: [...state.fields, field] })),

  updateField: (id, updates) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),

  setSelected: (id) => set({ selectedId: id }),

  zoomIn: () => set((s) => ({ zoom: Math.min(s.zoom + 0.1, 2) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(s.zoom - 0.1, 0.3) })),
  zoomReset: () => set({ zoom: 1 }),

  setPdfPages: (pages) => set({ pdfPages: pages, currentPage: 0 }),
  setCurrentPage: (page) => set({ currentPage: page }),
}));
