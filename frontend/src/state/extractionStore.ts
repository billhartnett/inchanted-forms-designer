import { create } from "zustand";
import type {
  ExtractedBlock,
  ExtractionArtifacts,
  Field,
  LabelDetection,
  NormalizedBoundingBox,
  PageExtraction,
  ReviewDecision,
  ReviewConfidenceThresholds,
  UnifiedDecisionGraph,
} from "@shared/types";

const DEFAULT_THRESHOLDS: ReviewConfidenceThresholds = {
  accepted: 0.8,
  review: 0.6,
  rejected: 0.45,
};

function createEmptyDecisionGraph(): UnifiedDecisionGraph {
  return {
    labels: {},
    fields: {},
    mappings: {},
    confidenceThresholds: DEFAULT_THRESHOLDS,
  };
}

function buildDecisionGraph(artifacts: ExtractionArtifacts): UnifiedDecisionGraph {
  return {
    labels: Object.fromEntries(
      artifacts.labels.map((label) => [
        label.blockId,
        {
          artifactId: label.blockId,
          decision: "pending" as ReviewDecision,
          linkedArtifactIds: artifacts.fields
            .filter((field) => field.metadata?.extractionBlockId === label.blockId || field.id === label.blockId)
            .map((field) => field.id),
        },
      ]),
    ),
    fields: Object.fromEntries(
      artifacts.fields.map((field) => {
        const extractionBlockId = field.metadata?.extractionBlockId || field.id;
        return [
          field.id,
          {
            artifactId: field.id,
            decision: "pending" as ReviewDecision,
            linkedArtifactIds: [extractionBlockId],
          },
        ];
      }),
    ),
    mappings: {},
    confidenceThresholds: DEFAULT_THRESHOLDS,
  };
}

type ExtractionStoreState = {
  documentId?: string;
  pages: PageExtraction[];
  labels: LabelDetection[];
  fields: Field[];
  textBlocks: ExtractedBlock[];
  normalizedBBoxes: NormalizedBoundingBox[];
  decisionGraph: UnifiedDecisionGraph;
  suppressedOcrBlockIds: string[];
  highlightedAssociationBlockId: string | null;
  setExtractionArtifacts: (artifacts: ExtractionArtifacts) => void;
  setDecisionGraph: (decisionGraph: UnifiedDecisionGraph) => void;
  acceptLabel: (blockId: string) => void;
  rejectLabel: (blockId: string) => void;
  acceptField: (fieldId: string) => void;
  rejectField: (fieldId: string) => void;
  toggleOcrSuppression: (blockId: string) => void;
  setSuppressedOcrBlockIds: (blockIds: string[]) => void;
  setHighlightedAssociation: (blockId: string | null) => void;
  clearExtraction: () => void;
};

export const useExtractionStore = create<ExtractionStoreState>((set) => ({
  documentId: undefined,
  pages: [],
  labels: [],
  fields: [],
  textBlocks: [],
  normalizedBBoxes: [],
  decisionGraph: createEmptyDecisionGraph(),
  suppressedOcrBlockIds: [],
  highlightedAssociationBlockId: null,
  setExtractionArtifacts: (artifacts) =>
    set({
      documentId: artifacts.documentId,
      pages: artifacts.pages,
      labels: artifacts.labels,
      fields: artifacts.fields,
      textBlocks: artifacts.textBlocks,
      normalizedBBoxes: artifacts.normalizedBBoxes,
      decisionGraph: buildDecisionGraph(artifacts),
      suppressedOcrBlockIds: [],
      highlightedAssociationBlockId: null,
    }),
  setDecisionGraph: (decisionGraph) => set({ decisionGraph }),
  acceptLabel: (blockId) =>
    set((state) => ({
      decisionGraph: {
        ...state.decisionGraph,
        labels: {
          ...state.decisionGraph.labels,
          [blockId]: {
            artifactId: blockId,
            linkedArtifactIds:
              state.decisionGraph.labels[blockId]?.linkedArtifactIds || [],
            decision: "accepted",
          },
        },
      },
    })),
  rejectLabel: (blockId) =>
    set((state) => ({
      decisionGraph: {
        ...state.decisionGraph,
        labels: {
          ...state.decisionGraph.labels,
          [blockId]: {
            artifactId: blockId,
            linkedArtifactIds:
              state.decisionGraph.labels[blockId]?.linkedArtifactIds || [],
            decision: "rejected",
          },
        },
      },
    })),
  acceptField: (fieldId) =>
    set((state) => ({
      decisionGraph: {
        ...state.decisionGraph,
        fields: {
          ...state.decisionGraph.fields,
          [fieldId]: {
            artifactId: fieldId,
            linkedArtifactIds:
              state.decisionGraph.fields[fieldId]?.linkedArtifactIds || [],
            decision: "accepted",
          },
        },
      },
    })),
  rejectField: (fieldId) =>
    set((state) => ({
      decisionGraph: {
        ...state.decisionGraph,
        fields: {
          ...state.decisionGraph.fields,
          [fieldId]: {
            artifactId: fieldId,
            linkedArtifactIds:
              state.decisionGraph.fields[fieldId]?.linkedArtifactIds || [],
            decision: "rejected",
          },
        },
      },
    })),
  toggleOcrSuppression: (blockId) =>
    set((state) => {
      const isSuppressed = state.suppressedOcrBlockIds.includes(blockId);
      return {
        suppressedOcrBlockIds: isSuppressed
          ? state.suppressedOcrBlockIds.filter((id) => id !== blockId)
          : [...state.suppressedOcrBlockIds, blockId],
      };
    }),
  setSuppressedOcrBlockIds: (blockIds) =>
    set({
      suppressedOcrBlockIds: Array.from(new Set(blockIds.filter(Boolean))),
    }),
  setHighlightedAssociation: (blockId) =>
    set({ highlightedAssociationBlockId: blockId }),
  clearExtraction: () =>
    set({
      documentId: undefined,
      pages: [],
      labels: [],
      fields: [],
      textBlocks: [],
      normalizedBBoxes: [],
      decisionGraph: createEmptyDecisionGraph(),
      suppressedOcrBlockIds: [],
      highlightedAssociationBlockId: null,
    }),
}));