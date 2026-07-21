import { useMemo } from "react";
import { useDesignerStore, type Field } from "./designerStore";
import { useMappingStore } from "./mappingStore";

function isVisibleField(field: Field): boolean {
  const classification = field.metadata?.artifactClassification;
  return classification !== "non_field_artifact";
}

export function useOntologyFieldIds(): Set<string> {
  const ontologyDocument = useMappingStore((state) => state.ontologyDocument);

  return useMemo(() => {
    const fields = Array.isArray(ontologyDocument?.fields) ? ontologyDocument.fields : [];
    return new Set(
      fields
        .map((field: any) => String(field?.blockId || field?.id || "").trim())
        .filter((value) => value.length > 0),
    );
  }, [ontologyDocument]);
}

export function useSelectedFields(): Field[] {
  const fields = useDesignerStore((state) => state.fields);
  const selectedIds = useDesignerStore((state) => state.selectedIds);
  const ontologyFieldIds = useOntologyFieldIds();

  return useMemo(
    () =>
      fields.filter((field) => {
        if (!selectedIds.includes(field.id) || !isVisibleField(field)) {
          return false;
        }

        return ontologyFieldIds.size === 0 || ontologyFieldIds.has(field.id);
      }),
    [fields, ontologyFieldIds, selectedIds],
  );
}

export function useSelectedField(): Field | null {
  const selectedFields = useSelectedFields();
  return selectedFields.length === 1 ? selectedFields[0] : null;
}