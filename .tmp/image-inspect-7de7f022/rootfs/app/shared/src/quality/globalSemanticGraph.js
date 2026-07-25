"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGraphHarmonizationReport = buildGraphHarmonizationReport;
exports.buildGlobalSemanticGraph = buildGlobalSemanticGraph;
exports.evaluateGraphInference = evaluateGraphInference;
exports.evaluateGlobalSemanticDrift = evaluateGlobalSemanticDrift;
exports.inferCandidateFromGlobalGraph = inferCandidateFromGlobalGraph;
const ontology_1 = require("../acord/ontology");
const multiOntology_1 = require("../acord/multiOntology");
const semanticFusion_1 = require("./semanticFusion");
const semanticMemory_1 = require("./semanticMemory");
const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";
function toFixed(value) {
    return Number(value.toFixed(6));
}
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1, value));
}
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
function stableSerialize(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value).sort((a, b) => a[0].localeCompare(b[0]));
        return `{${entries
            .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
function nodeId(nodeType, namespace, code) {
    return `${nodeType}:${namespace}:${code}`;
}
function edgeId(fromNodeId, toNodeId, edgeType) {
    return `${edgeType}:${fromNodeId}->${toNodeId}`;
}
function mergeLineage(values) {
    return uniqueSorted(values);
}
function applyGraphDecisions(snapshot, decisions) {
    if (!decisions.length) {
        return snapshot;
    }
    const sorted = [...decisions].sort((left, right) => left.decisionId.localeCompare(right.decisionId));
    const pinned = [...sorted]
        .reverse()
        .find((decision) => decision.action === "pin-version" && decision.targetVersionId);
    return {
        ...snapshot,
        pinnedVersionId: pinned?.targetVersionId || snapshot.pinnedVersionId,
        lineage: mergeLineage([
            ...snapshot.lineage,
            ...sorted.map((decision) => `graph.decision:${decision.action}:${decision.targetVersionId || "none"}`),
        ]),
    };
}
function applyEdgeOverrides(edges, overrides) {
    if (!overrides.length) {
        return edges;
    }
    const byId = new Map(edges.map((edge) => [edge.edgeId, edge]));
    for (const override of overrides) {
        const resolvedEdgeId = override.edgeId || edgeId(override.fromNodeId, override.toNodeId, override.edgeType);
        if (!override.active) {
            byId.delete(resolvedEdgeId);
            continue;
        }
        byId.set(resolvedEdgeId, {
            edgeId: resolvedEdgeId,
            fromNodeId: override.fromNodeId,
            toNodeId: override.toNodeId,
            edgeType: override.edgeType,
            weight: toFixed(override.weight),
            lineage: mergeLineage([
                `graph.override.changedAt=${override.changedAt}`,
                `graph.override.reason=${override.reason || "none"}`,
            ]),
        });
    }
    return Array.from(byId.values()).sort((left, right) => left.edgeType.localeCompare(right.edgeType) || left.edgeId.localeCompare(right.edgeId));
}
function buildGraphHarmonizationReport(familyId, nodes, edges) {
    const bundles = (0, multiOntology_1.selectOntologyBundlesForFamily)(familyId);
    const namespaces = uniqueSorted(bundles.map((bundle) => bundle.metadata.namespace));
    const precedenceOrder = bundles
        .slice()
        .sort((left, right) => right.metadata.precedence - left.metadata.precedence)
        .map((bundle) => `${bundle.metadata.namespace}:${bundle.metadata.precedence}`);
    const compatibilityViolations = bundles
        .flatMap((bundle) => bundles
        .filter((peer) => peer.metadata.namespace !== bundle.metadata.namespace)
        .filter((peer) => !bundle.metadata.compatibility.includes(peer.metadata.namespace))
        .map((peer) => `${bundle.metadata.namespace}->${peer.metadata.namespace}`))
        .sort((left, right) => left.localeCompare(right));
    const harmonizationHash = hashString(stableSerialize({
        namespaces,
        precedenceOrder,
        compatibilityViolations,
        mergedNodes: nodes.length,
        mergedEdges: edges.length,
    }));
    return {
        generatedAt: CANONICAL_GENERATED_AT,
        harmonizationHash,
        namespaces,
        compatibilityViolations,
        precedenceOrder,
        mergedNodes: nodes.length,
        mergedEdges: edges.length,
        lineage: [
            `harmonization.hash=${harmonizationHash}`,
            `harmonization.namespaces=${namespaces.join("|")}`,
            `harmonization.violations=${compatibilityViolations.length}`,
        ],
    };
}
function buildGlobalSemanticGraph(documents, options) {
    const fusion = (0, semanticFusion_1.evaluateSemanticFusion)(documents, {
        fusionOverrides: documents.flatMap((document) => document.payload.fusionOverrides || []),
    });
    const unification = (0, semanticFusion_1.getCrossFormUnificationGraph)();
    const memory = options?.memorySnapshot ||
        (0, semanticMemory_1.buildSemanticMemorySnapshot)(documents, {
            previousSnapshot: documents[0]?.payload.semanticMemorySnapshot,
            decisions: documents.flatMap((document) => document.payload.semanticMemoryDecisions || []),
        });
    const familyId = documents[0]?.payload.formFamily?.familyId;
    const bundles = (0, multiOntology_1.selectOntologyBundlesForFamily)(familyId);
    const acordOntology = (0, ontology_1.getAcordOntology)();
    const nodes = [];
    const edges = [];
    const pushNode = (node) => {
        nodes.push(node);
    };
    const pushEdge = (edge) => {
        edges.push(edge);
    };
    for (const [code, node] of Object.entries(acordOntology.nodes)) {
        const currentNodeId = nodeId("acord-ontology", "acord-core", code);
        pushNode({
            nodeId: currentNodeId,
            nodeType: "acord-ontology",
            code,
            namespace: "acord-core",
            sourceId: acordOntology.hash,
            confidence: 1,
            lineage: [`graph.source=acord:${acordOntology.hash}`],
        });
        for (const parent of node.parentCodes || []) {
            pushEdge({
                edgeId: edgeId(currentNodeId, nodeId("acord-ontology", "acord-core", parent), "parent-child"),
                fromNodeId: currentNodeId,
                toNodeId: nodeId("acord-ontology", "acord-core", parent),
                edgeType: "parent-child",
                weight: 1,
                lineage: ["graph.relationship=parent-child"],
            });
        }
        for (const sibling of node.requiredSiblingCodes || []) {
            pushEdge({
                edgeId: edgeId(currentNodeId, nodeId("acord-ontology", "acord-core", sibling), "sibling-required"),
                fromNodeId: currentNodeId,
                toNodeId: nodeId("acord-ontology", "acord-core", sibling),
                edgeType: "sibling-required",
                weight: 0.9,
                lineage: ["graph.relationship=sibling-required"],
            });
        }
        for (const exclusive of node.mutuallyExclusiveCodes || []) {
            pushEdge({
                edgeId: edgeId(currentNodeId, nodeId("acord-ontology", "acord-core", exclusive), "mutually-exclusive"),
                fromNodeId: currentNodeId,
                toNodeId: nodeId("acord-ontology", "acord-core", exclusive),
                edgeType: "mutually-exclusive",
                weight: 0.95,
                lineage: ["graph.relationship=mutually-exclusive"],
            });
        }
    }
    for (const bundle of bundles) {
        for (const code of Object.keys(bundle.ontology.nodes)) {
            const carrierNode = nodeId("carrier-ontology", bundle.metadata.namespace, code);
            const acordNode = nodeId("acord-ontology", "acord-core", code);
            pushNode({
                nodeId: carrierNode,
                nodeType: "carrier-ontology",
                code,
                namespace: bundle.metadata.namespace,
                sourceId: bundle.metadata.bundleId,
                confidence: toFixed(bundle.metadata.precedence / 300),
                lineage: [`graph.source=bundle:${bundle.metadata.bundleId}`],
            });
            pushEdge({
                edgeId: edgeId(carrierNode, acordNode, "cross-ontology-harmonization"),
                fromNodeId: carrierNode,
                toNodeId: acordNode,
                edgeType: "cross-ontology-harmonization",
                weight: toFixed(bundle.metadata.precedence / 300),
                lineage: [
                    `graph.harmonization.namespace=${bundle.metadata.namespace}`,
                    `graph.harmonization.precedence=${bundle.metadata.precedence}`,
                ],
            });
        }
    }
    for (const profile of fusion.profiles) {
        const profileNodeId = nodeId("fused-profile", "fusion", profile.groupId);
        const groupNodeId = nodeId("unification-group", "unification", profile.groupId);
        pushNode({
            nodeId: profileNodeId,
            nodeType: "fused-profile",
            code: profile.acordCode,
            namespace: "fusion",
            sourceId: fusion.profileHash,
            confidence: profile.fusedConfidenceScore,
            lineage: profile.lineage,
        });
        pushNode({
            nodeId: groupNodeId,
            nodeType: "unification-group",
            code: profile.canonicalCode,
            namespace: "unification",
            sourceId: unification.graphHash,
            confidence: profile.fusedRankingQuality,
            lineage: [`graph.source=unification:${unification.graphHash}`],
        });
        pushEdge({
            edgeId: edgeId(profileNodeId, groupNodeId, "cross-form-unification"),
            fromNodeId: profileNodeId,
            toNodeId: groupNodeId,
            edgeType: "cross-form-unification",
            weight: profile.fusedRankingQuality,
            lineage: [`graph.fusion.group=${profile.groupId}`],
        });
        for (const code of profile.equivalentCodes) {
            const ontologyNodeId = nodeId("acord-ontology", "acord-core", code);
            pushEdge({
                edgeId: edgeId(groupNodeId, ontologyNodeId, "equivalence"),
                fromNodeId: groupNodeId,
                toNodeId: ontologyNodeId,
                edgeType: "equivalence",
                weight: profile.fusedConfidenceScore,
                lineage: [`graph.unification.code=${code}`],
            });
        }
    }
    for (const entry of memory.entries) {
        const memoryNodeId = nodeId("memory-cluster", "memory", entry.groupId);
        const unificationNodeId = nodeId("unification-group", "unification", entry.groupId);
        pushNode({
            nodeId: memoryNodeId,
            nodeType: "memory-cluster",
            code: entry.representativeCode,
            namespace: "memory",
            sourceId: memory.versionId,
            confidence: entry.stabilityScore,
            lineage: entry.lineage,
        });
        pushEdge({
            edgeId: edgeId(memoryNodeId, unificationNodeId, "equivalence"),
            fromNodeId: memoryNodeId,
            toNodeId: unificationNodeId,
            edgeType: "equivalence",
            weight: entry.stabilityScore,
            lineage: [
                `graph.memory.version=${memory.versionId}`,
                `graph.memory.recurrence=${entry.conflictRecurrence}`,
            ],
        });
    }
    const dedupedNodes = Array.from(new Map(nodes.map((node) => [node.nodeId, node])).values()).sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    const dedupedEdges = applyEdgeOverrides(Array.from(new Map(edges.map((edge) => [edge.edgeId, edge])).values()).sort((left, right) => left.edgeId.localeCompare(right.edgeId)), options?.edgeOverrides ||
        documents.flatMap((document) => document.payload.globalSemanticGraphEdgeOverrides || []));
    const harmonization = buildGraphHarmonizationReport(familyId, dedupedNodes, dedupedEdges);
    const previous = options?.previousSnapshot;
    const nextVersion = (previous ? Number(previous.versionId.replace("graph-v", "")) || 0 : 0) + 1;
    const versionId = `graph-v${nextVersion}`;
    const graphHash = hashString(stableSerialize({
        nodes: dedupedNodes.map((node) => ({
            nodeId: node.nodeId,
            nodeType: node.nodeType,
            code: node.code,
            namespace: node.namespace,
            confidence: node.confidence,
        })),
        edges: dedupedEdges.map((edge) => ({
            edgeId: edge.edgeId,
            fromNodeId: edge.fromNodeId,
            toNodeId: edge.toNodeId,
            edgeType: edge.edgeType,
            weight: edge.weight,
        })),
        harmonizationHash: harmonization.harmonizationHash,
        versionId,
    }));
    const snapshot = {
        generatedAt: CANONICAL_GENERATED_AT,
        versionId,
        graphHash,
        harmonizationHash: harmonization.harmonizationHash,
        nodeCount: dedupedNodes.length,
        edgeCount: dedupedEdges.length,
        nodes: dedupedNodes,
        edges: dedupedEdges,
        pinnedVersionId: previous?.pinnedVersionId,
        lineage: mergeLineage([
            `graph.version=${versionId}`,
            `graph.hash=${graphHash}`,
            `graph.harmonization=${harmonization.harmonizationHash}`,
            ...harmonization.lineage,
            ...fusion.lineage,
            ...memory.lineage,
        ]),
    };
    return {
        snapshot: applyGraphDecisions(snapshot, options?.mergeDecisions ||
            documents.flatMap((document) => document.payload.globalSemanticGraphMergeDecisions || [])),
        harmonization,
    };
}
function evaluateGraphInference(payload, graphSnapshot) {
    const byCode = new Map(graphSnapshot.nodes.reduce((acc, node) => {
        const current = acc.get(node.code) || [];
        current.push(node);
        acc.set(node.code, current);
        return acc;
    }, new Map()));
    const incomingByNode = new Map(graphSnapshot.edges.reduce((acc, edge) => {
        const current = acc.get(edge.toNodeId) || [];
        current.push(edge);
        acc.set(edge.toNodeId, current);
        return acc;
    }, new Map()));
    return payload.mappings
        .map((record) => {
        const chosenCode = payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
            record.mapping.chosen?.acordCode;
        const graphNodes = chosenCode ? byCode.get(chosenCode) || [] : [];
        const inferredCodes = uniqueSorted(graphNodes
            .flatMap((node) => incomingByNode.get(node.nodeId) || [])
            .filter((edge) => edge.edgeType === "equivalence" ||
            edge.edgeType === "cross-ontology-harmonization" ||
            edge.edgeType === "cross-form-unification")
            .map((edge) => {
            const fromNode = graphSnapshot.nodes.find((node) => node.nodeId === edge.fromNodeId);
            return fromNode?.code || "";
        })
            .filter(Boolean));
        const inferredMissingRelationships = uniqueSorted(graphNodes
            .flatMap((node) => incomingByNode.get(node.nodeId) || [])
            .filter((edge) => edge.edgeType === "sibling-required" || edge.edgeType === "parent-child")
            .map((edge) => `${edge.edgeType}:${edge.fromNodeId}`));
        const confidence = toFixed(clamp01(graphNodes.length * 0.15 +
            inferredCodes.length * 0.12 +
            inferredMissingRelationships.length * 0.08));
        const abstain = !chosenCode ||
            (graphNodes.length === 0 && (record.mapping.chosen?.confidenceScore || 0) < 0.6);
        return {
            extractionBlockId: record.extractionBlockId,
            chosenCode,
            inferredCodes,
            inferredMissingRelationships,
            confidence,
            explainability: [
                `graph nodes=${graphNodes.length}`,
                `equivalences=${inferredCodes.length}`,
                `relationships=${inferredMissingRelationships.length}`,
                abstain ? "abstain=true" : "abstain=false",
            ],
            abstain,
            lineage: mergeLineage([
                `graph.version=${graphSnapshot.versionId}`,
                `graph.hash=${graphSnapshot.graphHash}`,
                ...(record.mapping.rationale?.graphLineage || []),
            ]),
        };
    })
        .sort((left, right) => left.extractionBlockId.localeCompare(right.extractionBlockId));
}
function evaluateGlobalSemanticDrift(baseline, current) {
    if (!baseline) {
        return {
            hasDrift: false,
            driftHash: hashString(stableSerialize({ baseline: null, current: current.graphHash })),
            differences: [],
        };
    }
    const differences = [
        {
            key: "graphHash",
            baselineValue: baseline.graphHash,
            currentValue: current.graphHash,
        },
        {
            key: "harmonizationHash",
            baselineValue: baseline.harmonizationHash,
            currentValue: current.harmonizationHash,
        },
        {
            key: "nodeCount",
            baselineValue: baseline.nodeCount,
            currentValue: current.nodeCount,
        },
        {
            key: "edgeCount",
            baselineValue: baseline.edgeCount,
            currentValue: current.edgeCount,
        },
    ].filter((item) => item.baselineValue !== item.currentValue);
    return {
        hasDrift: differences.length > 0,
        driftHash: hashString(stableSerialize(differences)),
        differences,
    };
}
function inferCandidateFromGlobalGraph(candidate, graphSnapshot) {
    if (!graphSnapshot) {
        return {
            inferred: false,
            confidence: 0,
            evidence: ["global semantic graph unavailable"],
            recommendedCodes: [],
            lineage: ["graph.unavailable"],
        };
    }
    const candidateNodes = graphSnapshot.nodes.filter((node) => node.code === candidate.acordCode);
    const recommendations = uniqueSorted(graphSnapshot.edges
        .filter((edge) => candidateNodes.some((node) => edge.toNodeId === node.nodeId || edge.fromNodeId === node.nodeId))
        .map((edge) => {
        const relatedId = candidateNodes.some((node) => edge.fromNodeId === node.nodeId)
            ? edge.toNodeId
            : edge.fromNodeId;
        return graphSnapshot.nodes.find((node) => node.nodeId === relatedId)?.code || "";
    })
        .filter(Boolean));
    const confidence = toFixed(clamp01(Math.min(1, candidateNodes.length / 3) * 0.5 + Math.min(1, recommendations.length / 4) * 0.5));
    return {
        inferred: recommendations.length > 0,
        confidence,
        evidence: [
            `graph matches=${candidateNodes.length}`,
            `recommended=${recommendations.length}`,
            `graph version=${graphSnapshot.versionId}`,
        ],
        recommendedCodes: recommendations,
        lineage: [
            `graph.version=${graphSnapshot.versionId}`,
            `graph.hash=${graphSnapshot.graphHash}`,
        ],
    };
}
