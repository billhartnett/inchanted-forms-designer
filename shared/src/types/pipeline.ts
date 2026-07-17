import type {
  AcordOntologyBundleMetadata,
  SemanticMemoryDecision,
  SemanticMemorySnapshot,
  GlobalSemanticGraphEdgeOverride,
  GlobalSemanticGraphMergeDecision,
  GlobalSemanticGraphSnapshot,
  CarrierAdapterOverride,
  CarrierAdapterSnapshot,
  RiskFactorOverride,
  RiskFactorSnapshot,
  RiskScoringSnapshot,
  UnderwritingDecisionDrift,
  UnderwritingDecisionGovernanceDecision,
  UnderwritingDecisionOverride,
  UnderwritingDecisionSnapshot,
  UnderwritingRuleDecision,
  UnderwritingRuleOverride,
  UnderwritingRuleSnapshot,
  SubmissionPackage,
  SubmissionOverride,
  SubmissionStatusSnapshot,
  CarrierSubmissionResponse,
  SubmissionDrift,
  ImmutableAuditEvent,
  TenantPolicyGate,
  ConflictOverride,
  FusionOverride,
  SemanticConflictRecord,
  AcordOntologyMetadata,
  AcordDictionaryEntry,
  AcordLabelCandidate,
  AcordMappingRationale,
} from "../acord/acordTypes";

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PolygonPoint = {
  x: number;
  y: number;
};

export type PageImage = {
  pageIndex: number;
  width: number;
  height: number;
  src?: string;
};

export type PageExtraction = {
  pageNumber: number;
  width?: number;
  height?: number;
  unit?: string;
  lines: ExtractedLine[];
};

export type ExtractedLine = {
  content: string;
  confidence?: number;
  polygon?: PolygonPoint[];
  boundingBox?: BoundingBox;
};

export type ExtractedBlockType =
  | "text"
  | "checkbox"
  | "radio"
  | "signature"
  | "table"
  | "kvp";

export type ExtractedBlock = {
  id: string;
  page: number;
  type: ExtractedBlockType;
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
};

export type LabelDetection = {
  blockId: string;
  normalizedText: string;
  isLabel: boolean;
  cues: string[];
  rejectedReason?: string;
};

export type SemanticFieldType =
  | "text"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "date"
  | "numeric"
  | "signature";

export type FieldMetadataSource = "manual" | "ai" | "ocr";

export type CheckboxState = {
  isCheckbox: boolean;
  checked?: boolean;
  pattern?: string;
};

export type SignatureState = {
  isSignature: boolean;
  signed?: boolean;
  pattern?: string;
};

export type KvpFieldData = {
  key: string;
  value: string;
};

export type AcordCandidateMetadata = {
  acordCode: string;
  label: string;
  confidenceScore: number;
  source: "dictionary" | "heuristic" | "embeddings" | "geometry" | "category" | "fusion";
  rationale?: string;
};

export type StructuralDeltaMetadata = {
  deltaVersion: string;
  baselineDocumentId?: string;
  changeType?: "added" | "removed" | "modified";
  changeReason?: string;
};

export type FieldMetadata = {
  acordCode: string;
  acordLabel: string;
  acordDescription: string;
  fieldType: SemanticFieldType;
  required: boolean;
  confidenceScore: number;
  source: FieldMetadataSource;
  extractionBlockId?: string;
  semanticLabel?: string;
  tooltip?: string;
  locked?: boolean;
  hidden?: boolean;
  checkboxState?: CheckboxState;
  signatureState?: SignatureState;
  kvpData?: KvpFieldData;
  categoryMode?: string;
  acordCandidates?: AcordCandidateMetadata[];
  structuralDelta?: StructuralDeltaMetadata;
  wave8?: any;
};

export type ReviewDecision = "pending" | "accepted" | "rejected";

export type ReviewConfidenceThresholds = {
  accepted: number;
  review: number;
  rejected: number;
};

export type CalibrationSignalWeights = {
  embedding: number;
  lexical: number;
  dictionary: number;
  heuristic: number;
};

export type CalibrationAuditEntry = {
  version: number;
  changedAt: string;
  changedBy?: string;
  reason?: string;
  summary?: string;
};

export type FamilyCalibrationOverride = {
  familyId: string;
  thresholds?: Partial<ReviewConfidenceThresholds>;
  signalWeights?: Partial<CalibrationSignalWeights>;
  codeThresholdOverrides?: Record<string, ReviewConfidenceThresholds>;
  updatedAt: string;
  updatedBy?: string;
  reason?: string;
};

export type CalibrationLineageEntry = {
  scope: "global" | "family" | "code";
  sourceId: string;
  property: string;
  value: number;
};

export type CalibrationOverrideSuggestion = {
  suggestionId: string;
  familyId: string;
  acordCode?: string;
  kind: "threshold" | "signal-weight";
  reason: string;
  confidence: number;
  proposedThresholds?: ReviewConfidenceThresholds;
  proposedSignalWeights?: Partial<CalibrationSignalWeights>;
};

export type FormFamilyMetadata = {
  familyId: string;
  familyLabel: string;
  confidence: number;
  signatureHash: string;
  layoutSignature: number[];
  semanticSignature: number[];
  evidence: string[];
  classifiedAt: string;
  classifierVersion: string;
};

export type CalibrationProfile = {
  profileId: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  notes?: string;
  globalThresholds: ReviewConfidenceThresholds;
  codeThresholdOverrides: Record<string, ReviewConfidenceThresholds>;
  signalWeights: CalibrationSignalWeights;
  familyOverrides: Record<string, FamilyCalibrationOverride>;
  lineage: CalibrationLineageEntry[];
  suggestedOverrides: CalibrationOverrideSuggestion[];
  auditTrail: CalibrationAuditEntry[];
};

export type ReviewArtifactNode = {
  artifactId: string;
  decision: ReviewDecision;
  linkedArtifactIds: string[];
  note?: string;
};

export type MappingDecisionNode = {
  artifactId: string;
  decision: ReviewDecision;
  linkedArtifactIds: string[];
  chosenCandidateCode?: string;
  candidateDecisions: Record<string, ReviewDecision>;
  rationale?: AcordMappingRationale;
};

export type UnifiedDecisionGraph = {
  labels: Record<string, ReviewArtifactNode>;
  fields: Record<string, ReviewArtifactNode>;
  mappings: Record<string, MappingDecisionNode>;
  confidenceThresholds: ReviewConfidenceThresholds;
};

export type RectField = {
  id: string;
  type: "rect";
  pageIndex?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  groupId?: string | null;
  metadata?: FieldMetadata;
};

export type TextField = {
  id: string;
  type: "text";
  pageIndex?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  textAlign: "left" | "center" | "right";
  color: string;
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
  underline?: boolean;
  lineHeight?: number;
  letterSpacing?: number;
  stroke: string;
  strokeWidth: number;
  groupId?: string | null;
  metadata?: FieldMetadata;
};

export type CheckboxField = {
  id: string;
  type: "checkbox";
  pageIndex?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  checked: boolean;
  label: string;
  groupId?: string | null;
  metadata?: FieldMetadata;
};

export type RadioField = {
  id: string;
  type: "radio";
  pageIndex?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  checked: boolean;
  groupName: string;
  label: string;
  groupId?: string | null;
  metadata?: FieldMetadata;
};

export type DropdownField = {
  id: string;
  type: "dropdown";
  pageIndex?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  options: string[];
  selectedOption: string;
  placeholder: string;
  openPreview: boolean;
  groupId?: string | null;
  metadata?: FieldMetadata;
};

export type DateField = {
  id: string;
  type: "date";
  pageIndex?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  dateFormat: string;
  value: string;
  placeholder: string;
  groupId?: string | null;
  metadata?: FieldMetadata;
};

export type NumericField = {
  id: string;
  type: "numeric";
  pageIndex?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
  placeholder: string;
  groupId?: string | null;
  metadata?: FieldMetadata;
};

export type SignatureField = {
  id: string;
  type: "signature";
  pageIndex?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  placeholder: string;
  signed: boolean;
  showStrokePreview: boolean;
  groupId?: string | null;
  metadata?: FieldMetadata;
};

export type Field =
  | RectField
  | TextField
  | CheckboxField
  | RadioField
  | DropdownField
  | DateField
  | NumericField
  | SignatureField;

type WithoutId<T extends { id: string }> = Omit<T, "id">;

export type FieldDraft =
  | WithoutId<RectField>
  | WithoutId<TextField>
  | WithoutId<CheckboxField>
  | WithoutId<RadioField>
  | WithoutId<DropdownField>
  | WithoutId<DateField>
  | WithoutId<NumericField>
  | WithoutId<SignatureField>;

export type SemanticInference = {
  blockId: string;
  fieldType: SemanticFieldType;
  canonicalName: string;
  validationRules: string[];
  rationale: string[];
};

export type TypedField = Field;

export type NormalizedBoundingBox = {
  blockId: string;
  page: number;
  boundingBox: BoundingBox;
};

export type FieldMapping = {
  blockId: string;
  page: number;
  text: string;
  boundingBox: BoundingBox;
  suggestions: AcordLabelCandidate[];
  chosen?: AcordLabelCandidate;
  topCandidate?: AcordLabelCandidate;
  wave9Decision?: {
    acordCode?: string;
    label?: string;
    confidenceScore?: number;
    normalizedConfidenceScore?: number;
    fieldType?: SemanticFieldType;
    role?: string | null;
    familyId?: string | null;
    suppression?: {
      suppressed?: boolean;
      reasons?: string[];
      nonField?: boolean;
      headerBlock?: boolean;
    };
    geometryContext?: {
      sectionRoleContext?: string;
      wave9PredictedRole?: string | null;
      geometryAgreement?: number;
      page?: number;
      x?: number;
      y?: number;
    };
    consistencyScore?: number;
    confidenceCalibration?: {
      decision?: string;
      thresholdReason?: string;
      confidenceLevel?: string | null;
      thresholds?: unknown;
    };
  } | null;
  roleClassifierOutput?: unknown;
  familyOntologyResolverOutput?: unknown;
  wave9Suppression?: {
    suppressed?: boolean;
    reasons?: string[];
  };
  wave9FieldType?: SemanticFieldType;
  wave9GeometryContext?: {
    sectionRoleContext?: string;
    wave9PredictedRole?: string | null;
    geometryAgreement?: number;
    page?: number;
    x?: number;
    y?: number;
  };
  wave9ConsistencyScore?: number;
  wave9ConfidenceCalibration?: {
    decision?: string;
    thresholdReason?: string;
    confidenceLevel?: string | null;
    thresholds?: unknown;
  };
  fieldType?: SemanticFieldType;
  semanticLabel?: string;
  fallbackReason?: "role_context_reject";
  rationale?: AcordMappingRationale;
};

export type MappingResult = {
  documentId?: string;
  mappings: FieldMapping[];
};

export type ExtractionResult = {
  documentId?: string;
  pages: PageExtraction[];
  blocks: ExtractedBlock[];
};

export type ExtractionArtifacts = {
  documentId?: string;
  pages: PageExtraction[];
  labels: LabelDetection[];
  fields: Field[];
  textBlocks: ExtractedBlock[];
  normalizedBBoxes: NormalizedBoundingBox[];
};

export type MappingOverride = {
  fieldId: string;
  extractionBlockId?: string;
  acordCode: string;
  acordLabel: string;
  acordDescription?: string;
  rationale?: string;
  source: FieldMetadataSource;
  confidenceScore: number;
};

export type MappingReviewRecord = {
  extractionBlockId: string;
  fieldId?: string;
  mapping: FieldMapping;
};

export type AssociationEdit = {
  fieldId: string;
  previousExtractionBlockId?: string;
  nextExtractionBlockId?: string;
  changedAt: string;
  reason?: string;
};

export type SchemaArtifactKind = "ui" | "json" | "xml" | "ontology";

export type SchemaArtifactMetadata = {
  kind: SchemaArtifactKind;
  generatedAt: string;
  hash: string;
  includedMappings: number;
  fileName?: string;
};

export type MappingPersistencePayload = {
  version: 1;
  tenantId?: string;
  tenantEnvironment?: "dev" | "staging" | "prod";
  documentId?: string;
  pages: PageExtraction[];
  fields: Field[];
  mappings: MappingReviewRecord[];
  decisionGraph: UnifiedDecisionGraph;
  overrides: Record<string, MappingOverride>;
  suppressedOcrBlockIds: string[];
  associationEdits: AssociationEdit[];
  schemaArtifacts: SchemaArtifactMetadata[];
  calibrationProfile?: CalibrationProfile;
  formFamily?: FormFamilyMetadata;
  ontologyAlignment?: AcordOntologyMetadata;
  ontologyBundles?: AcordOntologyBundleMetadata[];
  semanticConflicts?: SemanticConflictRecord[];
  conflictOverrides?: ConflictOverride[];
  fusionOverrides?: FusionOverride[];
  semanticFusionSnapshot?: {
    generatedAt: string;
    profileHash: string;
    unificationHash: string;
    conflictHash: string;
  };
  semanticMemorySnapshot?: SemanticMemorySnapshot;
  semanticMemoryDecisions?: SemanticMemoryDecision[];
  selectedSemanticMemoryVersion?: string;
  globalSemanticGraphSnapshot?: GlobalSemanticGraphSnapshot;
  globalSemanticGraphEdgeOverrides?: GlobalSemanticGraphEdgeOverride[];
  globalSemanticGraphMergeDecisions?: GlobalSemanticGraphMergeDecision[];
  selectedGlobalSemanticGraphVersion?: string;
  carrierAdapterSnapshot?: CarrierAdapterSnapshot;
  carrierAdapterOverrides?: CarrierAdapterOverride[];
  underwritingRuleSnapshot?: UnderwritingRuleSnapshot;
  underwritingRuleOverrides?: UnderwritingRuleOverride[];
  underwritingRuleDecisions?: UnderwritingRuleDecision[];
  selectedUnderwritingRuleVersion?: string;
  riskFactorSnapshot?: RiskFactorSnapshot;
  riskFactorOverrides?: RiskFactorOverride[];
  riskScoringSnapshot?: RiskScoringSnapshot;
  underwritingDecisionSnapshot?: UnderwritingDecisionSnapshot;
  underwritingDecisionOverrides?: UnderwritingDecisionOverride[];
  underwritingDecisionDecisions?: UnderwritingDecisionGovernanceDecision[];
  underwritingDecisionDrift?: UnderwritingDecisionDrift;
  selectedUnderwritingDecisionVersion?: string;
  submissionPackage?: SubmissionPackage;
  submissionOverrides?: SubmissionOverride[];
  submissionStatus?: SubmissionStatusSnapshot;
  carrierSubmissionResponse?: CarrierSubmissionResponse;
  submissionDrift?: SubmissionDrift;
  selectedSubmissionVersion?: string;
  submissionHistory?: SubmissionStatusSnapshot[];
  idempotencyKey?: string;
  tenantPolicyGates?: TenantPolicyGate[];
  auditTrail?: ImmutableAuditEvent[];
};

export type MappingDictionary = {
  entries: AcordDictionaryEntry[];
};