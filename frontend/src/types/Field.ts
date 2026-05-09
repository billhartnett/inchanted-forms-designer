export type FieldType = "rect" | "text";

export interface DesignerField {
  id: string;
  type: FieldType;
  x: number;
  y: number;
  width: number;
  height: number;

  // Text-specific
  text?: string;
  fontSize?: number;
  color?: string;

  // Rect-specific
  fill?: string;
}
