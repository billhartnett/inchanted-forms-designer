import type { AcordOntologyNode } from "shared/acord";
import type { FieldMapping } from "shared/types";
import {
  assertRp8FinalSelections,
  collectReferencedRp8Nodes,
  getActiveRp8OntologyRuntime,
  projectMappingsToRp8,
  validateActiveRp8Runtime,
} from "./rp8OntologyRuntime";
import {
  assertRp9Selections,
  collectRp9Nodes,
  collectRp9Sections,
  getActiveRp9Runtime,
  projectMappingsToRp9,
  validateActiveRp9Runtime,
} from "./rp9OntologyRuntime";

export type SemanticBaseline = "RP-8" | "RP-9";

export function configuredSemanticBaseline(): SemanticBaseline {
  const requested = String(process.env.SEMANTIC_BASELINE || process.env.PRODUCTION_BASELINE || "RP-8").toUpperCase();
  if (requested !== "RP-9") return "RP-8";
  if (String(process.env.DEPLOYMENT_ENVIRONMENT || "").toLowerCase() !== "staging") {
    throw new Error("RP-9 semantic baseline requires DEPLOYMENT_ENVIRONMENT=staging");
  }
  return "RP-9";
}

export function validateConfiguredSemanticRuntime() {
  return configuredSemanticBaseline() === "RP-9" ? validateActiveRp9Runtime() : validateActiveRp8Runtime();
}

export function getActiveSemanticRuntime() {
  return configuredSemanticBaseline() === "RP-9" ? getActiveRp9Runtime() : getActiveRp8OntologyRuntime();
}

export function projectMappingsToActiveSemanticBaseline(mappings: FieldMapping[]): FieldMapping[] {
  return configuredSemanticBaseline() === "RP-9" ? projectMappingsToRp9(mappings) : projectMappingsToRp8(mappings);
}

export function assertActiveSemanticSelections(mappings: FieldMapping[]): void {
  if (configuredSemanticBaseline() === "RP-9") assertRp9Selections(mappings);
  else assertRp8FinalSelections(mappings);
}

export function collectActiveOntologyNodes(mappings: FieldMapping[]): AcordOntologyNode[] {
  return configuredSemanticBaseline() === "RP-9" ? collectRp9Nodes(mappings) : collectReferencedRp8Nodes(mappings);
}

export function collectActiveSemanticSections(mappings: FieldMapping[]) {
  return configuredSemanticBaseline() === "RP-9" ? collectRp9Sections(mappings) : [];
}

export function getActiveCategoryBundles() {
  return configuredSemanticBaseline() === "RP-9" ? getActiveRp9Runtime().categoryBundles : null;
}
