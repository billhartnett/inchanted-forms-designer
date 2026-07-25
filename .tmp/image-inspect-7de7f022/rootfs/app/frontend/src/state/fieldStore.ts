import { useMemo } from "react";
import { useDesignerStore, type Field } from "./designerStore";

export function useSelectedFields(): Field[] {
  const fields = useDesignerStore((state) => state.fields);
  const selectedIds = useDesignerStore((state) => state.selectedIds);

  return useMemo(
    () => fields.filter((field) => selectedIds.includes(field.id)),
    [fields, selectedIds],
  );
}

export function useSelectedField(): Field | null {
  const selectedFields = useSelectedFields();
  return selectedFields.length === 1 ? selectedFields[0] : null;
}