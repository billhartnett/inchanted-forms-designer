import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  buildUnifiedAcordXmlFromFusion,
  buildSemanticMemorySnapshot,
  buildGlobalSemanticGraph,
  buildCarrierAdapterSnapshot,
  buildRiskFactorSnapshot,
  buildRiskScoringSnapshot,
  buildUnderwritingDecisionSnapshot,
  buildUnderwritingRuleSnapshot,
  diffAcordXmlSemantics,
  evaluateCarrierAdapterDrift,
  evaluateCarrierAdapterMappings,
  evaluateGlobalSemanticDrift,
  evaluateGraphInference,
  evaluateRiskScoring,
  evaluateUnderwritingDecision,
  evaluateUnderwritingDecisionDrift,
  evaluateSubmissionDrift,
  buildSubmissionPackage,
  evaluateLongitudinalMemoryDrift,
  evaluateSemanticFusion,
  evaluateUnderwritingRuleDrift,
  evaluateUnderwritingRules,
  extractRiskFactors,
  generateSemanticMemoryRecommendations,
  evaluateMultiDocumentConsistency,
  prioritizeConflictRecurrence,
  type MultiDocumentConsistencyReport,
  type XmlSemanticValidationReport,
  validateAcordXmlSemantic,
} from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { buildAcordXmlFromPayload } from "../mapping/acordXml";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";

type ConsistencyDocumentInput = {
  fixtureId: string;
  payload: MappingPersistencePayload;
  xml?: string;
};

type EvaluateAcordSemanticsRequest = {
  fixtureId?: string;
  payload?: MappingPersistencePayload;
  xml?: string;
  baselineValidation?: XmlSemanticValidationReport;
  documents?: ConsistencyDocumentInput[];
  baselineConsistency?: MultiDocumentConsistencyReport;
} & Partial<MappingPersistencePayload>;

export async function evaluateAcordSemanticsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateAcordSemanticsRequest;
    const rawPayload = (body.payload || body) as unknown;
    const validated = validateMappingPersistencePayload(rawPayload);

    if (!validated.valid) {
      const error = "error" in validated ? validated.error : "Invalid mapping payload";
      return {
        status: 400,
        jsonBody: { error },
      };
    }

    const payload = validated.payload;
    const xml =
      body.xml ||
      buildAcordXmlFromPayload(payload, {
        suppressedOcrBlockIds: payload.suppressedOcrBlockIds,
      }).xml;

    const validation = validateAcordXmlSemantic(
      payload,
      xml,
      body.fixtureId || payload.documentId,
    );

    const semanticDiff = body.baselineValidation
      ? diffAcordXmlSemantics(body.baselineValidation, validation)
      : undefined;

    let consistency: MultiDocumentConsistencyReport | undefined;
    let fusion:
      | ReturnType<typeof evaluateSemanticFusion>
      | undefined;
    let unifiedXml:
      | ReturnType<typeof buildUnifiedAcordXmlFromFusion>
      | undefined;
    let semanticMemorySnapshot:
      | MappingPersistencePayload["semanticMemorySnapshot"]
      | undefined;
    let semanticMemoryDrift:
      | ReturnType<typeof evaluateLongitudinalMemoryDrift>
      | undefined;
    let semanticMemoryRecommendations:
      | ReturnType<typeof generateSemanticMemoryRecommendations>
      | undefined;
    let prioritizedConflicts:
      | ReturnType<typeof prioritizeConflictRecurrence>
      | undefined;
    let globalSemanticGraph:
      | ReturnType<typeof buildGlobalSemanticGraph>
      | undefined;
    let globalSemanticDrift:
      | ReturnType<typeof evaluateGlobalSemanticDrift>
      | undefined;
    let graphInference:
      | ReturnType<typeof evaluateGraphInference>
      | undefined;
    let carrierAdapters:
      | ReturnType<typeof evaluateCarrierAdapterMappings>
      | undefined;
    let carrierAdapterSnapshot:
      | ReturnType<typeof buildCarrierAdapterSnapshot>
      | undefined;
    let carrierAdapterDrift:
      | ReturnType<typeof evaluateCarrierAdapterDrift>
      | undefined;
    let underwritingRules:
      | ReturnType<typeof evaluateUnderwritingRules>
      | undefined;
    let underwritingRuleSnapshot:
      | ReturnType<typeof buildUnderwritingRuleSnapshot>
      | undefined;
    let underwritingRuleDrift:
      | ReturnType<typeof evaluateUnderwritingRuleDrift>
      | undefined;
    let riskFactors:
      | ReturnType<typeof extractRiskFactors>
      | undefined;
    let riskFactorSnapshot:
      | ReturnType<typeof buildRiskFactorSnapshot>
      | undefined;
    let riskScoring:
      | ReturnType<typeof evaluateRiskScoring>
      | undefined;
    let riskScoringSnapshot:
      | ReturnType<typeof buildRiskScoringSnapshot>
      | undefined;
    let underwritingDecision:
      | ReturnType<typeof evaluateUnderwritingDecision>
      | undefined;
    let underwritingDecisionSnapshot:
      | ReturnType<typeof buildUnderwritingDecisionSnapshot>
      | undefined;
    let underwritingDecisionDrift:
      | ReturnType<typeof evaluateUnderwritingDecisionDrift>
      | undefined;
    let submissionPackage:
      | ReturnType<typeof buildSubmissionPackage>
      | undefined;
    let submissionDrift:
      | ReturnType<typeof evaluateSubmissionDrift>
      | undefined;
    if (Array.isArray(body.documents) && body.documents.length > 0) {
      const validDocuments = body.documents
        .map((item) => {
          const candidate = validateMappingPersistencePayload(item.payload);
          if (!candidate.valid) {
            return null;
          }
          return {
            fixtureId: item.fixtureId,
            payload: candidate.payload,
          };
        })
        .filter((item): item is { fixtureId: string; payload: MappingPersistencePayload } =>
          Boolean(item),
        );

      if (validDocuments.length > 0) {
        consistency = evaluateMultiDocumentConsistency({
          documents: validDocuments,
        });
        fusion = evaluateSemanticFusion(validDocuments, {
          fusionOverrides: validDocuments.flatMap((item) => item.payload.fusionOverrides || []),
        });
        unifiedXml = buildUnifiedAcordXmlFromFusion(fusion);
        semanticMemorySnapshot = buildSemanticMemorySnapshot(validDocuments, {
          previousSnapshot: validDocuments[0]?.payload.semanticMemorySnapshot,
          decisions: validDocuments.flatMap((item) => item.payload.semanticMemoryDecisions || []),
        });
        semanticMemoryRecommendations = generateSemanticMemoryRecommendations(
          fusion,
          semanticMemorySnapshot,
        );
        prioritizedConflicts = prioritizeConflictRecurrence(fusion, semanticMemorySnapshot);
        semanticMemoryDrift = evaluateLongitudinalMemoryDrift(
          validDocuments[0]?.payload.semanticMemorySnapshot,
          semanticMemorySnapshot,
        );
        globalSemanticGraph = buildGlobalSemanticGraph(validDocuments, {
          previousSnapshot: validDocuments[0]?.payload.globalSemanticGraphSnapshot,
          memorySnapshot: semanticMemorySnapshot,
          edgeOverrides: validDocuments.flatMap(
            (item) => item.payload.globalSemanticGraphEdgeOverrides || [],
          ),
          mergeDecisions: validDocuments.flatMap(
            (item) => item.payload.globalSemanticGraphMergeDecisions || [],
          ),
        });
        globalSemanticDrift = evaluateGlobalSemanticDrift(
          validDocuments[0]?.payload.globalSemanticGraphSnapshot,
          globalSemanticGraph.snapshot,
        );
        graphInference = evaluateGraphInference(
          validDocuments[0]?.payload,
          globalSemanticGraph.snapshot,
        );
        carrierAdapters = evaluateCarrierAdapterMappings(validDocuments[0].payload, {
          familyId: validDocuments[0].payload.formFamily?.familyId,
          overrides: validDocuments[0].payload.carrierAdapterOverrides || [],
        });
        carrierAdapterSnapshot = buildCarrierAdapterSnapshot(validDocuments, {
          previousSnapshot: validDocuments[0]?.payload.carrierAdapterSnapshot,
          overrides: validDocuments.flatMap((item) => item.payload.carrierAdapterOverrides || []),
        });
        carrierAdapterDrift = evaluateCarrierAdapterDrift(
          validDocuments[0]?.payload.carrierAdapterSnapshot,
          carrierAdapterSnapshot,
        );
        underwritingRules = evaluateUnderwritingRules(validDocuments[0].payload, {
          familyId: validDocuments[0].payload.formFamily?.familyId,
          overrides: validDocuments[0].payload.underwritingRuleOverrides || [],
        });
        underwritingRuleSnapshot = buildUnderwritingRuleSnapshot(validDocuments[0].payload, {
          previousSnapshot: validDocuments[0]?.payload.underwritingRuleSnapshot,
          decisions: validDocuments.flatMap((item) => item.payload.underwritingRuleDecisions || []),
          overrides: validDocuments.flatMap((item) => item.payload.underwritingRuleOverrides || []),
        });
        underwritingRuleDrift = evaluateUnderwritingRuleDrift(
          validDocuments[0]?.payload.underwritingRuleSnapshot,
          underwritingRuleSnapshot,
        );
        riskFactors = extractRiskFactors(validDocuments[0].payload, {
          overrides: validDocuments[0].payload.riskFactorOverrides || [],
        });
        riskFactorSnapshot = buildRiskFactorSnapshot(validDocuments[0].payload, {
          previousSnapshot: validDocuments[0]?.payload.riskFactorSnapshot,
          overrides: validDocuments.flatMap((item) => item.payload.riskFactorOverrides || []),
        });
        riskScoring = evaluateRiskScoring(validDocuments[0].payload, {
          signals: riskFactors,
        });
        riskScoringSnapshot = buildRiskScoringSnapshot(validDocuments[0].payload, {
          previousSnapshot: validDocuments[0]?.payload.riskScoringSnapshot,
          signals: riskFactors,
        });
        underwritingDecision = evaluateUnderwritingDecision(validDocuments[0].payload, {
          riskSignals: riskFactors,
          riskScoring,
          overrides: validDocuments[0].payload.underwritingDecisionOverrides || [],
        });
        underwritingDecisionSnapshot = buildUnderwritingDecisionSnapshot(
          validDocuments[0].payload,
          {
            previousSnapshot: validDocuments[0]?.payload.underwritingDecisionSnapshot,
            riskSignals: riskFactors,
            riskScoring,
            overrides: validDocuments.flatMap(
              (item) => item.payload.underwritingDecisionOverrides || [],
            ),
            decisions: validDocuments.flatMap(
              (item) => item.payload.underwritingDecisionDecisions || [],
            ),
          },
        );
        underwritingDecisionDrift = evaluateUnderwritingDecisionDrift(
          {
            riskFactorSnapshot: validDocuments[0]?.payload.riskFactorSnapshot,
            riskScoringSnapshot: validDocuments[0]?.payload.riskScoringSnapshot,
            underwritingRuleSnapshot: validDocuments[0]?.payload.underwritingRuleSnapshot,
            underwritingDecisionSnapshot: validDocuments[0]?.payload.underwritingDecisionSnapshot,
            underwritingDecisionOverrides:
              validDocuments[0]?.payload.underwritingDecisionOverrides,
          },
          {
            riskFactorSnapshot,
            riskScoringSnapshot,
            underwritingRuleSnapshot,
            underwritingDecisionSnapshot,
            underwritingDecisionOverrides: validDocuments.flatMap(
              (item) => item.payload.underwritingDecisionOverrides || [],
            ),
          },
        );
        const generatedXml = buildAcordXmlFromPayload(validDocuments[0].payload, {
          suppressedOcrBlockIds: validDocuments[0].payload.suppressedOcrBlockIds,
        }).xml;
        submissionPackage = buildSubmissionPackage(validDocuments[0].payload, {
          acordXml: generatedXml,
          includeSemanticLineage: true,
          overrides: validDocuments[0].payload.submissionOverrides || [],
        });
        submissionDrift = evaluateSubmissionDrift(
          {
            submissionPackage: validDocuments[0].payload.submissionPackage,
            submissionStatus: validDocuments[0].payload.submissionStatus,
            carrierSubmissionResponse: validDocuments[0].payload.carrierSubmissionResponse,
            underwritingDecisionHash: validDocuments[0].payload.underwritingDecisionSnapshot?.decisionHash,
          },
          {
            submissionPackage,
            submissionStatus: validDocuments[0].payload.submissionStatus,
            carrierSubmissionResponse: validDocuments[0].payload.carrierSubmissionResponse,
            underwritingDecisionHash: underwritingDecisionSnapshot?.decisionHash,
          },
        );

        if (body.baselineConsistency) {
          consistency.drift = {
            hasDrift:
              consistency.consistencyHash !== body.baselineConsistency.consistencyHash ||
              consistency.lowConfidenceFields.length !==
                body.baselineConsistency.lowConfidenceFields.length ||
              consistency.disagreements.length !==
                body.baselineConsistency.disagreements.length,
            differences: [
              {
                key: "consistencyHash",
                baselineValue: body.baselineConsistency.consistencyHash,
                currentValue: consistency.consistencyHash,
              },
              {
                key: "lowConfidenceFields",
                baselineValue: body.baselineConsistency.lowConfidenceFields.length,
                currentValue: consistency.lowConfidenceFields.length,
              },
              {
                key: "disagreements",
                baselineValue: body.baselineConsistency.disagreements.length,
                currentValue: consistency.disagreements.length,
              },
            ].filter((item) => item.baselineValue !== item.currentValue),
          };
        }
      }
    }

    return {
      status: 200,
      jsonBody: {
        validation,
        semanticDiff,
        consistency,
        fusion,
        unifiedXml,
        semanticMemorySnapshot,
        semanticMemoryDrift,
        semanticMemoryRecommendations,
        prioritizedConflicts,
        globalSemanticGraphSnapshot: globalSemanticGraph?.snapshot,
        globalHarmonization: globalSemanticGraph?.harmonization,
        globalSemanticDrift,
        graphInference,
        carrierAdapters,
        carrierAdapterSnapshot,
        carrierAdapterDrift,
        underwritingRules,
        underwritingRuleSnapshot,
        underwritingRuleDrift,
        riskFactors,
        riskFactorSnapshot,
        riskScoring,
        riskScoringSnapshot,
        underwritingDecision,
        underwritingDecisionSnapshot,
        underwritingDecisionDrift,
        submissionPackage,
        submissionDrift,
      },
    };
  } catch (error: any) {
    context.error("evaluateAcordSemantics error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate ACORD semantics",
        details: error?.message || String(error),
      },
    };
  }
}

export default evaluateAcordSemanticsHandler;
