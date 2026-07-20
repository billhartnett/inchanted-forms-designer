import { useMemo } from "react";
import { useDesignerStore, type Field } from "./designerStore";

const NON_FIELD_CLASSIFICATIONS = new Set([
  "heading",
  "section title",
  "logo",
  "decorative text",
  "disclaimer",
  "instructional text",
]);

function isVisibleField(field: Field): boolean {
  const classification = field.metadata?.artifactClassification;
  return !classification || !NON_FIELD_CLASSIFICATIONS.has(classification);
}

export function useSelectedFields(): Field[] {
  const fields = useDesignerStore((state) => state.fields);
  const selectedIds = useDesignerStore((state) => state.selectedIds);

  return useMemo(
    () => fields.filter((field) => selectedIds.includes(field.id) && isVisibleField(field)),
    [fields, selectedIds],
  );
}

export function useSelectedField(): Field | null {
  const selectedFields = useSelectedFields();
  return selectedFields.length === 1 ? selectedFields[0] : null;
}