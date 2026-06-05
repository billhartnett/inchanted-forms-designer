import { create } from "zustand";

export type RectField = {
  id: string;
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
};

export type TextField = {
  id: string;
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
};

export type Field = RectField | TextField;

interface DesignerState {
  fields: Field[];
  selectedId: string | null;

  addField: (field: Omit<RectField, "id"> | Omit<TextField, "id">) => void;
  updateField: (id: string, patch: Partial<Field>) => void;
  selectField: (id: string | null) => void;
}

export const useDesignerStore = create<DesignerState>((set) => ({
  fields: [],
  selectedId: null,

  addField: (field) =>
    set((state) => ({
      fields: [
        ...state.fields,
        {
          ...field,
          id: crypto.randomUUID(),
        } as Field,
      ],
    })),

  updateField: (id, patch) =>
    set((state) => ({
      fields: state.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),

  selectField: (id) => set({ selectedId: id }),
}));
