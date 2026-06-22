import type { ExtractedBlock, SemanticInference, SemanticFieldType } from "shared/types";

function inferFieldType(text: string): SemanticFieldType {
  const normalized = text.toLowerCase();

  if (/(date|dob|birth|effective|expiration)/.test(normalized)) {
    return "date";
  }

  if (/(premium|limit|deductible|amount|number of|years|employees|zip|postal)/.test(normalized)) {
    return "numeric";
  }

  if (/(signature|signed)/.test(normalized)) {
    return "signature";
  }

  if (/(yes\s*\/\s*no|yes or no|check one)/.test(normalized)) {
    return "radio";
  }

  return "text";
}

function toCanonicalName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

export function inferSemanticField(block: ExtractedBlock): SemanticInference {
  const fieldType = inferFieldType(block.text);
  const validationRules: string[] = [];

  if (fieldType === "date") {
    validationRules.push("valid-date");
  }

  if (fieldType === "numeric") {
    validationRules.push("numeric-value");
  }

  return {
    blockId: block.id,
    fieldType,
    canonicalName: toCanonicalName(block.text),
    validationRules,
    rationale: [
      `Inferred ${fieldType} from label text \"${block.text}\".`,
      "TODO: refine semantic inference with grouped labels and neighboring field geometry.",
    ],
  };
}

export function inferSemanticFields(blocks: ExtractedBlock[]): SemanticInference[] {
  return blocks.map(inferSemanticField);
}