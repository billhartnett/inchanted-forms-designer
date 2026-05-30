import { create } from "zustand";

export interface DesignerField {
  id: string;
  type: "text" | "checkbox" | "signature";
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
}

interface DesignerState {
  pdfPages: string[];
  currentPage: number;

  fields: DesignerField[];
  selectedId: string | null;

  zoom: number;

  setPdfPages: (pages: string[]) => void;
  setCurrentPage: (page: number) => void;

  addField: (field: DesignerField) => void;
  updateField: (id: string, updates: Partial<DesignerField>) => void;

  setSelected: (id: string | null) => void;

  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

export const useDesignerStore = create<DesignerState>((set) => ({
  pdfPages: [],
  currentPage: 0,

  fields: [],
  selectedId: null,

  zoom: 1,

  setPdfPages: (pages) => set({ pdfPages: pages, currentPage: 0 }),
  setCurrentPage: (page) => set({ currentPage: page }),

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
}));
