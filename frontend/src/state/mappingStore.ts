import { create } from "zustand";
import { useMemo } from "react";
import type {
  AcordLabelCandidate,
  CarrierAdapterOverride,
  CarrierAdapterSnapshot,
  ConflictOverride,
  FusionOverride,
  GlobalSemanticGraphEdgeOverride,
  GlobalSemanticGraphMergeDecision,
  GlobalSemanticGraphSnapshot,
  RiskFactorOverride,
  RiskFactorSnapshot,
  RiskScoringSnapshot,
  SemanticMemoryDecision,
  SemanticMemorySnapshot,
  SemanticConflictRecord,
  UnderwritingDecisionDrift,
  UnderwritingDecisionGovernanceDecision,
  UnderwritingDecisionOverride,
  UnderwritingDecisionSnapshot,
  SubmissionDrift,
  SubmissionOverride,
  SubmissionPackage,
  SubmissionStatusSnapshot,
  CarrierSubmissionResponse,
  UnderwritingRuleDecision,
  UnderwritingRuleOverride,
  UnderwritingRuleSnapshot,
} from "../../../shared/src/acord/acordTypes";
import { getDefaultOntologyMetadata } from "../../../shared/src/acord/ontology";
import type {
  AssociationEdit,
  CalibrationProfile,
  CalibrationOverrideSuggestion,
  FieldMetadataSource,
  FieldMapping,
  FormFamilyMetadata,
  MappingOverride,
  MappingPersistencePayload,
  MappingReviewRecord,
  ReviewConfidenceThresholds,
  ReviewDecision,
  SchemaArtifactKind,
  SchemaArtifactMetadata,
  UnifiedDecisionGraph,
} from "@shared/types";
import { createDefaultCalibrationProfile } from "../../../shared/src/quality";
import { useDesignerStore } from "./designerStore";
import { useExtractionStore } from "./extractionStore";
import { useSelectedField } from "./fieldStore";
import type { Field, DesignerFieldSnapshot } from "./designerStore";

const DEFAULT_THRESHOLDS: ReviewConfidenceThresholds = {
  accepted: 0.8,
  review: 0.6,
  rejected: 0.45,
};
const DEFAULT_CALIBRATION_PROFILE = createDefaultCalibrationProfile();

const API_BASE_URL = (() => {
  const configured = (
    import.meta.env.VITE_API_BASE_URL as string | undefined
  )?.trim();
  if (configured) {
    return configured;
  }

  if (typeof window === "undefined") {
    return "";
  }

  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:7071`;
  }

  return "";
})();

function apiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore malformed error payloads.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function createEmptyDecisionGraph(): UnifiedDecisionGraph {
  return {
    labels: {},
    fields: {},
    mappings: {},
    confidenceThresholds: DEFAULT_THRESHOLDS,
  };
}

function toFieldMetadataSource(
  source: AcordLabelCandidate["source"] | undefined,
): FieldMetadataSource {
  if (source === "manual") return "manual";
  return "ai";
}

function applyCandidateToField(
  fieldId: string | undefined,
  extractionBlockId: string,
  candidate: AcordLabelCandidate | undefined,
) {
  if (!fieldId || !candidate) {
    return;
  }

  const state = useDesignerStore.getState();
  const field = state.fields.find((item) => item.id === fieldId);
  if (!field) {
    return;
  }

  state.updateField(fieldId, {
    metadata: {
      ...field.metadata,
      acordCode: candidate.acordCode,
      acordLabel: candidate.label,
      acordDescription: candidate.description || "",
      fieldType: field.metadata?.fieldType || (field.type === "rect" ? "text" : field.type),
      required: field.metadata?.required || false,
      confidenceScore: candidate.confidenceScore,
      source: toFieldMetadataSource(candidate.source),
      extractionBlockId,
    },
  });
}

function createMappingNode(record: MappingReviewRecord) {
  return {
    artifactId: record.extractionBlockId,
    decision: "pending" as ReviewDecision,
    linkedArtifactIds: record.fieldId
      ? [record.extractionBlockId, record.fieldId].sort((left, right) =>
          left.localeCompare(right),
        )
      : [record.extractionBlockId],
    chosenCandidateCode: record.mapping.chosen?.acordCode,
    candidateDecisions: Object.fromEntries(
      [...record.mapping.suggestions]
        .sort((left, right) => left.acordCode.localeCompare(right.acordCode))
        .map((candidate) => [candidate.acordCode, "pending" as ReviewDecision]),
    ),
    rationale: record.mapping.rationale,
  };
}

function inferDocumentId(documentId: string | undefined, extractionDocumentId: string | undefined) {
  return documentId || extractionDocumentId || undefined;
}

function hashContent(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function appendAssociationLineage(
  record: MappingReviewRecord,
  previousExtractionBlockId: string | undefined,
  nextExtractionBlockId: string | undefined,
) {
  const previous = previousExtractionBlockId || "none";
  const next = nextExtractionBlockId || "none";
  const note = `Association updated from ${previous} to ${next}`;

  if (!record.mapping.rationale) {
    return {
      ...record,
      mapping: {
        ...record.mapping,
        rationale: {
          summary: "Association updated manually.",
          semanticEvidence: [note],
          lexicalEvidence: [],
          confidenceThresholds: DEFAULT_THRESHOLDS,
          ambiguityNotes: [
            "Candidate mapping evidence may need regeneration after association changes.",
          ],
          contributingLabels: [],
        },
      },
    };
  }

  const semanticEvidence = Array.from(
    new Set([...(record.mapping.rationale.semanticEvidence || []), note]),
  ).sort((left, right) => left.localeCompare(right));
  return {
    ...record,
    mapping: {
      ...record.mapping,
      rationale: {
        ...record.mapping.rationale,
        semanticEvidence,
      },
    },
  };
}

function createSyntheticMappingRecord(
  extractionBlockId: string,
  state: MappingStoreState,
): MappingReviewRecord {
  const extraction = useExtractionStore.getState();
  const block = extraction.textBlocks.find((item) => item.id === extractionBlockId);

  return {
    extractionBlockId,
    mapping: {
      blockId: extractionBlockId,
      page: block?.page || 1,
      text: block?.text || "",
      boundingBox: block?.boundingBox || {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      suggestions: [],
      rationale: {
        summary: "Association was manually linked to an extraction block.",
        semanticEvidence: [
          "No ACORD candidates were precomputed for this extraction block.",
        ],
        lexicalEvidence: [],
        confidenceThresholds: state.decisionGraph.confidenceThresholds,
        ambiguityNotes: [
          "Run mapping to generate suggestions for this manual association.",
        ],
        contributingLabels: [],
      },
    },
  };
}

function updateExtractionAssociationLinks(
  fieldId: string,
  previousExtractionBlockId: string | undefined,
  nextExtractionBlockId: string | undefined,
) {
  const extraction = useExtractionStore.getState();
  const graph = extraction.decisionGraph;
  const labels = { ...graph.labels };

  if (previousExtractionBlockId && labels[previousExtractionBlockId]) {
    labels[previousExtractionBlockId] = {
      ...labels[previousExtractionBlockId],
      linkedArtifactIds: labels[previousExtractionBlockId].linkedArtifactIds.filter(
        (id) => id !== fieldId,
      ),
    };
  }

  if (nextExtractionBlockId) {
    const existingLabel = labels[nextExtractionBlockId];
    labels[nextExtractionBlockId] = {
      artifactId: existingLabel?.artifactId || nextExtractionBlockId,
      decision: existingLabel?.decision || "pending",
      note: existingLabel?.note,
      linkedArtifactIds: Array.from(
        new Set([...(existingLabel?.linkedArtifactIds || []), fieldId]),
      ).sort((left, right) => left.localeCompare(right)),
    };
  }

  const existingFieldNode = graph.fields[fieldId];
  extraction.setDecisionGraph({
    ...graph,
    labels,
    fields: {
      ...graph.fields,
      [fieldId]: {
        artifactId: existingFieldNode?.artifactId || fieldId,
        decision: existingFieldNode?.decision || "pending",
        note: existingFieldNode?.note,
        linkedArtifactIds: nextExtractionBlockId ? [nextExtractionBlockId] : [],
      },
    },
  });
}

type MappingStoreState = {
  documentId?: string;
  mappings: Record<string, MappingReviewRecord>;
  decisionGraph: UnifiedDecisionGraph;
  calibrationProfile: CalibrationProfile;
  formFamily?: FormFamilyMetadata;
  overrides: Record<string, MappingOverride>;
  associationEdits: AssociationEdit[];
  schemaArtifacts: SchemaArtifactMetadata[];
  semanticConflicts: SemanticConflictRecord[];
  conflictOverrides: ConflictOverride[];
  fusionOverrides: FusionOverride[];
  semanticFusionSnapshot?: {
    generatedAt: string;
    profileHash: string;
    unificationHash: string;
    conflictHash: string;
  };
  semanticMemorySnapshot?: SemanticMemorySnapshot;
  semanticMemoryDecisions: SemanticMemoryDecision[];
  selectedSemanticMemoryVersion?: string;
  globalSemanticGraphSnapshot?: GlobalSemanticGraphSnapshot;
  globalSemanticGraphEdgeOverrides: GlobalSemanticGraphEdgeOverride[];
  globalSemanticGraphMergeDecisions: GlobalSemanticGraphMergeDecision[];
  selectedGlobalSemanticGraphVersion?: string;
  carrierAdapterSnapshot?: CarrierAdapterSnapshot;
  carrierAdapterOverrides: CarrierAdapterOverride[];
  underwritingRuleSnapshot?: UnderwritingRuleSnapshot;
  underwritingRuleOverrides: UnderwritingRuleOverride[];
  underwritingRuleDecisions: UnderwritingRuleDecision[];
  selectedUnderwritingRuleVersion?: string;
  riskFactorSnapshot?: RiskFactorSnapshot;
  riskFactorOverrides: RiskFactorOverride[];
  riskScoringSnapshot?: RiskScoringSnapshot;
  underwritingDecisionSnapshot?: UnderwritingDecisionSnapshot;
  underwritingDecisionOverrides: UnderwritingDecisionOverride[];
  underwritingDecisionDecisions: UnderwritingDecisionGovernanceDecision[];
  underwritingDecisionDrift?: UnderwritingDecisionDrift;
  selectedUnderwritingDecisionVersion?: string;
  submissionPackage?: SubmissionPackage;
  submissionOverrides: SubmissionOverride[];
  submissionStatus?: SubmissionStatusSnapshot;
  carrierSubmissionResponse?: CarrierSubmissionResponse;
  submissionDrift?: SubmissionDrift;
  selectedSubmissionVersion?: string;
  designerFieldSnapshot: Record<string, DesignerFieldSnapshot>;
  lastSavedBlobName?: string;
  initializeMappings: (documentId: string | undefined, mappings: FieldMapping[]) => void;
  linkFieldToMapping: (fieldId: string, extractionBlockId: string) => void;
  unlinkFieldAssociation: (fieldId: string, reason?: string) => void;
  reassignFieldAssociation: (
    fieldId: string,
    nextExtractionBlockId: string,
    reason?: string,
  ) => void;
  chooseCandidate: (extractionBlockId: string, acordCode: string) => void;
  acceptCandidate: (extractionBlockId: string, acordCode: string) => void;
  rejectCandidate: (extractionBlockId: string, acordCode: string) => void;
  acceptMapping: (extractionBlockId: string) => void;
  rejectMapping: (extractionBlockId: string) => void;
  clearOverride: (fieldIdOrExtractionBlockId: string) => void;
  saveReview: () => Promise<{ blobName: string; url: string } | null>;
  loadReview: (documentId?: string) => Promise<boolean>;
  registerSchemaArtifact: (
    kind: SchemaArtifactKind,
    content: string,
    includedMappings: number,
    fileName?: string,
  ) => void;
  setCalibrationProfile: (profile: CalibrationProfile) => void;
  setFormFamily: (family: FormFamilyMetadata) => void;
  acceptCalibrationSuggestion: (suggestion: CalibrationOverrideSuggestion) => void;
  loadCalibrationProfile: (profileId?: string) => Promise<CalibrationProfile>;
  saveCalibrationProfile: (options?: {
    changedBy?: string;
    reason?: string;
    summary?: string;
  }) => Promise<CalibrationProfile>;
  setSemanticConflicts: (conflicts: SemanticConflictRecord[]) => void;
  setConflictOverride: (override: ConflictOverride) => void;
  setFusionOverride: (override: FusionOverride) => void;
  setSemanticFusionSnapshot: (snapshot: {
    generatedAt: string;
    profileHash: string;
    unificationHash: string;
    conflictHash: string;
  }) => void;
  setSemanticMemorySnapshot: (snapshot: SemanticMemorySnapshot | undefined) => void;
  setSemanticMemoryDecision: (decision: SemanticMemoryDecision) => void;
  setSelectedSemanticMemoryVersion: (versionId: string | undefined) => void;
  setGlobalSemanticGraphSnapshot: (snapshot: GlobalSemanticGraphSnapshot | undefined) => void;
  setGlobalSemanticGraphEdgeOverride: (override: GlobalSemanticGraphEdgeOverride) => void;
  setGlobalSemanticGraphMergeDecision: (decision: GlobalSemanticGraphMergeDecision) => void;
  setSelectedGlobalSemanticGraphVersion: (versionId: string | undefined) => void;
  setCarrierAdapterSnapshot: (snapshot: CarrierAdapterSnapshot | undefined) => void;
  setCarrierAdapterOverride: (override: CarrierAdapterOverride) => void;
  setUnderwritingRuleSnapshot: (snapshot: UnderwritingRuleSnapshot | undefined) => void;
  setUnderwritingRuleOverride: (override: UnderwritingRuleOverride) => void;
  setUnderwritingRuleDecision: (decision: UnderwritingRuleDecision) => void;
  setSelectedUnderwritingRuleVersion: (versionId: string | undefined) => void;
  setRiskFactorSnapshot: (snapshot: RiskFactorSnapshot | undefined) => void;
  setRiskFactorOverride: (override: RiskFactorOverride) => void;
  setRiskScoringSnapshot: (snapshot: RiskScoringSnapshot | undefined) => void;
  setUnderwritingDecisionSnapshot: (snapshot: UnderwritingDecisionSnapshot | undefined) => void;
  setUnderwritingDecisionOverride: (override: UnderwritingDecisionOverride) => void;
  setUnderwritingDecisionGovernanceDecision: (
    decision: UnderwritingDecisionGovernanceDecision,
  ) => void;
  setUnderwritingDecisionDrift: (drift: UnderwritingDecisionDrift | undefined) => void;
  setSelectedUnderwritingDecisionVersion: (versionId: string | undefined) => void;
  setSubmissionPackage: (submissionPackage: SubmissionPackage | undefined) => void;
  setSubmissionOverride: (override: SubmissionOverride) => void;
  setSubmissionStatus: (submissionStatus: SubmissionStatusSnapshot | undefined) => void;
  setCarrierSubmissionResponse: (response: CarrierSubmissionResponse | undefined) => void;
  setSubmissionDrift: (drift: SubmissionDrift | undefined) => void;
  setSelectedSubmissionVersion: (versionId: string | undefined) => void;
  syncDesignerFields: (fields: Field[]) => void;
  clear: () => void;
};

export const useMappingStore = create<MappingStoreState>((set, get) => ({
  documentId: undefined,
  mappings: {},
  decisionGraph: createEmptyDecisionGraph(),
  calibrationProfile: DEFAULT_CALIBRATION_PROFILE,
  formFamily: undefined,
  overrides: {},
  associationEdits: [],
  schemaArtifacts: [],
  semanticConflicts: [],
  conflictOverrides: [],
  fusionOverrides: [],
  semanticFusionSnapshot: undefined,
  semanticMemorySnapshot: undefined,
  semanticMemoryDecisions: [],
  selectedSemanticMemoryVersion: undefined,
  globalSemanticGraphSnapshot: undefined,
  globalSemanticGraphEdgeOverrides: [],
  globalSemanticGraphMergeDecisions: [],
  selectedGlobalSemanticGraphVersion: undefined,
  carrierAdapterSnapshot: undefined,
  carrierAdapterOverrides: [],
  underwritingRuleSnapshot: undefined,
  underwritingRuleOverrides: [],
  underwritingRuleDecisions: [],
  selectedUnderwritingRuleVersion: undefined,
  riskFactorSnapshot: undefined,
  riskFactorOverrides: [],
  riskScoringSnapshot: undefined,
  underwritingDecisionSnapshot: undefined,
  underwritingDecisionOverrides: [],
  underwritingDecisionDecisions: [],
  underwritingDecisionDrift: undefined,
  selectedUnderwritingDecisionVersion: undefined,
  submissionPackage: undefined,
  submissionOverrides: [],
  submissionStatus: undefined,
  carrierSubmissionResponse: undefined,
  submissionDrift: undefined,
  selectedSubmissionVersion: undefined,
  designerFieldSnapshot: {},
  lastSavedBlobName: undefined,
  initializeMappings: (documentId, mappings) =>
    set((state) => {
      const nextMappings = Object.fromEntries(
        mappings.map((mapping) => {
          const existing = state.mappings[mapping.blockId];
          const record: MappingReviewRecord = {
            extractionBlockId: mapping.blockId,
            fieldId: existing?.fieldId,
            mapping,
          };
          return [mapping.blockId, record];
        }),
      );

      const nextDecisionGraph: UnifiedDecisionGraph = {
        ...state.decisionGraph,
        mappings: Object.fromEntries(
          Object.values(nextMappings).map((record) => {
            const existingNode = state.decisionGraph.mappings[record.extractionBlockId];
            return [
              record.extractionBlockId,
              existingNode
                ? {
                    ...existingNode,
                    linkedArtifactIds: record.fieldId
                      ? [record.extractionBlockId, record.fieldId]
                      : [record.extractionBlockId],
                    rationale: record.mapping.rationale,
                  }
                : createMappingNode(record),
            ];
          }),
        ),
      };

      return {
        documentId: inferDocumentId(documentId, state.documentId),
        mappings: nextMappings,
        decisionGraph: nextDecisionGraph,
      };
    }),
  linkFieldToMapping: (fieldId, extractionBlockId) =>
    set((state) => {
      const record = state.mappings[extractionBlockId];
      if (!record) {
        return state;
      }

      const nextRecord: MappingReviewRecord = {
        ...record,
        fieldId,
      };
      applyCandidateToField(fieldId, extractionBlockId, nextRecord.mapping.chosen);

      return {
        mappings: {
          ...state.mappings,
          [extractionBlockId]: nextRecord,
        },
        decisionGraph: {
          ...state.decisionGraph,
          mappings: {
            ...state.decisionGraph.mappings,
            [extractionBlockId]: {
              ...(state.decisionGraph.mappings[extractionBlockId] ||
                createMappingNode(nextRecord)),
              linkedArtifactIds: [extractionBlockId, fieldId],
            },
          },
        },
      };
    }),
  unlinkFieldAssociation: (fieldId, reason) =>
    set((state) => {
      const field = useDesignerStore.getState().fields.find((item) => item.id === fieldId);
      if (!field) {
        return state;
      }

      const previousExtractionBlockId = field.metadata?.extractionBlockId;
      if (!previousExtractionBlockId) {
        return state;
      }

      const previousRecord = state.mappings[previousExtractionBlockId];
      const nextMappings = { ...state.mappings };
      if (previousRecord?.fieldId === fieldId) {
        nextMappings[previousExtractionBlockId] = {
          ...previousRecord,
          fieldId: undefined,
        };
      }

      useDesignerStore.getState().updateField(fieldId, {
        metadata: {
          ...field.metadata,
          extractionBlockId: undefined,
        },
      });

      updateExtractionAssociationLinks(fieldId, previousExtractionBlockId, undefined);

      const changedAt = new Date().toISOString();
      return {
        mappings: nextMappings,
        decisionGraph: {
          ...state.decisionGraph,
          mappings: {
            ...state.decisionGraph.mappings,
            [previousExtractionBlockId]: {
              ...(state.decisionGraph.mappings[previousExtractionBlockId] ||
                createMappingNode(
                  nextMappings[previousExtractionBlockId] ||
                    createSyntheticMappingRecord(previousExtractionBlockId, state),
                )),
              linkedArtifactIds: [previousExtractionBlockId],
              rationale: previousRecord
                ? appendAssociationLineage(
                    previousRecord,
                    previousExtractionBlockId,
                    undefined,
                  ).mapping.rationale
                : state.decisionGraph.mappings[previousExtractionBlockId]?.rationale,
            },
          },
        },
        associationEdits: [
          ...state.associationEdits,
          {
            fieldId,
            previousExtractionBlockId,
            nextExtractionBlockId: undefined,
            changedAt,
            reason,
          },
        ],
      };
    }),
  reassignFieldAssociation: (fieldId, nextExtractionBlockId, reason) =>
    set((state) => {
      const designer = useDesignerStore.getState();
      const field = designer.fields.find((item) => item.id === fieldId);
      if (!field) {
        return state;
      }

      const previousExtractionBlockId = field.metadata?.extractionBlockId;
      if (previousExtractionBlockId === nextExtractionBlockId) {
        return state;
      }

      const nextMappings = { ...state.mappings };
      const previousRecord = previousExtractionBlockId
        ? nextMappings[previousExtractionBlockId]
        : undefined;
      if (previousRecord?.fieldId === fieldId) {
        nextMappings[previousExtractionBlockId] = {
          ...previousRecord,
          fieldId: undefined,
        };
      }

      const targetRecord =
        nextMappings[nextExtractionBlockId] ||
        createSyntheticMappingRecord(nextExtractionBlockId, state);
      const nextRecord = appendAssociationLineage(
        {
          ...targetRecord,
          fieldId,
        },
        previousExtractionBlockId,
        nextExtractionBlockId,
      );
      nextMappings[nextExtractionBlockId] = nextRecord;

      applyCandidateToField(fieldId, nextExtractionBlockId, nextRecord.mapping.chosen);
      designer.updateField(fieldId, {
        metadata: {
          ...field.metadata,
          extractionBlockId: nextExtractionBlockId,
        },
      });

      updateExtractionAssociationLinks(
        fieldId,
        previousExtractionBlockId,
        nextExtractionBlockId,
      );

      const changedAt = new Date().toISOString();
      const nextDecisionMappings = { ...state.decisionGraph.mappings };
      if (previousExtractionBlockId) {
        nextDecisionMappings[previousExtractionBlockId] = {
          ...(nextDecisionMappings[previousExtractionBlockId] ||
            createMappingNode(
              nextMappings[previousExtractionBlockId] ||
                createSyntheticMappingRecord(previousExtractionBlockId, state),
            )),
          linkedArtifactIds: [previousExtractionBlockId],
        };
      }

      nextDecisionMappings[nextExtractionBlockId] = {
        ...(nextDecisionMappings[nextExtractionBlockId] || createMappingNode(nextRecord)),
        linkedArtifactIds: [nextExtractionBlockId, fieldId],
        rationale: nextRecord.mapping.rationale,
      };

      return {
        mappings: nextMappings,
        decisionGraph: {
          ...state.decisionGraph,
          mappings: nextDecisionMappings,
        },
        associationEdits: [
          ...state.associationEdits,
          {
            fieldId,
            previousExtractionBlockId,
            nextExtractionBlockId,
            changedAt,
            reason,
          },
        ],
      };
    }),
  chooseCandidate: (extractionBlockId, acordCode) =>
    set((state) => {
      const record = state.mappings[extractionBlockId];
      if (!record) {
        return state;
      }

      const candidate = record.mapping.suggestions.find(
        (item) => item.acordCode === acordCode,
      );
      if (!candidate) {
        return state;
      }

      const nextRecord: MappingReviewRecord = {
        ...record,
        mapping: {
          ...record.mapping,
          chosen: candidate,
        },
      };
      applyCandidateToField(record.fieldId, extractionBlockId, candidate);

      const overrideKey = record.fieldId || extractionBlockId;
      return {
        mappings: {
          ...state.mappings,
          [extractionBlockId]: nextRecord,
        },
        overrides: {
          ...state.overrides,
          [overrideKey]: {
            fieldId: record.fieldId || extractionBlockId,
            extractionBlockId,
            acordCode: candidate.acordCode,
            acordLabel: candidate.label,
            acordDescription: candidate.description,
            rationale: candidate.rationale,
            source: toFieldMetadataSource(candidate.source),
            confidenceScore: candidate.confidenceScore,
          },
        },
        decisionGraph: {
          ...state.decisionGraph,
          mappings: {
            ...state.decisionGraph.mappings,
            [extractionBlockId]: {
              ...(state.decisionGraph.mappings[extractionBlockId] ||
                createMappingNode(nextRecord)),
              chosenCandidateCode: acordCode,
              rationale: nextRecord.mapping.rationale,
            },
          },
        },
      };
    }),
  acceptCandidate: (extractionBlockId, acordCode) =>
    set((state) => {
      const record = state.mappings[extractionBlockId];
      if (!record) {
        return state;
      }

      const node = state.decisionGraph.mappings[extractionBlockId] || createMappingNode(record);
      if (record.fieldId) {
        useExtractionStore.getState().acceptField(record.fieldId);
      }
      useExtractionStore.getState().acceptLabel(extractionBlockId);

      return {
        decisionGraph: {
          ...state.decisionGraph,
          mappings: {
            ...state.decisionGraph.mappings,
            [extractionBlockId]: {
              ...node,
              decision: "accepted",
              chosenCandidateCode: acordCode,
              candidateDecisions: {
                ...node.candidateDecisions,
                [acordCode]: "accepted",
              },
            },
          },
        },
      };
    }),
  rejectCandidate: (extractionBlockId, acordCode) =>
    set((state) => {
      const record = state.mappings[extractionBlockId];
      if (!record) {
        return state;
      }

      const node = state.decisionGraph.mappings[extractionBlockId] || createMappingNode(record);
      return {
        decisionGraph: {
          ...state.decisionGraph,
          mappings: {
            ...state.decisionGraph.mappings,
            [extractionBlockId]: {
              ...node,
              decision:
                node.chosenCandidateCode === acordCode ? "rejected" : node.decision,
              candidateDecisions: {
                ...node.candidateDecisions,
                [acordCode]: "rejected",
              },
            },
          },
        },
      };
    }),
  acceptMapping: (extractionBlockId) =>
    set((state) => {
      const record = state.mappings[extractionBlockId];
      if (!record) {
        return state;
      }

      if (record.fieldId) {
        useExtractionStore.getState().acceptField(record.fieldId);
      }
      useExtractionStore.getState().acceptLabel(extractionBlockId);

      return {
        decisionGraph: {
          ...state.decisionGraph,
          mappings: {
            ...state.decisionGraph.mappings,
            [extractionBlockId]: {
              ...(state.decisionGraph.mappings[extractionBlockId] ||
                createMappingNode(record)),
              decision: "accepted",
            },
          },
        },
      };
    }),
  rejectMapping: (extractionBlockId) =>
    set((state) => {
      const record = state.mappings[extractionBlockId];
      if (!record) {
        return state;
      }

      if (record.fieldId) {
        useExtractionStore.getState().rejectField(record.fieldId);
      }
      useExtractionStore.getState().rejectLabel(extractionBlockId);

      return {
        decisionGraph: {
          ...state.decisionGraph,
          mappings: {
            ...state.decisionGraph.mappings,
            [extractionBlockId]: {
              ...(state.decisionGraph.mappings[extractionBlockId] ||
                createMappingNode(record)),
              decision: "rejected",
            },
          },
        },
      };
    }),
  clearOverride: (fieldIdOrExtractionBlockId) =>
    set((state) => {
      const matchedRecord = Object.values(state.mappings).find(
        (record) =>
          record.extractionBlockId === fieldIdOrExtractionBlockId ||
          record.fieldId === fieldIdOrExtractionBlockId,
      );

      const nextOverrides = { ...state.overrides };
      delete nextOverrides[fieldIdOrExtractionBlockId];
      if (matchedRecord?.fieldId) {
        delete nextOverrides[matchedRecord.fieldId];
      }
      if (matchedRecord?.extractionBlockId) {
        delete nextOverrides[matchedRecord.extractionBlockId];
      }

      if (!matchedRecord) {
        return { overrides: nextOverrides };
      }

      const fallbackCandidate = matchedRecord.mapping.suggestions[0];
      const nextRecord: MappingReviewRecord = fallbackCandidate
        ? {
            ...matchedRecord,
            mapping: {
              ...matchedRecord.mapping,
              chosen: fallbackCandidate,
            },
          }
        : matchedRecord;

      applyCandidateToField(
        matchedRecord.fieldId,
        matchedRecord.extractionBlockId,
        fallbackCandidate,
      );

      return {
        overrides: nextOverrides,
        mappings: {
          ...state.mappings,
          [matchedRecord.extractionBlockId]: nextRecord,
        },
        decisionGraph: {
          ...state.decisionGraph,
          mappings: {
            ...state.decisionGraph.mappings,
            [matchedRecord.extractionBlockId]: {
              ...(state.decisionGraph.mappings[matchedRecord.extractionBlockId] ||
                createMappingNode(nextRecord)),
              chosenCandidateCode: fallbackCandidate?.acordCode,
            },
          },
        },
      };
    }),
  saveReview: async () => {
    const state = get();
    const extraction = useExtractionStore.getState();
    const fields = useDesignerStore.getState().fields;
    const documentId = inferDocumentId(state.documentId, extraction.documentId);

    if (!documentId) {
      return null;
    }

    const payload: MappingPersistencePayload = {
      version: 1,
      documentId,
      pages: extraction.pages,
      fields,
      mappings: Object.values(state.mappings),
      decisionGraph: {
        labels: extraction.decisionGraph.labels,
        fields: extraction.decisionGraph.fields,
        mappings: state.decisionGraph.mappings,
        confidenceThresholds:
          state.decisionGraph.confidenceThresholds || extraction.decisionGraph.confidenceThresholds,
      },
      overrides: state.overrides,
      suppressedOcrBlockIds: extraction.suppressedOcrBlockIds,
      associationEdits: state.associationEdits,
      schemaArtifacts: state.schemaArtifacts,
      calibrationProfile: state.calibrationProfile,
      formFamily: state.formFamily,
      ontologyAlignment: getDefaultOntologyMetadata(),
      semanticConflicts: state.semanticConflicts,
      conflictOverrides: state.conflictOverrides,
      fusionOverrides: state.fusionOverrides,
      semanticFusionSnapshot: state.semanticFusionSnapshot,
      semanticMemorySnapshot: state.semanticMemorySnapshot,
      semanticMemoryDecisions: state.semanticMemoryDecisions,
      selectedSemanticMemoryVersion: state.selectedSemanticMemoryVersion,
      globalSemanticGraphSnapshot: state.globalSemanticGraphSnapshot,
      globalSemanticGraphEdgeOverrides: state.globalSemanticGraphEdgeOverrides,
      globalSemanticGraphMergeDecisions: state.globalSemanticGraphMergeDecisions,
      selectedGlobalSemanticGraphVersion: state.selectedGlobalSemanticGraphVersion,
      carrierAdapterSnapshot: state.carrierAdapterSnapshot,
      carrierAdapterOverrides: state.carrierAdapterOverrides,
      underwritingRuleSnapshot: state.underwritingRuleSnapshot,
      underwritingRuleOverrides: state.underwritingRuleOverrides,
      underwritingRuleDecisions: state.underwritingRuleDecisions,
      selectedUnderwritingRuleVersion: state.selectedUnderwritingRuleVersion,
      riskFactorSnapshot: state.riskFactorSnapshot,
      riskFactorOverrides: state.riskFactorOverrides,
      riskScoringSnapshot: state.riskScoringSnapshot,
      underwritingDecisionSnapshot: state.underwritingDecisionSnapshot,
      underwritingDecisionOverrides: state.underwritingDecisionOverrides,
      underwritingDecisionDecisions: state.underwritingDecisionDecisions,
      underwritingDecisionDrift: state.underwritingDecisionDrift,
      selectedUnderwritingDecisionVersion: state.selectedUnderwritingDecisionVersion,
      submissionPackage: state.submissionPackage,
      submissionOverrides: state.submissionOverrides,
      submissionStatus: state.submissionStatus,
      carrierSubmissionResponse: state.carrierSubmissionResponse,
      submissionDrift: state.submissionDrift,
      selectedSubmissionVersion: state.selectedSubmissionVersion,
    };

    const saved = await fetchJson<{ success: boolean; blobName: string; url: string }>(
      apiUrl("/api/saveMapping"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          fileName: documentId,
        }),
      },
    );

    set({ lastSavedBlobName: saved.blobName, documentId });
    return {
      blobName: saved.blobName,
      url: saved.url,
    };
  },
  loadReview: async (documentId) => {
    const state = get();
    const extraction = useExtractionStore.getState();
    const resolvedDocumentId = inferDocumentId(
      documentId,
      inferDocumentId(state.documentId, extraction.documentId),
    );

    if (!resolvedDocumentId) {
      return false;
    }

    const payload = await fetchJson<MappingPersistencePayload>(
      `${apiUrl("/api/loadMapping")}?fileName=${encodeURIComponent(resolvedDocumentId)}`,
    );

    extraction.setDecisionGraph(payload.decisionGraph);
    extraction.setSuppressedOcrBlockIds(payload.suppressedOcrBlockIds || []);

    set({
      documentId: payload.documentId || resolvedDocumentId,
      mappings: Object.fromEntries(
        payload.mappings.map((record) => [record.extractionBlockId, record]),
      ),
      decisionGraph: {
        labels: {},
        fields: {},
        mappings: payload.decisionGraph.mappings,
        confidenceThresholds: payload.decisionGraph.confidenceThresholds,
      },
      overrides: payload.overrides || {},
      associationEdits: payload.associationEdits || [],
      schemaArtifacts: payload.schemaArtifacts || [],
      calibrationProfile: payload.calibrationProfile || DEFAULT_CALIBRATION_PROFILE,
      formFamily: payload.formFamily,
      semanticConflicts: payload.semanticConflicts || [],
      conflictOverrides: payload.conflictOverrides || [],
      fusionOverrides: payload.fusionOverrides || [],
      semanticFusionSnapshot: payload.semanticFusionSnapshot,
      semanticMemorySnapshot: payload.semanticMemorySnapshot,
      semanticMemoryDecisions: payload.semanticMemoryDecisions || [],
      selectedSemanticMemoryVersion: payload.selectedSemanticMemoryVersion,
      globalSemanticGraphSnapshot: payload.globalSemanticGraphSnapshot,
      globalSemanticGraphEdgeOverrides: payload.globalSemanticGraphEdgeOverrides || [],
      globalSemanticGraphMergeDecisions: payload.globalSemanticGraphMergeDecisions || [],
      selectedGlobalSemanticGraphVersion: payload.selectedGlobalSemanticGraphVersion,
      carrierAdapterSnapshot: payload.carrierAdapterSnapshot,
      carrierAdapterOverrides: payload.carrierAdapterOverrides || [],
      underwritingRuleSnapshot: payload.underwritingRuleSnapshot,
      underwritingRuleOverrides: payload.underwritingRuleOverrides || [],
      underwritingRuleDecisions: payload.underwritingRuleDecisions || [],
      selectedUnderwritingRuleVersion: payload.selectedUnderwritingRuleVersion,
      riskFactorSnapshot: payload.riskFactorSnapshot,
      riskFactorOverrides: payload.riskFactorOverrides || [],
      riskScoringSnapshot: payload.riskScoringSnapshot,
      underwritingDecisionSnapshot: payload.underwritingDecisionSnapshot,
      underwritingDecisionOverrides: payload.underwritingDecisionOverrides || [],
      underwritingDecisionDecisions: payload.underwritingDecisionDecisions || [],
      underwritingDecisionDrift: payload.underwritingDecisionDrift,
      selectedUnderwritingDecisionVersion: payload.selectedUnderwritingDecisionVersion,
      submissionPackage: payload.submissionPackage,
      submissionOverrides: payload.submissionOverrides || [],
      submissionStatus: payload.submissionStatus,
      carrierSubmissionResponse: payload.carrierSubmissionResponse,
      submissionDrift: payload.submissionDrift,
      selectedSubmissionVersion: payload.selectedSubmissionVersion,
    });

    for (const record of payload.mappings) {
      const chosen = record.mapping.chosen;
      if (record.fieldId && chosen) {
        applyCandidateToField(record.fieldId, record.extractionBlockId, chosen);
        continue;
      }

      const matchingField = useDesignerStore
        .getState()
        .fields.find(
          (field) => field.metadata?.extractionBlockId === record.extractionBlockId,
        );

      if (matchingField && chosen) {
        get().linkFieldToMapping(matchingField.id, record.extractionBlockId);
      }
    }

    return true;
  },
  registerSchemaArtifact: (kind, content, includedMappings, fileName) =>
    set((state) => {
      const generatedAt = new Date().toISOString();
      const artifact: SchemaArtifactMetadata = {
        kind,
        generatedAt,
        hash: hashContent(content),
        includedMappings,
        fileName,
      };

      return {
        schemaArtifacts: [
          ...state.schemaArtifacts.filter((item) => item.kind !== kind),
          artifact,
        ],
      };
    }),
  setCalibrationProfile: (profile) =>
    set(() => ({
      calibrationProfile: {
        ...profile,
        codeThresholdOverrides: Object.fromEntries(
          Object.entries(profile.codeThresholdOverrides || {}).sort((a, b) =>
            a[0].localeCompare(b[0]),
          ),
        ),
      },
      decisionGraph: {
        ...get().decisionGraph,
        confidenceThresholds: profile.globalThresholds,
      },
    })),
  setFormFamily: (family) => set({ formFamily: family }),
  setSemanticConflicts: (conflicts) => set({ semanticConflicts: [...conflicts] }),
  setConflictOverride: (override) =>
    set((state) => ({
      conflictOverrides: [
        ...state.conflictOverrides.filter((item) => item.conflictId !== override.conflictId),
        override,
      ].sort((left, right) => left.conflictId.localeCompare(right.conflictId)),
    })),
  setFusionOverride: (override) =>
    set((state) => ({
      fusionOverrides: [
        ...state.fusionOverrides.filter((item) => item.groupId !== override.groupId),
        override,
      ].sort((left, right) => left.groupId.localeCompare(right.groupId)),
    })),
  setSemanticFusionSnapshot: (snapshot) =>
    set(() => ({
      semanticFusionSnapshot: snapshot,
    })),
  setSemanticMemorySnapshot: (snapshot) =>
    set(() => ({
      semanticMemorySnapshot: snapshot,
    })),
  setSemanticMemoryDecision: (decision) =>
    set((state) => ({
      semanticMemoryDecisions: [
        ...state.semanticMemoryDecisions.filter((item) => item.decisionId !== decision.decisionId),
        decision,
      ].sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    })),
  setSelectedSemanticMemoryVersion: (versionId) =>
    set(() => ({
      selectedSemanticMemoryVersion: versionId,
    })),
  setGlobalSemanticGraphSnapshot: (snapshot) =>
    set(() => ({
      globalSemanticGraphSnapshot: snapshot,
    })),
  setGlobalSemanticGraphEdgeOverride: (override) =>
    set((state) => {
      const resolvedId =
        override.edgeId ||
        `${override.edgeType}:${override.fromNodeId}->${override.toNodeId}`;
      return {
        globalSemanticGraphEdgeOverrides: [
          ...state.globalSemanticGraphEdgeOverrides.filter(
            (item) =>
              (item.edgeId || `${item.edgeType}:${item.fromNodeId}->${item.toNodeId}`) !==
              resolvedId,
          ),
          {
            ...override,
            edgeId: resolvedId,
          },
        ].sort((left, right) =>
          (left.edgeId || "").localeCompare(right.edgeId || ""),
        ),
      };
    }),
  setGlobalSemanticGraphMergeDecision: (decision) =>
    set((state) => ({
      globalSemanticGraphMergeDecisions: [
        ...state.globalSemanticGraphMergeDecisions.filter(
          (item) => item.decisionId !== decision.decisionId,
        ),
        decision,
      ].sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    })),
  setSelectedGlobalSemanticGraphVersion: (versionId) =>
    set(() => ({
      selectedGlobalSemanticGraphVersion: versionId,
    })),
  setCarrierAdapterSnapshot: (snapshot) =>
    set(() => ({
      carrierAdapterSnapshot: snapshot,
    })),
  setCarrierAdapterOverride: (override) =>
    set((state) => ({
      carrierAdapterOverrides: [
        ...state.carrierAdapterOverrides.filter(
          (item) =>
            item.carrierId !== override.carrierId || item.carrierCode !== override.carrierCode,
        ),
        override,
      ].sort(
        (left, right) =>
          left.carrierId.localeCompare(right.carrierId) ||
          left.carrierCode.localeCompare(right.carrierCode),
      ),
    })),
  setUnderwritingRuleSnapshot: (snapshot) =>
    set(() => ({
      underwritingRuleSnapshot: snapshot,
    })),
  setUnderwritingRuleOverride: (override) =>
    set((state) => ({
      underwritingRuleOverrides: [
        ...state.underwritingRuleOverrides.filter(
          (item) =>
            item.ruleId !== override.ruleId ||
            (item.extractionBlockId || "") !== (override.extractionBlockId || ""),
        ),
        override,
      ].sort(
        (left, right) =>
          left.ruleId.localeCompare(right.ruleId) ||
          (left.extractionBlockId || "").localeCompare(right.extractionBlockId || ""),
      ),
    })),
  setUnderwritingRuleDecision: (decision) =>
    set((state) => ({
      underwritingRuleDecisions: [
        ...state.underwritingRuleDecisions.filter(
          (item) => item.decisionId !== decision.decisionId,
        ),
        decision,
      ].sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    })),
  setSelectedUnderwritingRuleVersion: (versionId) =>
    set(() => ({
      selectedUnderwritingRuleVersion: versionId,
    })),
  setRiskFactorSnapshot: (snapshot) =>
    set(() => ({
      riskFactorSnapshot: snapshot,
    })),
  setRiskFactorOverride: (override) =>
    set((state) => ({
      riskFactorOverrides: [
        ...state.riskFactorOverrides.filter((item) => item.signalId !== override.signalId),
        override,
      ].sort((left, right) => left.signalId.localeCompare(right.signalId)),
    })),
  setRiskScoringSnapshot: (snapshot) =>
    set(() => ({
      riskScoringSnapshot: snapshot,
    })),
  setUnderwritingDecisionSnapshot: (snapshot) =>
    set(() => ({
      underwritingDecisionSnapshot: snapshot,
    })),
  setUnderwritingDecisionOverride: (override) =>
    set((state) => ({
      underwritingDecisionOverrides: [
        ...state.underwritingDecisionOverrides.filter(
          (item) => item.decisionId !== override.decisionId,
        ),
        override,
      ].sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    })),
  setUnderwritingDecisionGovernanceDecision: (decision) =>
    set((state) => ({
      underwritingDecisionDecisions: [
        ...state.underwritingDecisionDecisions.filter(
          (item) => item.decisionId !== decision.decisionId,
        ),
        decision,
      ].sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    })),
  setUnderwritingDecisionDrift: (drift) =>
    set(() => ({
      underwritingDecisionDrift: drift,
    })),
  setSelectedUnderwritingDecisionVersion: (versionId) =>
    set(() => ({
      selectedUnderwritingDecisionVersion: versionId,
    })),
  setSubmissionPackage: (submissionPackage) =>
    set(() => ({
      submissionPackage,
    })),
  setSubmissionOverride: (override) =>
    set((state) => ({
      submissionOverrides: [
        ...state.submissionOverrides.filter((item) => item.overrideId !== override.overrideId),
        override,
      ].sort((left, right) => left.overrideId.localeCompare(right.overrideId)),
    })),
  setSubmissionStatus: (submissionStatus) =>
    set(() => ({
      submissionStatus,
    })),
  setCarrierSubmissionResponse: (response) =>
    set(() => ({
      carrierSubmissionResponse: response,
    })),
  setSubmissionDrift: (drift) =>
    set(() => ({
      submissionDrift: drift,
    })),
  setSelectedSubmissionVersion: (versionId) =>
    set(() => ({
      selectedSubmissionVersion: versionId,
    })),
  syncDesignerFields: (fields) =>
    set((state) => {
      const designerFieldSnapshot = Object.fromEntries(
        fields.map((field) => [
          field.id,
          {
            id: field.id,
            type: field.type,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
            pageIndex: field.pageIndex ?? null,
            metadata: field.metadata,
          },
        ]),
      );

      const nextMappings = { ...state.mappings };
      const nextOverrides = { ...state.overrides };

      for (const field of fields) {
        const extractionBlockId = field.metadata?.extractionBlockId;
        if (!extractionBlockId) {
          continue;
        }

        const record = nextMappings[extractionBlockId];
        if (record && record.fieldId !== field.id) {
          nextMappings[extractionBlockId] = {
            ...record,
            fieldId: field.id,
          };
        }

        const chosenCandidate =
          record?.mapping.chosen ||
          record?.mapping.suggestions.find(
            (candidate) => candidate.acordCode === field.metadata?.acordCode,
          );

        const metadata = field.metadata;
        const differsFromChosen =
          Boolean(metadata?.acordCode) &&
          (!!chosenCandidate
            ? chosenCandidate.acordCode !== metadata?.acordCode ||
              chosenCandidate.label !== (metadata?.acordLabel || "")
            : true);

        if (metadata && differsFromChosen) {
          nextOverrides[field.id] = {
            fieldId: field.id,
            extractionBlockId,
            acordCode: metadata.acordCode,
            acordLabel: metadata.acordLabel,
            acordDescription: metadata.acordDescription,
            source: metadata.source,
            confidenceScore: metadata.confidenceScore,
          };
        }
      }

      return {
        designerFieldSnapshot,
        mappings: nextMappings,
        overrides: nextOverrides,
      };
    }),
  acceptCalibrationSuggestion: (suggestion) =>
    set((state) => {
      const existingFamily = state.calibrationProfile.familyOverrides[suggestion.familyId];
      const nextFamily = {
        familyId: suggestion.familyId,
        thresholds: existingFamily?.thresholds,
        signalWeights: {
          ...(existingFamily?.signalWeights || {}),
          ...(suggestion.proposedSignalWeights || {}),
        },
        codeThresholdOverrides: {
          ...(existingFamily?.codeThresholdOverrides || {}),
          ...(suggestion.acordCode && suggestion.proposedThresholds
            ? { [suggestion.acordCode]: suggestion.proposedThresholds }
            : {}),
        },
        updatedAt: new Date().toISOString(),
        reason: suggestion.reason,
      };
      const nextVersion = state.calibrationProfile.version + 1;
      return {
        calibrationProfile: {
          ...state.calibrationProfile,
          version: nextVersion,
          updatedAt: nextFamily.updatedAt,
          familyOverrides: {
            ...state.calibrationProfile.familyOverrides,
            [suggestion.familyId]: nextFamily,
          },
          suggestedOverrides: state.calibrationProfile.suggestedOverrides.filter(
            (item) => item.suggestionId !== suggestion.suggestionId,
          ),
          auditTrail: [
            ...state.calibrationProfile.auditTrail,
            {
              version: nextVersion,
              changedAt: nextFamily.updatedAt,
              reason: "accepted-family-suggestion",
              summary: `${suggestion.familyId}:${suggestion.acordCode || suggestion.kind}`,
            },
          ],
        },
      };
    }),
  loadCalibrationProfile: async (profileId) => {
    const response = await fetchJson<{ profile: CalibrationProfile }>(
      `${apiUrl("/api/loadCalibrationProfile")}?profileId=${encodeURIComponent(
        profileId || get().calibrationProfile.profileId,
      )}`,
      {
        method: "GET",
      },
    );
    get().setCalibrationProfile(response.profile);
    return response.profile;
  },
  saveCalibrationProfile: async (options) => {
    const profile = get().calibrationProfile;
    const response = await fetchJson<{ profile: CalibrationProfile }>(
      apiUrl("/api/saveCalibrationProfile"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profile,
          changedBy: options?.changedBy,
          reason: options?.reason,
          summary: options?.summary,
        }),
      },
    );
    get().setCalibrationProfile(response.profile);
    return response.profile;
  },
  clear: () =>
    set({
      documentId: undefined,
      mappings: {},
      decisionGraph: createEmptyDecisionGraph(),
      calibrationProfile: DEFAULT_CALIBRATION_PROFILE,
      formFamily: undefined,
      overrides: {},
      associationEdits: [],
      schemaArtifacts: [],
      semanticConflicts: [],
      conflictOverrides: [],
      fusionOverrides: [],
      semanticFusionSnapshot: undefined,
      semanticMemorySnapshot: undefined,
      semanticMemoryDecisions: [],
      selectedSemanticMemoryVersion: undefined,
      globalSemanticGraphSnapshot: undefined,
      globalSemanticGraphEdgeOverrides: [],
      globalSemanticGraphMergeDecisions: [],
      selectedGlobalSemanticGraphVersion: undefined,
      carrierAdapterSnapshot: undefined,
      carrierAdapterOverrides: [],
      underwritingRuleSnapshot: undefined,
      underwritingRuleOverrides: [],
      underwritingRuleDecisions: [],
      selectedUnderwritingRuleVersion: undefined,
      riskFactorSnapshot: undefined,
      riskFactorOverrides: [],
      riskScoringSnapshot: undefined,
      underwritingDecisionSnapshot: undefined,
      underwritingDecisionOverrides: [],
      underwritingDecisionDecisions: [],
      underwritingDecisionDrift: undefined,
      selectedUnderwritingDecisionVersion: undefined,
      submissionPackage: undefined,
      submissionOverrides: [],
      submissionStatus: undefined,
      carrierSubmissionResponse: undefined,
      submissionDrift: undefined,
      selectedSubmissionVersion: undefined,
      designerFieldSnapshot: {},
      lastSavedBlobName: undefined,
    }),
}));

// Auto-sync: whenever designer fields array changes, propagate field
// associations and overrides into the mapping store immediately.
useDesignerStore.subscribe((next, prev) => {
  if (next.fields !== prev.fields) {
    useMappingStore.getState().syncDesignerFields(next.fields);
  }
});

export function useSelectedFieldMapping() {
  const selectedField = useSelectedField();
  const mappings = useMappingStore((state) => state.mappings);
  const decisionGraph = useMappingStore((state) => state.decisionGraph);
  const overrides = useMappingStore((state) => state.overrides);
  const documentId = useMappingStore((state) => state.documentId);
  const associationEdits = useMappingStore((state) => state.associationEdits);
  const extractionDecisionGraph = useExtractionStore((state) => state.decisionGraph);
  const labels = useExtractionStore((state) => state.labels);
  const textBlocks = useExtractionStore((state) => state.textBlocks);

  return useMemo(() => {
    if (!selectedField) {
      return null;
    }

    const extractionBlockId = selectedField.metadata?.extractionBlockId;
    const record = extractionBlockId ? mappings[extractionBlockId] : undefined;
    const mappingNode = extractionBlockId
      ? decisionGraph.mappings[extractionBlockId]
      : undefined;
    const fieldNode = extractionDecisionGraph.fields[selectedField.id];
    const labelNode = extractionBlockId
      ? extractionDecisionGraph.labels[extractionBlockId]
      : undefined;
    const override =
      overrides[selectedField.id] ||
      (extractionBlockId ? overrides[extractionBlockId] : undefined);
    const wave9Decision = record?.mapping.wave9Decision || undefined;
    const chosenCode =
      wave9Decision?.acordCode ||
      mappingNode?.chosenCandidateCode ||
      record?.mapping.chosen?.acordCode ||
      override?.acordCode ||
      selectedField.metadata?.acordCode ||
      "";
    const chosenCandidate =
      record?.mapping.suggestions.find((candidate) => candidate.acordCode === chosenCode) ||
      record?.mapping.chosen;
    const wave9ConfidenceScore =
      typeof wave9Decision?.confidenceScore === "number"
        ? wave9Decision.confidenceScore
        : undefined;
    const wave9FieldType = wave9Decision?.fieldType || record?.mapping.wave9FieldType;
    const wave9Suppression = wave9Decision?.suppression || record?.mapping.wave9Suppression;
    const wave9GeometryContext =
      wave9Decision?.geometryContext || record?.mapping.wave9GeometryContext;
    const wave9ConsistencyScore =
      typeof wave9Decision?.consistencyScore === "number"
        ? wave9Decision.consistencyScore
        : record?.mapping.wave9ConsistencyScore;
    const wave9ConfidenceCalibration =
      wave9Decision?.confidenceCalibration || record?.mapping.wave9ConfidenceCalibration;
    const candidates = record?.mapping.suggestions || [];
    const rationale = mappingNode?.rationale || record?.mapping.rationale;
    const confidenceScore =
      wave9ConfidenceScore ??
      chosenCandidate?.confidenceScore ??
      override?.confidenceScore ??
      selectedField.metadata?.confidenceScore ??
      0;
    const source =
      override?.source ||
      (chosenCandidate ? toFieldMetadataSource(chosenCandidate.source) : undefined) ||
      selectedField.metadata?.source ||
      "manual";
    const details = [
      `Field type: ${selectedField.metadata?.fieldType ?? selectedField.type}`,
      wave9FieldType ? `Wave-9 field type: ${wave9FieldType}` : undefined,
      typeof wave9ConsistencyScore === "number"
        ? `Wave-9 consistency score: ${wave9ConsistencyScore.toFixed(3)}`
        : undefined,
      wave9Suppression
        ? `Wave-9 suppression: ${wave9Suppression.suppressed ? "suppressed" : "active"}`
        : undefined,
      wave9GeometryContext?.wave9PredictedRole || wave9GeometryContext?.sectionRoleContext
        ? `Wave-9 role: ${wave9GeometryContext.wave9PredictedRole || wave9GeometryContext.sectionRoleContext}`
        : undefined,
      chosenCandidate?.description || selectedField.metadata?.acordDescription || "No ACORD description recorded yet.",
      wave9Decision?.label ? `Wave-9 label: ${wave9Decision.label}` : undefined,
      wave9ConfidenceCalibration?.decision
        ? `Wave-9 calibration: ${wave9ConfidenceCalibration.decision}`
        : undefined,
      rationale?.summary || "No mapping rationale is available yet.",
    ].filter((item): item is string => Boolean(item));
    const associationCandidates = Object.values(mappings)
      .map((item) => {
        const label = labels.find((entry) => entry.blockId === item.extractionBlockId);
        const block = textBlocks.find((entry) => entry.id === item.extractionBlockId);
        const node = decisionGraph.mappings[item.extractionBlockId];
        return {
          extractionBlockId: item.extractionBlockId,
          labelText: label?.normalizedText || "",
          extractedText: item.mapping.text || block?.text || "",
          page: item.mapping.page || block?.page || 1,
          mappingDecision: node?.decision || "pending",
          evidence: [
            ...(item.mapping.rationale?.contributingLabels || []).slice(0, 2),
            ...(item.mapping.rationale?.semanticEvidence || []).slice(0, 2),
          ],
          linkedToCurrentField: item.fieldId === selectedField.id,
        };
      })
      .sort((left, right) => Number(right.linkedToCurrentField) - Number(left.linkedToCurrentField));
    const associationHistory = associationEdits
      .filter((item) => item.fieldId === selectedField.id)
      .slice(-8)
      .reverse();

    return {
      fieldId: selectedField.id,
      extractionBlockId,
      acordCode: chosenCandidate?.acordCode || override?.acordCode || selectedField.metadata?.acordCode || "",
      acordLabel: chosenCandidate?.label || override?.acordLabel || selectedField.metadata?.acordLabel || "",
      confidenceScore,
      source,
      wave9Decision,
      wave9FieldType,
      wave9Suppression,
      wave9GeometryContext,
      wave9ConsistencyScore,
      wave9ConfidenceCalibration,
      summary:
        chosenCandidate || override?.acordCode || wave9Decision?.acordCode
          ? `Mapped to ${wave9Decision?.acordCode || chosenCandidate?.acordCode || override?.acordCode}${wave9Decision?.label || chosenCandidate?.label || override?.acordLabel ? ` (${wave9Decision?.label || chosenCandidate?.label || override?.acordLabel})` : ""}.`
          : "No ACORD label has been committed to this field.",
      details,
      fieldDecision: fieldNode?.decision || "pending",
      labelDecision: labelNode?.decision || "pending",
      mappingDecision: mappingNode?.decision || "pending",
      candidateDecisions: mappingNode?.candidateDecisions || {},
      thresholds:
        rationale?.confidenceThresholds ||
        decisionGraph.confidenceThresholds ||
        extractionDecisionGraph.confidenceThresholds,
      rationale,
      candidates,
      chosenCandidate,
      associationCandidates,
      associationHistory,
      overrideApplied: Boolean(override),
      documentId,
      record,
    };
  }, [
    associationEdits,
    decisionGraph,
    documentId,
    extractionDecisionGraph,
    labels,
    mappings,
    overrides,
    selectedField,
    textBlocks,
  ]);
}