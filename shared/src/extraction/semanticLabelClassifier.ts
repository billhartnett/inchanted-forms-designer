import type { ExtractedBlock } from "shared/types";

export type SemanticLabelClass =
  | "person_name"
  | "address"
  | "date"
  | "currency"
  | "identifier"
  | "boolean_choice"
  | "signature"
  | "vehicle"
  | "property"
  | "policy"
  | "coverage"
  | "generic";

export type CategoryModeClass =
  | "party_information"
  | "policy_information"
  | "vehicle_information"
  | "property_information"
  | "loss_information"
  | "coverage_information"
  | "compliance_information"
  | "general_information";

function norm(value: string): string {
  return value.toLowerCase().trim();
}

export function classifySemanticLabel(text: string): SemanticLabelClass {
  const value = norm(text);
  if (!value) return "generic";

  if (/\bsignature\b|\bsigned\b|\bauthorized\b/.test(value)) return "signature";
  if (/\bname\b|\binsured\b|\bapplicant\b|\bproducer\b/.test(value)) return "person_name";
  if (/\baddress\b|\bcity\b|\bstate\b|\bzip\b|\bpostal\b/.test(value)) return "address";
  if (/\bdate\b|\bdob\b|\beffective\b|\bexpiration\b/.test(value)) return "date";
  if (/\$|\bpremium\b|\bdeductible\b|\blimit\b|\bamount\b/.test(value)) return "currency";
  if (/\bpolicy\b|\bclaim\b|\bvin\b|\bssn\b|\bnumber\b|\bid\b|\bcode\b/.test(value)) return "identifier";
  if (/\byes\b|\bno\b|\bcheck\b|\bselect\b/.test(value)) return "boolean_choice";
  if (/\bvehicle\b|\bauto\b|\bvin\b|\bdriver\b/.test(value)) return "vehicle";
  if (/\bproperty\b|\bdwelling\b|\bpremises\b/.test(value)) return "property";
  if (/\bpolicy\b|\bcarrier\b|\bterm\b/.test(value)) return "policy";
  if (/\bcoverage\b|\bliability\b|\bcollision\b|\bcomprehensive\b/.test(value)) return "coverage";

  return "generic";
}

export function classifyCategoryMode(text: string): CategoryModeClass {
  const semantic = classifySemanticLabel(text);
  switch (semantic) {
    case "person_name":
    case "address":
      return "party_information";
    case "policy":
    case "identifier":
      return "policy_information";
    case "vehicle":
      return "vehicle_information";
    case "property":
      return "property_information";
    case "coverage":
    case "currency":
      return "coverage_information";
    case "signature":
    case "boolean_choice":
      return "compliance_information";
    default:
      return "general_information";
  }
}

export function classifyBlockSemantic(block: ExtractedBlock): {
  semanticLabel: SemanticLabelClass;
  categoryMode: CategoryModeClass;
} {
  return {
    semanticLabel: classifySemanticLabel(block.text),
    categoryMode: classifyCategoryMode(block.text),
  };
}