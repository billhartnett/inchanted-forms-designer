export type AcordDataType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "currency"
  | "unknown";

export type AcordDictionaryEntry = {
  acordCode: string;
  label: string;
  description: string;
  dataType: AcordDataType | string;
  lob: string;
  version: string;
  keywords: string[];
};

export type AcordOntologyNode = {
  acordCode: string;
  aliases: string[];
  synonyms: string[];
  parentCodes: string[];
  childCodes: string[];
  mutuallyExclusiveCodes: string[];
  requiredSiblingCodes: string[];
  sections: string[];
  groups: string[];
};

export type AcordOntologyDefinition = {
  ontologyId: string;
  version: string;
  generatedAt: string;
  hash: string;
  nodes: Record<string, AcordOntologyNode>;
};

export type AcordOntologySelectionIssue = {
  type: "parent-missing" | "mutually-exclusive" | "required-sibling-missing";
  acordCode: string;
  relatedCode?: string;
  message: string;
};

export type AcordOntologySelectionValidation = {
  valid: boolean;
  issues: AcordOntologySelectionIssue[];
};

export type AcordOntologyMetadata = {
  ontologyId: string;
  ontologyVersion: string;
  ontologyHash: string;
  ontologyNamespace?: string;
  bundleId?: string;
  alignedAt: string;
  migrationNotes: string[];
};

export type OntologyNamespace = "acord-core" | "carrier-supplemental" | "internal-extended";

export type AcordOntologyBundleMetadata = {
  bundleId: string;
  namespace: OntologyNamespace;
  version: string;
  signature: string;
  compatibility: string[];
  precedence: number;
  generatedAt: string;
};

export type AcordOntologyBundle = {
  metadata: AcordOntologyBundleMetadata;
  ontology: AcordOntologyDefinition;
};

export type OntologyArbitrationDecision = {
  acordCode: string;
  winningNamespace: OntologyNamespace;
  overriddenNamespaces: OntologyNamespace[];
  reason: string;
  score: number;
};

export type SemanticConflictClass =
  | "candidate-contradiction"
  | "rationale-disagreement"
  | "ontology-violation"
  | "document-context-mismatch"
  | "cross-ontology-disagreement";

export type SemanticConflictRecord = {
  conflictId: string;
  class: SemanticConflictClass;
  extractionBlockIds: string[];
  candidateCodes: string[];
  severity: "low" | "medium" | "high";
  resolved: boolean;
  resolutionCode?: string;
  rationale: string;
  lineage: string[];
};

export type ConflictOverride = {
  conflictId: string;
  extractionBlockId: string;
  forcedAcordCode: string;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type CrossFormUnificationClass =
  | "acord-125-to-126"
  | "acord-126-to-127"
  | "acord-140-commercial-lines";

export type CrossFormUnificationEdge = {
  sourceCode: string;
  targetCode: string;
  relationship: "equivalent" | "broader" | "narrower";
  unificationClass: CrossFormUnificationClass;
};

export type CandidateUnificationMetadata = {
  groupId: string;
  canonicalCode: string;
  equivalentCodes: string[];
  lineage: string[];
};

export type FusionOverride = {
  groupId: string;
  forcedAcordCode: string;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type SemanticMemoryDecisionAction = "accept" | "pin" | "rollback";

export type SemanticMemoryDecision = {
  decisionId: string;
  action: SemanticMemoryDecisionAction;
  targetVersionId?: string;
  groupId?: string;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type SemanticMemoryEntry = {
  groupId: string;
  canonicalCode: string;
  equivalentCodes: string[];
  representativeCode: string;
  occurrenceCount: number;
  confidenceHistory: number[];
  rationaleHistory: {
    embedding: number;
    lexical: number;
    dictionary: number;
    heuristic: number;
  }[];
  families: string[];
  ontologyNamespaces: string[];
  conflictRecurrence: number;
  lastSeenAt: string;
  stabilityScore: number;
  lineage: string[];
};

export type SemanticMemorySnapshot = {
  generatedAt: string;
  versionId: string;
  memoryHash: string;
  sourceProfileHash: string;
  sourceUnificationHash: string;
  sourceConflictHash: string;
  pinnedVersionId?: string;
  entries: SemanticMemoryEntry[];
  lineage: string[];
};

export type SemanticMemoryRecommendation = {
  recommendationId: string;
  groupId: string;
  recommendedCode: string;
  confidence: number;
  priority: "low" | "medium" | "high";
  reason: string;
  basedOnVersionId: string;
  lineage: string[];
};

export type GlobalSemanticGraphNodeType =
  | "acord-ontology"
  | "carrier-ontology"
  | "fused-profile"
  | "unification-group"
  | "memory-cluster";

export type GlobalSemanticGraphEdgeType =
  | "equivalence"
  | "parent-child"
  | "sibling-required"
  | "mutually-exclusive"
  | "cross-form-unification"
  | "cross-ontology-harmonization";

export type GlobalSemanticGraphNode = {
  nodeId: string;
  nodeType: GlobalSemanticGraphNodeType;
  code: string;
  namespace: string;
  sourceId: string;
  confidence: number;
  lineage: string[];
};

export type GlobalSemanticGraphEdge = {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: GlobalSemanticGraphEdgeType;
  weight: number;
  lineage: string[];
};

export type GlobalSemanticGraphEdgeOverride = {
  edgeId?: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: GlobalSemanticGraphEdgeType;
  weight: number;
  active: boolean;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type GlobalSemanticGraphMergeDecision = {
  decisionId: string;
  action: "accept-merge" | "pin-version" | "rollback-version";
  targetVersionId?: string;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type GlobalSemanticGraphSnapshot = {
  generatedAt: string;
  versionId: string;
  graphHash: string;
  harmonizationHash: string;
  nodeCount: number;
  edgeCount: number;
  nodes: GlobalSemanticGraphNode[];
  edges: GlobalSemanticGraphEdge[];
  pinnedVersionId?: string;
  lineage: string[];
};

export type CandidateGraphInferenceMetadata = {
  inferred: boolean;
  confidence: number;
  evidence: string[];
  recommendedCodes: string[];
  lineage: string[];
};

export type CarrierAdapterNode = {
  carrierCode: string;
  label: string;
  aliases: string[];
  synonyms: string[];
  constraints: string[];
  equivalentAcordCodes: string[];
  equivalentUnificationGroups: string[];
};

export type CarrierAdapterBundle = {
  carrierId: string;
  carrierLabel: string;
  namespace: string;
  version: string;
  precedence: number;
  compatibility: string[];
  nodes: CarrierAdapterNode[];
  signature: string;
  generatedAt: string;
};

export type CarrierAdapterOverride = {
  carrierId: string;
  carrierCode: string;
  forcedAcordCode: string;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type CarrierAdapterSnapshot = {
  generatedAt: string;
  versionId: string;
  adapterHash: string;
  carrierIds: string[];
  mappingCount: number;
  lineage: string[];
};

export type CandidateCarrierAdapterMetadata = {
  carrierId: string;
  carrierCode: string;
  mappedAcordCode: string;
  confidence: number;
  constraints: string[];
  lineage: string[];
};

export type UnderwritingRuleSeverity = "info" | "warning" | "blocker";

export type UnderwritingRuleEvaluation = {
  ruleId: string;
  carrierId: string;
  severity: UnderwritingRuleSeverity;
  passed: boolean;
  scoreImpact: number;
  message: string;
  lineage: string[];
};

export type UnderwritingRuleOverride = {
  ruleId: string;
  extractionBlockId?: string;
  forcedPass: boolean;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type UnderwritingRuleDecision = {
  decisionId: string;
  action: "accept" | "pin" | "rollback";
  targetVersionId?: string;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type UnderwritingRuleSnapshot = {
  generatedAt: string;
  versionId: string;
  rulesHash: string;
  outcomeHash: string;
  conflictCount: number;
  blockerCount: number;
  lineage: string[];
};

export type UnderwritingRuleDrift = {
  hasDrift: boolean;
  driftHash: string;
  differences: Array<{
    key: string;
    baselineValue: string | number | null;
    currentValue: string | number | null;
  }>;
};

export type CandidateUnderwritingRuleMetadata = {
  scoreDelta: number;
  hardFailures: string[];
  evaluations: UnderwritingRuleEvaluation[];
  lineage: string[];
};

export type RiskFactorCategory =
  | "exposure"
  | "hazard"
  | "applicant"
  | "operations"
  | "loss-history"
  | "supplemental";

export type RiskFactorSignal = {
  signalId: string;
  extractionBlockId: string;
  category: RiskFactorCategory;
  code: string;
  label: string;
  severity: number;
  confidence: number;
  carrierModifier: number;
  lineage: string[];
};

export type RiskFactorOverride = {
  signalId: string;
  forcedSeverity: number;
  active: boolean;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type RiskFactorSnapshot = {
  generatedAt: string;
  versionId: string;
  riskFactorHash: string;
  signalCount: number;
  categoryCounts: Record<RiskFactorCategory, number>;
  lineage: string[];
};

export type RiskScoringBreakdown = {
  exposureSeverity: number;
  hazardSeverity: number;
  submissionCompleteness: number;
  carrierModifierScore: number;
  weightedScore: number;
  classification: "low" | "medium" | "high";
  carrierClass: string;
  lineage: string[];
};

export type RiskScoringSnapshot = {
  generatedAt: string;
  versionId: string;
  scoringHash: string;
  weightedScore: number;
  classification: "low" | "medium" | "high";
  carrierClass: string;
  lineage: string[];
};

export type UnderwritingDecisionOutcome =
  | "accept"
  | "accept-with-conditions"
  | "refer-to-underwriter"
  | "decline";

export type UnderwritingDecisionRuleResult = {
  ruleId: string;
  passed: boolean;
  severity: "info" | "warning" | "blocker";
  message: string;
  lineage: string[];
};

export type UnderwritingDecisionReport = {
  decisionId: string;
  outcome: UnderwritingDecisionOutcome;
  conditions: string[];
  reasons: string[];
  firedRules: UnderwritingDecisionRuleResult[];
  rationale: string[];
  lineage: string[];
};

export type UnderwritingDecisionOverride = {
  decisionId: string;
  forcedOutcome: UnderwritingDecisionOutcome;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type UnderwritingDecisionGovernanceDecision = {
  decisionId: string;
  action: "accept" | "pin" | "rollback";
  targetVersionId?: string;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type UnderwritingDecisionSnapshot = {
  generatedAt: string;
  versionId: string;
  decisionHash: string;
  outcome: UnderwritingDecisionOutcome;
  firedRuleCount: number;
  overrideApplied: boolean;
  lineage: string[];
};

export type UnderwritingDecisionDrift = {
  hasDrift: boolean;
  driftHash: string;
  differences: Array<{
    key: string;
    baselineValue: string | number | null;
    currentValue: string | number | null;
  }>;
};

export type SubmissionCarrierPayload = {
  carrierId: string;
  format: "json" | "xml";
  payload: string;
  payloadHash: string;
  schemaVersion: string;
  lineage: string[];
};

export type SubmissionPackage = {
  packageId: string;
  generatedAt: string;
  acordXml: string;
  acordXmlHash: string;
  carrierPayloads: SubmissionCarrierPayload[];
  riskReport: {
    riskFactorHash: string;
    scoringHash: string;
    weightedScore: number;
    classification: "low" | "medium" | "high";
  };
  decisionReport: {
    decisionHash: string;
    outcome: UnderwritingDecisionOutcome;
    firedRuleCount: number;
  };
  semanticLineageBundle?: string[];
  packageHash: string;
  lineage: string[];
};

export type SubmissionStatus = "draft" | "submitted" | "accepted" | "rejected" | "pending" | "error";

export type CarrierSubmissionResponse = {
  submissionId: string;
  carrierId: string;
  status: SubmissionStatus;
  carrierReferenceId?: string;
  message: string;
  responseHash: string;
  normalized: Record<string, string | number | boolean | null>;
  receivedAt: string;
  lineage: string[];
};

export type SubmissionStatusSnapshot = {
  submissionId: string;
  packageId: string;
  carrierId: string;
  status: SubmissionStatus;
  lastUpdatedAt: string;
  attemptCount: number;
  latestResponseHash?: string;
  lineage: string[];
};

export type SubmissionOverride = {
  overrideId: string;
  action: "force-carrier" | "force-submit" | "force-status";
  carrierId?: string;
  forcedStatus?: SubmissionStatus;
  changedAt: string;
  changedBy?: string;
  reason?: string;
};

export type SubmissionDrift = {
  hasDrift: boolean;
  driftHash: string;
  differences: Array<{
    key: string;
    baselineValue: string | number | null;
    currentValue: string | number | null;
  }>;
};

export type TenantPolicyGate = {
  policyId: string;
  scope: "mapping" | "semantic" | "rules" | "submission" | "admin";
  action: string;
  allowedRoles: string[];
  enabled: boolean;
};

export type ImmutableAuditEvent = {
  eventId: string;
  tenantId: string;
  actorId: string;
  actorRole: string;
  domain:
    | "mapping"
    | "semantic-override"
    | "rule-override"
    | "submission-package"
    | "carrier-response"
    | "compliance-export";
  action: string;
  objectId: string;
  hash: string;
  occurredAt: string;
  lineage: string[];
};

export type CandidateRiskFactorMetadata = {
  categories: RiskFactorCategory[];
  exposureSeverity: number;
  hazardSeverity: number;
  completenessContribution: number;
  carrierModifier: number;
  lineage: string[];
};

export type CandidateDecisionIntelligenceMetadata = {
  projectedOutcome: UnderwritingDecisionOutcome;
  projectedScore: number;
  reasons: string[];
  lineage: string[];
};

export type CandidateMemoryRecommendationMetadata = {
  recommendationId: string;
  confidence: number;
  priority: "low" | "medium" | "high";
  reason: string;
  basedOnVersionId: string;
};

export type CandidateNormalizationMetadata = {
  familyId: string;
  familyFactor: number;
  raw: {
    embedding: number;
    lexical: number;
    dictionary: number;
    heuristic: number;
  };
  normalized: {
    embedding: number;
    lexical: number;
    dictionary: number;
    heuristic: number;
  };
};

export type CandidateOntologyMetadata = {
  namespace?: OntologyNamespace;
  parentCodes: string[];
  childCodes: string[];
  mutuallyExclusiveCodes: string[];
  requiredSiblingCodes: string[];
  sections: string[];
  groups: string[];
  explanation: string[];
  warnings: string[];
  violatedConstraints: string[];
};

export type AcordLabel = AcordDictionaryEntry;

export type AcordLabelCandidate = {
  acordCode: string;
  label: string;
  description?: string;
  confidenceScore: number;
  normalizedConfidenceScore?: number;
  source: "ai" | "dictionary" | "heuristic" | "manual";
  rationale?: string;
  lexicalScore?: number;
  semanticSimilarity?: number;
  dictionaryScore?: number;
  heuristicScore?: number;
  normalization?: CandidateNormalizationMetadata;
  ontology?: CandidateOntologyMetadata;
  unification?: CandidateUnificationMetadata;
  arbitration?: {
    winningNamespace: OntologyNamespace;
    precedenceScore: number;
    reason: string;
  };
  memoryRecommendation?: CandidateMemoryRecommendationMetadata;
  graphInference?: CandidateGraphInferenceMetadata;
  carrierAdapter?: CandidateCarrierAdapterMetadata;
  underwritingRules?: CandidateUnderwritingRuleMetadata;
  riskFactors?: CandidateRiskFactorMetadata;
  decisionIntelligence?: CandidateDecisionIntelligenceMetadata;
};

export type AcordMappingRationale = {
  summary: string;
  lexicalEvidence: string[];
  semanticEvidence: string[];
  ontologyEvidence?: string[];
  ontologyWarnings?: string[];
  arbitrationEvidence?: string[];
  unificationEvidence?: string[];
  memoryEvidence?: string[];
  memoryLineage?: string[];
  graphEvidence?: string[];
  graphLineage?: string[];
  carrierAdapterEvidence?: string[];
  carrierAdapterLineage?: string[];
  underwritingRuleEvidence?: string[];
  underwritingRuleLineage?: string[];
  riskFactorEvidence?: string[];
  riskFactorLineage?: string[];
  riskScoringEvidence?: string[];
  riskScoringLineage?: string[];
  underwritingDecisionEvidence?: string[];
  underwritingDecisionLineage?: string[];
  conflictLineage?: string[];
  ambiguityNotes: string[];
  contributingLabels?: string[];
  candidateBreakdown?: AcordLabelCandidate[];
  confidenceThresholds?: {
    accepted: number;
    review: number;
    rejected: number;
  };
};