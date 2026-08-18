import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AcordLabelCandidate, AcordOntologyNode } from "shared/acord";
import type { FieldMapping } from "shared/types";

type Role = "Applicant" | "NamedInsured" | "Insured" | "Producer";
type JsonRecord = Record<string, any>;

export type Rp8CandidateProjection = {
  ontologyScope: "canonical" | "role-safe-representation" | "dictionary-only";
  canonical: boolean;
  canonicalAcordCode: string | null;
  semanticRole: Role | null;
  component: string | null;
  semanticIdentity: string | null;
  boundaryDisposition: "allowed" | "role-safe-representation" | "blocked" | "not-role-bearing";
  equivalenceId: string | null;
  rationale: string;
};

export type Rp8ProjectedCandidate = AcordLabelCandidate & {
  rp8: Rp8CandidateProjection;
};

export type Rp8OntologyMetadata = {
  restorePoint: "RP-8";
  ontologyId: string;
  ontologyVersion: string;
  ontologyHash: string;
  semanticTruthPayloadSha256: string;
  ontologyLineagePayloadSha256: string;
  phase33PayloadSha256: string;
  activeOntology: string;
  canonicalOntology: string;
  stabilizationPhase: string;
  mappingContractVersion: "rp8.mapping.v1";
  nodeCount: number;
  aliasCount: number;
  componentCount: number;
  roleBoundaryPolicy: string;
};

export type Rp8OntologyRuntime = {
  metadata: Rp8OntologyMetadata;
  nodes: ReadonlyMap<string, AcordOntologyNode>;
  aliases: ReadonlyMap<string, string>;
  components: ReadonlyMap<string, ReadonlySet<string>>;
  roles: ReadonlySet<Role>;
  roleSafeEquivalences: ReadonlyMap<string, JsonRecord>;
};

let cachedRuntime: Rp8OntologyRuntime | null = null;

function artifactPaths() {
  const artifactRoot = path.resolve(
    process.env.RP8_ARTIFACT_ROOT || path.join(__dirname, "..", "..", "..", "..", "acord-artifacts"),
  );
  return {
    semanticTruth: path.join(artifactRoot, "authoritative-semantic-truth-rp8.json"),
    ontologyLineage: path.join(artifactRoot, "rp8-ontology-lineage.json"),
    phase33: path.join(artifactRoot, "phase33-semantic-truth-rp8.json"),
    canonicalOntology: path.join(artifactRoot, "ontology-phase31.json"),
  };
}

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

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalFileSha256(bytes: Buffer): string {
  return sha256(bytes.toString("utf8").replace(/\r\n/g, "\n"));
}

function readArtifact(filePath: string): { bytes: Buffer; value: JsonRecord } {
  if (!fs.existsSync(filePath)) throw new Error(`Missing RP-8 artifact: ${filePath}`);
  const bytes = fs.readFileSync(filePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")) };
}

function validatePayloadHash(name: string, artifact: JsonRecord): void {
  const expected = artifact.integrity?.payloadSha256;
  if (!expected) throw new Error(`${name} has no payload integrity hash`);
  const { integrity: _integrity, ...payload } = artifact;
  const actual = sha256(stableSerialize(payload));
  if (actual !== expected) {
    throw new Error(`${name} payload hash mismatch: expected ${expected}, received ${actual}`);
  }
}

function normalizeAlias(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function roleFromText(text: string): Role | null {
  const normalized = String(text || "").toLowerCase();
  if (/\b(producer|agent|agency|broker)\b/.test(normalized)) return "Producer";
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

function componentForCode(code: string): string | null {
  if (/NamedInsured$|FullName|\.Name$/i.test(code)) return "identity.name";
  if (/LocationAddress|LineOne|Line1|\.Street$/i.test(code)) return "address.line1";
  if (/CityName|\.City$/i.test(code)) return "address.city";
  if (/StateOrProvince|\.State$/i.test(code)) return "address.stateOrProvince";
  if (/PostalCode/i.test(code)) return "address.postalCode";
  if (/Phone/i.test(code)) return "contact.phone";
  if (/Email/i.test(code)) return "contact.email";
  if (/HazardClass/i.test(code)) return "risk.hazardClass";
  if (/Operations\.Description/i.test(code)) return "operations.description";
  return null;
}

function buildRuntime(): Rp8OntologyRuntime {
  const paths = artifactPaths();
  const semanticTruthArtifact = readArtifact(paths.semanticTruth);
  const lineageArtifact = readArtifact(paths.ontologyLineage);
  const phase33Artifact = readArtifact(paths.phase33);
  const ontologyArtifact = readArtifact(paths.canonicalOntology);
  const semanticTruth = semanticTruthArtifact.value;
  const lineage = lineageArtifact.value;
  const phase33 = phase33Artifact.value;
  const ontology = ontologyArtifact.value;

  validatePayloadHash("RP-8 authoritative semantic truth", semanticTruth);
  validatePayloadHash("RP-8 ontology lineage", lineage);
  validatePayloadHash("Phase 33 semantic truth", phase33);
  validatePayloadHash("Phase 31 canonical ontology", ontology);

  const checks: Record<string, boolean> = {
    semanticTruthActive:
      semanticTruth.restorePoint === "RP-8" &&
      semanticTruth.status === "active-production-baseline" &&
      semanticTruth.activation?.state === "active",
    lineageActive:
      lineage.restorePoint === "RP-8" &&
      lineage.activeOntology === "phase33-strict-role-boundary-readiness",
    phase33Linked:
      lineage.artifacts?.phase33?.payloadSha256 === phase33.integrity?.payloadSha256 &&
      lineage.artifacts?.phase33?.fileSha256 === canonicalFileSha256(phase33Artifact.bytes),
    phase31Linked:
      lineage.artifacts?.phase31?.payloadSha256 === ontology.integrity?.payloadSha256 &&
      lineage.artifacts?.phase31?.fileSha256 === canonicalFileSha256(ontologyArtifact.bytes),
    authoritativePhase33Linked:
      semanticTruth.lineage?.artifacts?.phase33?.payloadSha256 === phase33.integrity?.payloadSha256,
    policyAligned:
      semanticTruth.roleBoundaryPolicy?.schemaVersion === "strict-role-boundaries.v1" &&
      lineage.roleBoundaryPolicy?.schemaVersion === "strict-role-boundaries.v1",
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failedChecks.length > 0) {
    throw new Error(`RP-8 artifact lineage validation failed: ${failedChecks.join(", ")}`);
  }

  const nodes = new Map<string, AcordOntologyNode>(
    Object.entries(ontology.canonicalOntology?.nodes || {}) as Array<[string, AcordOntologyNode]>,
  );
  if (nodes.size === 0) throw new Error("RP-8 canonical ontology has no nodes");

  const aliases = new Map<string, string>();
  for (const [code, node] of nodes) {
    aliases.set(normalizeAlias(code), code);
    for (const alias of node.aliases || []) aliases.set(normalizeAlias(alias), code);
  }
  for (const change of ontology.evolution?.changeSet || []) {
    if (change.type !== "add-evidence-backed-alias" || !nodes.has(change.acordCode)) continue;
    for (const alias of change.aliases || []) aliases.set(normalizeAlias(alias), change.acordCode);
  }

  const components = new Map<string, Set<string>>();
  const addComponent = (component: string | null, code: string) => {
    if (!component) return;
    const codes = components.get(component) || new Set<string>();
    codes.add(code);
    components.set(component, codes);
  };
  for (const code of nodes.keys()) addComponent(componentForCode(code), code);
  for (const bridge of semanticTruth.bridges?.groups || []) {
    const component = bridge.canonicalComponentId || null;
    for (const code of bridge.equivalentCodes || []) addComponent(component, code);
  }

  const roles = new Set<Role>(
    Object.keys(semanticTruth.roleBoundaryPolicy?.roles || {}).filter(
      (role): role is Role => role === "Applicant" || role === "NamedInsured" || role === "Insured",
    ),
  );
  const roleSafeEquivalences = new Map<string, JsonRecord>();
  for (const equivalence of semanticTruth.evidence?.roleSafeRepresentationEquivalences || []) {
    if (
      equivalence.scope !== "representation-only" ||
      equivalence.runtimePromotion !== false ||
      equivalence.preservesSourceRole !== true
    ) {
      throw new Error(`Invalid RP-8 role-safe equivalence: ${equivalence.equivalenceId || "unknown"}`);
    }
    roleSafeEquivalences.set(
      `${equivalence.sourceRole}:${equivalence.component}:${equivalence.representationCode}`,
      equivalence,
    );
  }

  return {
    metadata: {
      restorePoint: "RP-8",
      ontologyId: ontology.canonicalOntology.ontologyId,
      ontologyVersion: ontology.canonicalOntology.version,
      ontologyHash: ontology.canonicalOntology.hash,
      semanticTruthPayloadSha256: semanticTruth.integrity.payloadSha256,
      ontologyLineagePayloadSha256: lineage.integrity.payloadSha256,
      phase33PayloadSha256: phase33.integrity.payloadSha256,
      activeOntology: lineage.activeOntology,
      canonicalOntology: lineage.canonicalOntology,
      stabilizationPhase: lineage.stabilizationPhase,
      mappingContractVersion: "rp8.mapping.v1",
      nodeCount: nodes.size,
      aliasCount: aliases.size,
      componentCount: components.size,
      roleBoundaryPolicy: semanticTruth.roleBoundaryPolicy.schemaVersion,
    },
    nodes,
    aliases,
    components,
    roles,
    roleSafeEquivalences,
  };
}

export function getActiveRp8OntologyRuntime(): Rp8OntologyRuntime {
  if (!cachedRuntime) cachedRuntime = buildRuntime();
  return cachedRuntime;
}

export function validateActiveRp8Runtime(): Rp8OntologyRuntime {
  cachedRuntime = null;
  return getActiveRp8OntologyRuntime();
}

export function projectCandidateToRp8(
  candidate: AcordLabelCandidate,
  contextText = "",
): Rp8ProjectedCandidate {
  const cleanCandidate = Object.fromEntries(
    Object.entries(candidate).filter(([key]) => !new RegExp(`^_?wave${8}`, "i").test(key)),
  ) as AcordLabelCandidate;
  const runtime = getActiveRp8OntologyRuntime();
  const contextualRole = roleFromText(contextText);
  const candidateRole = roleForCode(candidate.acordCode);
  const component = componentForCode(candidate.acordCode);
  const equivalence = contextualRole && component
    ? runtime.roleSafeEquivalences.get(`${contextualRole}:${component}:${candidate.acordCode}`)
    : null;

  if (equivalence) {
    return {
      ...cleanCandidate,
      rp8: {
        ontologyScope: "role-safe-representation",
        canonical: true,
        canonicalAcordCode: null,
        semanticRole: contextualRole,
        component,
        semanticIdentity: `${contextualRole}:${component}`,
        boundaryDisposition: "role-safe-representation",
        equivalenceId: equivalence.equivalenceId,
        rationale: "Source role preserved while using an explicitly declared representation code.",
      },
    };
  }

  const canonicalCode = runtime.aliases.get(normalizeAlias(candidate.acordCode)) || null;
  const canonicalNode = canonicalCode ? runtime.nodes.get(canonicalCode) : null;
  const projectedRole = roleForCode(canonicalCode || candidate.acordCode);
  const crossRole = Boolean(contextualRole && projectedRole && contextualRole !== projectedRole);
  if (crossRole) {
    return {
      ...cleanCandidate,
      rp8: {
        ontologyScope: "dictionary-only",
        canonical: false,
        canonicalAcordCode: null,
        semanticRole: contextualRole,
        component,
        semanticIdentity: `${contextualRole}:${component || "role"}`,
        boundaryDisposition: "blocked",
        equivalenceId: null,
        rationale: `Blocked ${projectedRole} candidate for contextual ${contextualRole} role.`,
      },
    };
  }

  if (canonicalNode && canonicalCode) {
    const semanticRole = contextualRole || candidateRole || projectedRole;
    const canonicalComponent = componentForCode(canonicalCode) || component;
    return {
      ...cleanCandidate,
      acordCode: canonicalCode,
      label: canonicalNode.aliases?.[0] || candidate.label,
      rp8: {
        ontologyScope: "canonical",
        canonical: true,
        canonicalAcordCode: canonicalCode,
        semanticRole,
        component: canonicalComponent,
        semanticIdentity: semanticRole ? `${semanticRole}:${canonicalComponent || "role"}` : null,
        boundaryDisposition: semanticRole ? "allowed" : "not-role-bearing",
        equivalenceId: null,
        rationale: canonicalCode === candidate.acordCode
          ? "Candidate is an active RP-8 canonical ontology node."
          : `Canonicalized evidence-backed alias ${candidate.acordCode} to ${canonicalCode}.`,
      },
    };
  }

  return {
    ...cleanCandidate,
    rp8: {
      ontologyScope: "dictionary-only",
      canonical: false,
      canonicalAcordCode: null,
      semanticRole: contextualRole || candidateRole,
      component,
      semanticIdentity: (contextualRole || candidateRole)
        ? `${contextualRole || candidateRole}:${component || "role"}`
        : null,
      boundaryDisposition: "not-role-bearing",
      equivalenceId: null,
      rationale: "Candidate is retained as a dictionary alternative outside the active RP-8 canonical ontology.",
    },
  };
}

function isSelectable(candidate: Rp8ProjectedCandidate | undefined): boolean {
  return Boolean(candidate?.rp8.canonical && candidate.rp8.boundaryDisposition !== "blocked");
}

export function projectMappingsToRp8(mappings: FieldMapping[]): FieldMapping[] {
  return mappings.map((mapping) => {
    const rawContextText = [mapping.semanticLabel, mapping.text].filter(Boolean).join(" ");
    const leadingRole = roleForCode(mapping.suggestions[0]?.acordCode || "");
    const contextText = roleFromText(rawContextText) || !leadingRole
      ? rawContextText
      : `${leadingRole} ${rawContextText}`;
    const suggestions = mapping.suggestions
      .map((candidate, index) => ({ candidate: projectCandidateToRp8(candidate, contextText), index }))
      .sort((left, right) => {
        const priority = (candidate: Rp8ProjectedCandidate) =>
          candidate.rp8.ontologyScope === "canonical"
            ? 0
            : candidate.rp8.ontologyScope === "role-safe-representation"
            ? 1
            : 2;
        return priority(left.candidate) - priority(right.candidate) || left.index - right.index;
      })
      .map(({ candidate }) => candidate);
    const chosen = suggestions.find(isSelectable);
    return {
      ...mapping,
      suggestions,
      topCandidate: suggestions[0],
      chosen,
    };
  });
}

export function assertRp8FinalSelections(mappings: FieldMapping[]): void {
  for (const mapping of mappings) {
    const suggestions = mapping.suggestions as Rp8ProjectedCandidate[];
    const firstSelectable = suggestions.find(isSelectable);
    const chosen = mapping.chosen as Rp8ProjectedCandidate | undefined;
    if (chosen?.rp8?.ontologyScope === "dictionary-only") {
      throw new Error(`RP-8 selection invariant failed: dictionary-only candidate selected for ${mapping.blockId}`);
    }
    if ((chosen?.acordCode || null) !== (firstSelectable?.acordCode || null)) {
      throw new Error(`RP-8 selection invariant failed: chosen candidate does not match projected rank for ${mapping.blockId}`);
    }
    const firstDictionaryIndex = suggestions.findIndex(
      (candidate) => candidate.rp8.ontologyScope === "dictionary-only",
    );
    const lastCanonicalIndex = suggestions.reduce(
      (lastIndex, candidate, index) => candidate.rp8.canonical ? index : lastIndex,
      -1,
    );
    if (firstDictionaryIndex >= 0 && lastCanonicalIndex > firstDictionaryIndex) {
      throw new Error(`RP-8 ranking invariant failed: canonical candidate follows dictionary-only candidate for ${mapping.blockId}`);
    }
  }
}

export function collectReferencedRp8Nodes(mappings: FieldMapping[]): AcordOntologyNode[] {
  const runtime = getActiveRp8OntologyRuntime();
  const codes = new Set<string>();
  for (const mapping of mappings) {
    for (const candidate of mapping.suggestions as Rp8ProjectedCandidate[]) {
      if (candidate.rp8?.canonicalAcordCode) codes.add(candidate.rp8.canonicalAcordCode);
    }
  }
  return Array.from(codes)
    .sort((left, right) => left.localeCompare(right))
    .map((code) => runtime.nodes.get(code))
    .filter((node): node is AcordOntologyNode => Boolean(node));
}
