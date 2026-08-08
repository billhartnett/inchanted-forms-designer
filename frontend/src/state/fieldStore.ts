import { useMemo } from "react";
import { useDesignerStore, type Field } from "./designerStore";
import { useMappingStore } from "./mappingStore";

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

  return useMemo(
    () => fields.filter((field) => selectedIds.includes(field.id) && isVisibleField(field)),
    [fields, selectedIds],
  );
}

export function useSelectedField(): Field | null {
  const selectedFields = useSelectedFields();
  return selectedFields.length === 1 ? selectedFields[0] : null;
}