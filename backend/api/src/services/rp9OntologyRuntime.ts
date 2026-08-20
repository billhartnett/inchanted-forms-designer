import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AcordLabelCandidate, AcordOntologyNode } from "shared/acord";
import type { FieldMapping } from "shared/types";

type JsonRecord = Record<string, any>;
type Role = "Applicant" | "NamedInsured" | "Insured" | "Producer";

type Rp9Node = AcordOntologyNode & {
  semanticKind: "fillable" | "section" | "structural-question" | "structural-answer";
  component: string | null;
  role: Role | null;
  instanceFamily: {
    familyId: string;
    cardinality: string;
    level: string;
    instanceKey: string[];
    parentFamilyId: string | null;
    stableIdentity: string[];
  };
};

export type Rp9Projection = {
  ontologyScope: "canonical" | "role-safe-representation" | "dictionary-only";
  canonical: boolean;
  canonicalAcordCode: string | null;
  semanticRole: Role | null;
  component: string | null;
  semanticIdentity: string | null;
  semanticKind: Rp9Node["semanticKind"] | null;
  boundaryDisposition: "allowed" | "role-safe-representation" | "blocked" | "not-role-bearing";
  equivalenceId: string | null;
  instanceFamily: Rp9Node["instanceFamily"] | null;
  instanceKey: Record<string, string | number> | null;
  sections: string[];
  groups: string[];
  rationale: string;
};

export type Rp9ProjectedCandidate = AcordLabelCandidate & { rp9: Rp9Projection };

export type Rp9Runtime = {
  metadata: {
    restorePoint: "RP-9";
    activationState: "staging-active";
    activationScope: "staging";
    ontologyId: string;
    ontologyVersion: string;
    ontologyHash: string;
    semanticTruthPayloadSha256: string;
    ontologyLineagePayloadSha256: string;
    categoryBundlesPayloadSha256: string;
    activeOntology: string;
    mappingContractVersion: "rp9.mapping.v1";
    nodeCount: number;
    aliasCount: number;
    multiInstanceFamilyCount: number;
    roleBoundaryPolicy: string;
  };
  nodes: ReadonlyMap<string, Rp9Node>;
  aliases: ReadonlyMap<string, string>;
  components: ReadonlyMap<string, ReadonlySet<string>>;
  roles: ReadonlySet<Role>;
  roleAliases: ReadonlyMap<string, Role>;
  roleSafeEquivalences: ReadonlyMap<string, JsonRecord>;
  categoryBundles: JsonRecord;
};

let cachedRuntime: Rp9Runtime | null = null;

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value: string | Buffer): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function canonicalFileSha256(bytes: Buffer): string { return sha256(bytes.toString("utf8").replace(/\r\n/g, "\n")); }
function normalize(value: string): string { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function readArtifact(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing RP-9 artifact: ${filePath}`);
  const bytes = fs.readFileSync(filePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")) as JsonRecord };
}
function validatePayloadHash(name: string, artifact: JsonRecord): void {
  const { integrity: _integrity, ...payload } = artifact;
  const actual = sha256(stableSerialize(payload));
  if (!artifact.integrity?.payloadSha256 || actual !== artifact.integrity.payloadSha256) {
    throw new Error(`${name} payload hash mismatch`);
  }
}
function artifactRoot(): string {
  return path.resolve(process.env.RP9_ARTIFACT_ROOT || path.join(__dirname, "..", "..", "..", "..", "acord-artifacts"));
}
function roleFromText(text: string, roleAliases: ReadonlyMap<string, Role>): Role | null {
  const normalized = String(text || "").toLowerCase();
  for (const [alias, role] of roleAliases) if (new RegExp(`\\b${alias.toLowerCase()}\\b`).test(normalized)) return role;
  if (/\bnamed insured\b/.test(normalized)) return "NamedInsured";
  if (/\bapplicant\b/.test(normalized)) return "Applicant";
  if (/\binsured\b/.test(normalized)) return "Insured";
  return null;
}
function roleForCode(code: string): Role | null {
  if (/^Producer[_.]|(?:^|[._])Producer(?:[._]|$)/i.test(code || "")) return "Producer";
  if (/NamedInsured|GeneralInfo\.(?:NamedInsured|MailingAddress)/i.test(code || "")) return "NamedInsured";
  if (/Applicant/i.test(code || "")) return "Applicant";
  if (/(?:^|[._])Insured(?:[._]|$)/i.test(code || "")) return "Insured";
  return null;
}
function producerIndexFromEvidence(mapping?: FieldMapping): number | null {
  const explicit = Number((mapping as any)?.producerIndex);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  for (const groupId of (mapping as any)?.semanticGroupIds || []) {
    const match = String(groupId).match(/^rp9-producer-(?:information|contact|address|codes|customer-id)-p\d+-(\d+)$/i);
    if (match) return Number(match[1]);
  }
  return null;
}
function indexedEvidence(mapping: FieldMapping | undefined, property: string, pattern: RegExp): number | null {
  const explicit = Number((mapping as any)?.[property]);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  for (const groupId of (mapping as any)?.semanticGroupIds || []) {
    const match = String(groupId).match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}
function instanceKey(node: Rp9Node, mapping?: FieldMapping): Record<string, string | number> {
  const producerIndex = producerIndexFromEvidence(mapping);
  const premisesIndex = indexedEvidence(mapping, "premisesIndex", /^rp9-premises-information-p\d+-(\d+)$/i);
  const locationIndex = indexedEvidence(mapping, "locationIndex", /^rp9-premises-(?:information|address|occupancy|construction|protection|fire|burglary)-p\d+-(\d+)$/i);
  const questionIndex = indexedEvidence(mapping, "questionIndex", /^rp9-question-p\d+-(\d+)$/i);
  const yesNoIndex = indexedEvidence(mapping, "yesNoIndex", /^rp9-yes-no-p\d+-(\d+)$/i);
  const values: Record<string, string | number> = {
    pageIndex: Math.max(0, Number(mapping?.page || 1) - 1),
    sectionOccurrence: String((mapping as any)?.groupId || "section-0"),
    producerIndex: producerIndex ?? String((mapping as any)?.groupId || mapping?.blockId || "producer-unresolved"),
    premisesIndex: premisesIndex ?? String((mapping as any)?.groupId || mapping?.blockId || "premises-unresolved"),
    contactIndex: Number((mapping as any)?.contactIndex || 0),
    locationIndex: locationIndex ?? String((mapping as any)?.groupId || mapping?.blockId || "location-unresolved"),
    buildingIndex: Number((mapping as any)?.buildingIndex ?? (mapping as any)?.columnIndex ?? 0),
    applicantIndex: Number((mapping as any)?.applicantIndex || 0),
    signatureIndex: Number((mapping as any)?.signatureIndex || 0),
    signerRole: node.role || "Unknown",
    questionIndex: questionIndex ?? String((mapping as any)?.groupId || mapping?.blockId || "question-unresolved"),
    yesNoIndex: yesNoIndex ?? String((mapping as any)?.groupId || mapping?.blockId || "yes-no-unresolved"),
    formInstance: 0,
    fieldOccurrence: String(mapping?.blockId || "field-0"),
  };
  return Object.fromEntries(node.instanceFamily.instanceKey.map((key) => [key, values[key] ?? 0]));
}

function buildRuntime(): Rp9Runtime {
  const root = artifactRoot();
  const truthFile = readArtifact(path.join(root, "authoritative-semantic-truth-rp9.json"));
  const lineageFile = readArtifact(path.join(root, "rp9-ontology-lineage.json"));
  const bundlesFile = readArtifact(path.join(root, "rp9-category-bundles.json"));
  const phase33File = readArtifact(path.join(root, "phase33-semantic-truth-rp8.json"));
  for (const [name, artifact] of [["RP-9 truth", truthFile], ["RP-9 lineage", lineageFile], ["RP-9 bundles", bundlesFile], ["Phase 33", phase33File]] as const) {
    validatePayloadHash(name, artifact.value);
  }
  const truth = truthFile.value;
  const lineage = lineageFile.value;
  const bundles = bundlesFile.value;
  const checks = {
    stagingActive: truth.status === "staging-active-semantic-baseline" && truth.activation?.state === "staging-active" && truth.activation?.scope === "staging",
    lineageActive: lineage.status === "staging-active" && lineage.activation?.state === "staging-active" && lineage.activation?.currentProductionBaseline === "RP-8",
    bundlesActive: bundles.status === "staging-active" && bundles.semanticTruthPayloadSha256 === truth.integrity.payloadSha256,
    lineageTruth: lineage.artifacts?.authoritativeSemanticTruth?.payloadSha256 === truth.integrity.payloadSha256 && lineage.artifacts?.authoritativeSemanticTruth?.fileSha256 === canonicalFileSha256(truthFile.bytes),
    lineageBundles: lineage.artifacts?.categoryBundles?.payloadSha256 === bundles.integrity.payloadSha256 && lineage.artifacts?.categoryBundles?.fileSha256 === canonicalFileSha256(bundlesFile.bytes),
    phase33: lineage.artifacts?.phase33Policy?.payloadSha256 === phase33File.value.integrity.payloadSha256 && lineage.artifacts?.phase33Policy?.fileSha256 === canonicalFileSha256(phase33File.bytes),
    productionGuard: truth.guardrails?.rp8RemainsProductionActive === true && truth.activation?.productionBaselineChanged === false,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) throw new Error(`RP-9 staging lineage validation failed: ${failed.join(", ")}`);

  const nodes = new Map<string, Rp9Node>(Object.entries(truth.canonicalOntology.nodes) as Array<[string, Rp9Node]>);
  const aliases = new Map<string, string>();
  const components = new Map<string, Set<string>>();
  for (const [id, node] of nodes) {
    for (const alias of [id, ...(node.aliases || [])]) aliases.set(normalize(alias), id);
    if (node.component) {
      const ids = components.get(node.component) || new Set<string>();
      ids.add(id);
      components.set(node.component, ids);
    }
  }
  const roleAliases = new Map<string, Role>(Object.entries(truth.roleBoundaryPolicy.roleAliases || {}) as Array<[string, Role]>);
  const roles = new Set<Role>(Object.keys(truth.roleBoundaryPolicy.roles || {}) as Role[]);
  const roleSafeEquivalences = new Map<string, JsonRecord>();
  for (const equivalence of truth.roleSafeEquivalences || []) {
    const key = `${equivalence.sourceRole}:${equivalence.component || "role"}:${equivalence.representationCode || equivalence.targetRole || ""}`;
    roleSafeEquivalences.set(key, equivalence);
  }
  return {
    metadata: {
      restorePoint: "RP-9",
      activationState: "staging-active",
      activationScope: "staging",
      ontologyId: truth.canonicalOntology.ontologyId,
      ontologyVersion: truth.canonicalOntology.version,
      ontologyHash: truth.canonicalOntology.hash,
      semanticTruthPayloadSha256: truth.integrity.payloadSha256,
      ontologyLineagePayloadSha256: lineage.integrity.payloadSha256,
      categoryBundlesPayloadSha256: bundles.integrity.payloadSha256,
      activeOntology: lineage.activeOntology,
      mappingContractVersion: "rp9.mapping.v1",
      nodeCount: nodes.size,
      aliasCount: aliases.size,
      multiInstanceFamilyCount: Object.keys(truth.multiInstanceFamilies || {}).length,
      roleBoundaryPolicy: truth.roleBoundaryPolicy.schemaVersion,
    },
    nodes, aliases, components, roles, roleAliases, roleSafeEquivalences, categoryBundles: bundles,
  };
}

export function validateActiveRp9Runtime(): Rp9Runtime { cachedRuntime = null; return getActiveRp9Runtime(); }
export function getActiveRp9Runtime(): Rp9Runtime { if (!cachedRuntime) cachedRuntime = buildRuntime(); return cachedRuntime; }

function projectedCandidate(candidate: AcordLabelCandidate, context: string, mapping?: FieldMapping): Rp9ProjectedCandidate {
  const runtime = getActiveRp9Runtime();
  const clean = Object.fromEntries(Object.entries(candidate).filter(([key]) => !/^_?wave8/i.test(key))) as AcordLabelCandidate;
  const contextualRole = roleFromText(context, runtime.roleAliases);
  const canonicalId = runtime.aliases.get(normalize(candidate.acordCode)) || null;
  const node = canonicalId ? runtime.nodes.get(canonicalId) : null;
  const candidateRole = node?.role || roleForCode(candidate.acordCode);
  const crossRole = Boolean(contextualRole && candidateRole && contextualRole !== candidateRole);
  if (node && !crossRole) {
    return {
      ...clean,
      acordCode: canonicalId!,
      label: node.aliases?.[1] || node.aliases?.[0] || candidate.label,
      rp9: {
        ontologyScope: "canonical", canonical: true, canonicalAcordCode: canonicalId,
        semanticRole: contextualRole || node.role, component: node.component,
        semanticIdentity: `${contextualRole || node.role || "Semantic"}:${node.component || node.semanticKind}`,
        semanticKind: node.semanticKind, boundaryDisposition: contextualRole || node.role ? "allowed" : "not-role-bearing",
        equivalenceId: null, instanceFamily: node.instanceFamily, instanceKey: instanceKey(node, mapping),
        sections: node.sections || [], groups: node.groups || [], rationale: "Candidate projected to the staging-active RP-9 canonical ontology.",
      },
    };
  }
  return {
    ...clean,
    rp9: {
      ontologyScope: "dictionary-only", canonical: false, canonicalAcordCode: null,
      semanticRole: contextualRole || candidateRole, component: node?.component || null,
      semanticIdentity: contextualRole || candidateRole ? `${contextualRole || candidateRole}:unresolved` : null,
      semanticKind: null, boundaryDisposition: crossRole ? "blocked" : "not-role-bearing", equivalenceId: null,
      instanceFamily: null, instanceKey: null, sections: [], groups: [],
      rationale: crossRole ? "Blocked by RP-9 strict role boundary." : "Retained as dictionary-only outside RP-9 canonical ontology.",
    },
  };
}

function exactContextCandidate(contexts: string[], mapping: FieldMapping): Rp9ProjectedCandidate | null {
  const runtime = getActiveRp9Runtime();
  const canonicalId = contexts.map((context) => runtime.aliases.get(normalize(context))).find(Boolean);
  const node = canonicalId ? runtime.nodes.get(canonicalId) : null;
  if (!node) return null;
  return {
    acordCode: canonicalId!, label: node.aliases?.[1] || canonicalId!, confidenceScore: 1, normalizedConfidenceScore: 1,
    source: "heuristic", rationale: "Exact RP-9 semantic alias match.",
    rp9: {
      ontologyScope: "canonical", canonical: true, canonicalAcordCode: canonicalId!, semanticRole: node.role,
      component: node.component, semanticIdentity: `${node.role || "Semantic"}:${node.component || node.semanticKind}`,
      semanticKind: node.semanticKind, boundaryDisposition: node.role ? "allowed" : "not-role-bearing", equivalenceId: null,
      instanceFamily: node.instanceFamily, instanceKey: instanceKey(node, mapping), sections: node.sections || [], groups: node.groups || [],
      rationale: "Exact field or section text matched an RP-9 canonical alias.",
    },
  };
}

function producerSectionCueCandidate(mapping: FieldMapping): Rp9ProjectedCandidate | null {
  const semanticRole = String((mapping as any)?.semanticRole || "");
  const semanticCluster = String((mapping as any)?.semanticCluster || "");
  const semanticGroups = ((mapping as any)?.semanticGroupIds || []).map(String);
  const hasProducerCue = semanticRole === "Producer" ||
    semanticCluster.startsWith("Producer") ||
    semanticGroups.some((groupId: string) => groupId.startsWith("rp9-producer-information-"));
  if (!hasProducerCue) return null;
  const runtime = getActiveRp9Runtime();
  const node = runtime.nodes.get("Section.ProducerInformation");
  if (!node) return null;
  return {
    acordCode: "Section.ProducerInformation",
    label: "PRODUCER INFORMATION",
    confidenceScore: 1,
    normalizedConfidenceScore: 1,
    source: "heuristic",
    rationale: "RP-9 Producer role, label, or cluster cue inferred the ProducerInformation section.",
    rp9: {
      ontologyScope: "canonical", canonical: true, canonicalAcordCode: "Section.ProducerInformation",
      semanticRole: "Producer", component: "section", semanticIdentity: "Producer:section",
      semanticKind: "section", boundaryDisposition: "allowed", equivalenceId: null,
      instanceFamily: node.instanceFamily, instanceKey: instanceKey(node, mapping),
      sections: node.sections || [], groups: node.groups || [],
      rationale: "RP-9 Producer semantic cues inferred the canonical section anchor.",
    },
  };
}

function syntheticCanonicalCandidate(canonicalId: string, mapping: FieldMapping, rationale: string): Rp9ProjectedCandidate | null {
  const node = getActiveRp9Runtime().nodes.get(canonicalId);
  if (!node) return null;
  return {
    acordCode: canonicalId,
    label: node.aliases?.[1] || canonicalId,
    confidenceScore: 1,
    normalizedConfidenceScore: 1,
    source: "heuristic",
    rationale,
    rp9: {
      ontologyScope: "canonical", canonical: true, canonicalAcordCode: canonicalId,
      semanticRole: node.role, component: node.component,
      semanticIdentity: `${node.role || "Semantic"}:${node.component || node.semanticKind}`,
      semanticKind: node.semanticKind, boundaryDisposition: node.role ? "allowed" : "not-role-bearing",
      equivalenceId: null, instanceFamily: node.instanceFamily, instanceKey: instanceKey(node, mapping),
      sections: node.sections || [], groups: node.groups || [], rationale,
    },
  };
}

function extractionCueCandidate(mapping: FieldMapping): Rp9ProjectedCandidate | null {
  const cluster = String((mapping as any)?.semanticCluster || "");
  const label = normalize(String(mapping.semanticLabel || mapping.text || ""));
  let canonicalId: string | null = null;
  if (cluster === "Question" || cluster === "YesNoQuestion") canonicalId = "Question.Text";
  else if (cluster === "YesNoAnswer") canonicalId = "Question.BooleanAnswer";
  else if (cluster === "PremisesAddress") canonicalId = "Premises.Address.Line1";
  else if (cluster === "PremisesOccupancy") canonicalId = "Premises.Occupancy.Description";
  else if (cluster === "PremisesConstruction") canonicalId = "Premises.Construction.Type";
  else if (cluster === "PremisesFire") canonicalId = /firedistrict|codenumber/.test(label) ? "Premises.Protection.FireDistrictCode" : "Premises.Protection.Fire";
  else if (cluster === "PremisesBurglary") canonicalId = "Premises.Protection.Burglary";
  else if (cluster === "PremisesProtection") canonicalId = "Premises.Protection.Description";
  else if (cluster === "PremisesInformation") {
    canonicalId = /premises/.test(label) && /#|number/.test(String(mapping.semanticLabel || mapping.text || ""))
      ? "Premises.Location.Identifier"
      : /building/.test(label) && /#|number/.test(String(mapping.semanticLabel || mapping.text || ""))
        ? "Premises.Building.Identifier"
        : /description/.test(label) ? "Premises.Building.Description" : null;
  } else if (cluster === "GeneralOperations") canonicalId = "GeneralInformation.Operations.Description";
  else if (cluster === "GeneralExposure") canonicalId = "GeneralInformation.Exposure.Description";
  else if (cluster === "GeneralHazards") canonicalId = "GeneralInformation.Hazard.Description";
  else if (cluster === "GeneralBusinessDetails") canonicalId = "GeneralInformation.BusinessDetails";
  return canonicalId ? syntheticCanonicalCandidate(canonicalId, mapping, `RP-9 ${cluster} extractor evidence selected a canonical node.`) : null;
}

function semanticSectionCueCandidate(mapping: FieldMapping): Rp9ProjectedCandidate | null {
  const section = String((mapping as any)?.semanticSection || "");
  const canonicalId = section === "premises-information"
    ? "Section.PremisesInformation"
    : section === "general-information" ? "Section.GeneralInformation" : null;
  return canonicalId ? syntheticCanonicalCandidate(canonicalId, mapping, `RP-9 ${section} field evidence inferred the canonical section anchor.`) : null;
}

function selectable(candidate: Rp9ProjectedCandidate): boolean {
  return candidate.rp9.canonical && candidate.rp9.boundaryDisposition !== "blocked";
}

export function projectMappingsToRp9(mappings: FieldMapping[]): FieldMapping[] {
  return mappings.map((mapping) => {
    const contexts = [mapping.semanticLabel, mapping.text].filter((value): value is string => Boolean(value?.trim()));
    const context = contexts.join(" ").trim();
    const candidates = mapping.suggestions.map((candidate, index) => ({ candidate: projectedCandidate(candidate, context, mapping), index }));
    const exact = exactContextCandidate(contexts, mapping);
    if (exact && !candidates.some(({ candidate }) => candidate.acordCode === exact.acordCode)) candidates.unshift({ candidate: exact, index: -1 });
    const sectionCue = producerSectionCueCandidate(mapping);
    if (sectionCue && !candidates.some(({ candidate }) => candidate.acordCode === sectionCue.acordCode)) candidates.push({ candidate: sectionCue, index: Number.MAX_SAFE_INTEGER });
    const extractionCue = extractionCueCandidate(mapping);
    if (extractionCue && !candidates.some(({ candidate }) => candidate.acordCode === extractionCue.acordCode)) candidates.unshift({ candidate: extractionCue, index: -2 });
    const semanticSectionCue = semanticSectionCueCandidate(mapping);
    if (semanticSectionCue && !candidates.some(({ candidate }) => candidate.acordCode === semanticSectionCue.acordCode)) candidates.push({ candidate: semanticSectionCue, index: Number.MAX_SAFE_INTEGER });
    const explicitSemanticCue = Boolean((mapping as any)?.semanticCluster);
    const suggestions = candidates.filter(({ candidate }) =>
      !explicitSemanticCue || candidate.rp9.ontologyScope !== "dictionary-only",
    ).sort((left, right) =>
      Number(!left.candidate.rp9.canonical) - Number(!right.candidate.rp9.canonical) ||
      Number(left.candidate.rp9.semanticKind === "section") - Number(right.candidate.rp9.semanticKind === "section") ||
      left.index - right.index,
    ).map(({ candidate }) => candidate);
    const chosen = suggestions.find(selectable);
    return { ...mapping, suggestions, topCandidate: suggestions[0], chosen };
  });
}

export function projectCanonicalMappingsToRp9(mappings: FieldMapping[]): FieldMapping[] {
  return mappings.map((mapping) => {
    const context = [mapping.semanticLabel, mapping.text].filter((value): value is string => Boolean(value?.trim())).join(" ").trim();
    const suggestions = mapping.suggestions
      .map((candidate) => projectedCandidate(candidate, context, mapping))
      .filter((candidate) => candidate.rp9.canonical && candidate.rp9.boundaryDisposition !== "blocked");
    const chosen = suggestions[0];
    return { ...mapping, suggestions, topCandidate: chosen, chosen };
  });
}

export function assertRp9Selections(mappings: FieldMapping[]): void {
  for (const mapping of mappings) {
    const suggestions = mapping.suggestions as Rp9ProjectedCandidate[];
    const chosen = mapping.chosen as Rp9ProjectedCandidate | undefined;
    const first = suggestions.find(selectable);
    if (chosen?.rp9?.ontologyScope === "dictionary-only") throw new Error(`RP-9 selected dictionary-only candidate for ${mapping.blockId}`);
    if ((chosen?.acordCode || null) !== (first?.acordCode || null)) throw new Error(`RP-9 final selection mismatch for ${mapping.blockId}`);
  }
}

export function collectRp9Nodes(mappings: FieldMapping[]): Rp9Node[] {
  const runtime = getActiveRp9Runtime();
  const ids = new Set<string>();
  for (const mapping of mappings) for (const candidate of mapping.suggestions as Rp9ProjectedCandidate[]) if (candidate.rp9?.canonicalAcordCode) ids.add(candidate.rp9.canonicalAcordCode);
  return [...ids].sort().map((id) => runtime.nodes.get(id)).filter((node): node is Rp9Node => Boolean(node));
}

export function collectRp9Sections(mappings: FieldMapping[]) {
  const sections = new Map<string, ReturnType<typeof sectionRecord>>();
  for (const mapping of mappings) {
    for (const candidate of mapping.suggestions as Rp9ProjectedCandidate[]) {
      if (candidate.rp9?.semanticKind !== "section") continue;
      const occurrence = candidate.acordCode === "Section.ProducerInformation"
        ? producerIndexFromEvidence(mapping) ?? "unresolved"
        : "section";
      const key = `${mapping.page}:${candidate.acordCode}:${occurrence}`;
      if (!sections.has(key)) sections.set(key, sectionRecord(mapping, candidate));
    }
  }
  return [...sections.values()];
}

function sectionRecord(mapping: FieldMapping, candidate: Rp9ProjectedCandidate) {
  return {
    blockId: mapping.blockId,
    page: mapping.page,
    canonicalNodeId: candidate.acordCode,
    sections: candidate.rp9.sections,
    instanceFamily: candidate.rp9.instanceFamily,
    instanceKey: candidate.rp9.instanceKey,
  };
}
