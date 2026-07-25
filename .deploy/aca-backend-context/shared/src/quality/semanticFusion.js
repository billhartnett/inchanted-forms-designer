"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCrossFormUnificationGraph = getCrossFormUnificationGraph;
exports.resolveUnificationForCode = resolveUnificationForCode;
exports.evaluateSemanticFusion = evaluateSemanticFusion;
exports.buildUnifiedSchemaFromFusion = buildUnifiedSchemaFromFusion;
exports.buildUnifiedAcordXmlFromFusion = buildUnifiedAcordXmlFromFusion;
exports.detectCrossDocumentFusionDrift = detectCrossDocumentFusionDrift;
const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";
function toFixed(value) {
    return Number(value.toFixed(6));
}
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1, value));
}
function average(values) {
    if (!values.length)
        return 0;
    return toFixed(values.reduce((sum, current) => sum + current, 0) / values.length);
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
function createUnificationEdges() {
    const edges = [
        {
            sourceCode: "GeneralInfo.NamedInsured",
            targetCode: "Applicant.Name",
            relationship: "equivalent",
            unificationClass: "acord-125-to-126",
        },
        {
            sourceCode: "GeneralInfo.MailingAddress.Street",
            targetCode: "Applicant.Address.Street",
            relationship: "equivalent",
            unificationClass: "acord-125-to-126",
        },
        {
            sourceCode: "Applicant.Name",
            targetCode: "Insured.Name",
            relationship: "equivalent",
            unificationClass: "acord-126-to-127",
        },
        {
            sourceCode: "Applicant.Address.City",
            targetCode: "Insured.Address.City",
            relationship: "equivalent",
            unificationClass: "acord-126-to-127",
        },
        {
            sourceCode: "Location.Address.Street",
            targetCode: "CommercialLines.Location.Address.Street",
            relationship: "equivalent",
            unificationClass: "acord-140-commercial-lines",
        },
        {
            sourceCode: "Location.PremisesNumber",
            targetCode: "CommercialLines.Location.Number",
            relationship: "equivalent",
            unificationClass: "acord-140-commercial-lines",
        },
    ];
    return edges.sort((left, right) => left.sourceCode.localeCompare(right.sourceCode) ||
        left.targetCode.localeCompare(right.targetCode));
}
function getCrossFormUnificationGraph() {
    const edges = createUnificationEdges();
    const adjacency = new Map();
    const classesByNode = new Map();
    for (const edge of edges) {
        const left = adjacency.get(edge.sourceCode) || new Set();
        left.add(edge.targetCode);
        adjacency.set(edge.sourceCode, left);
        const right = adjacency.get(edge.targetCode) || new Set();
        right.add(edge.sourceCode);
        adjacency.set(edge.targetCode, right);
        const leftClasses = classesByNode.get(edge.sourceCode) || new Set();
        leftClasses.add(edge.unificationClass);
        classesByNode.set(edge.sourceCode, leftClasses);
        const rightClasses = classesByNode.get(edge.targetCode) || new Set();
        rightClasses.add(edge.unificationClass);
        classesByNode.set(edge.targetCode, rightClasses);
    }
    const visited = new Set();
    const groups = [];
    for (const node of Array.from(adjacency.keys()).sort((a, b) => a.localeCompare(b))) {
        if (visited.has(node))
            continue;
        const queue = [node];
        visited.add(node);
        const codes = [];
        while (queue.length) {
            const current = queue.shift();
            if (!current)
                continue;
            codes.push(current);
            for (const neighbor of Array.from(adjacency.get(current) || []).sort((a, b) => a.localeCompare(b))) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        codes.sort((a, b) => a.localeCompare(b));
        const canonicalCode = codes[0];
        const classes = Array.from(new Set(codes.flatMap((code) => Array.from(classesByNode.get(code) || [])))).sort((a, b) => a.localeCompare(b));
        groups.push({
            groupId: `group-${hashString(codes.join("|"))}`,
            canonicalCode,
            equivalentCodes: codes,
            classes,
        });
    }
    groups.sort((left, right) => left.canonicalCode.localeCompare(right.canonicalCode));
    return {
        generatedAt: CANONICAL_GENERATED_AT,
        graphHash: hashString(stableSerialize({ edges, groups })),
        edges,
        groups,
    };
}
function resolveUnificationForCode(acordCode) {
    const graph = getCrossFormUnificationGraph();
    const group = graph.groups.find((item) => item.equivalentCodes.includes(acordCode));
    if (!group) {
        return {
            groupId: `group-${hashString(acordCode)}`,
            canonicalCode: acordCode,
            equivalentCodes: [acordCode],
            lineage: ["unification:standalone"],
        };
    }
    return {
        groupId: group.groupId,
        canonicalCode: group.canonicalCode,
        equivalentCodes: group.equivalentCodes,
        lineage: [
            `unification.graph=${graph.graphHash}`,
            `unification.class=${group.classes.join("|") || "none"}`,
        ],
    };
}
function acceptedCandidates(document) {
    const familyId = document.payload.formFamily?.familyId || "unknown-family";
    const documentId = document.payload.documentId || document.fixtureId;
    const rows = [];
    for (const record of document.payload.mappings) {
        const mappingNode = document.payload.decisionGraph.mappings[record.extractionBlockId];
        if (mappingNode?.decision !== "accepted")
            continue;
        const chosenCode = mappingNode.chosenCandidateCode || record.mapping.chosen?.acordCode;
        if (!chosenCode)
            continue;
        const candidate = record.mapping.suggestions.find((item) => item.acordCode === chosenCode) ||
            record.mapping.chosen;
        if (!candidate)
            continue;
        rows.push({
            documentId,
            familyId,
            acordCode: chosenCode,
            candidate,
        });
    }
    return rows;
}
function evaluateSemanticFusion(documents, options) {
    const rows = documents.flatMap((document) => acceptedCandidates(document));
    const overrides = options?.fusionOverrides || [];
    const byGroup = new Map();
    for (const row of rows) {
        const unification = resolveUnificationForCode(row.acordCode);
        const current = byGroup.get(unification.groupId) || [];
        current.push({
            ...row,
            candidate: {
                ...row.candidate,
                unification,
            },
        });
        byGroup.set(unification.groupId, current);
    }
    const profiles = [];
    const conflicts = [];
    for (const [groupId, entries] of byGroup.entries()) {
        const canonicalCode = entries[0].candidate.unification?.canonicalCode || entries[0].acordCode;
        const equivalentCodes = entries[0].candidate.unification?.equivalentCodes || [entries[0].acordCode];
        const documentIds = Array.from(new Set(entries.map((item) => item.documentId))).sort((a, b) => a.localeCompare(b));
        const families = Array.from(new Set(entries.map((item) => item.familyId))).sort((a, b) => a.localeCompare(b));
        const ontologyNamespaces = Array.from(new Set(entries.map((item) => item.candidate.arbitration?.winningNamespace ||
            item.candidate.ontology?.namespace ||
            "acord-core"))).sort((a, b) => a.localeCompare(b));
        const confidences = entries.map((item) => item.candidate.normalizedConfidenceScore || item.candidate.confidenceScore || 0);
        const lexical = entries.map((item) => item.candidate.lexicalScore || 0);
        const embedding = entries.map((item) => item.candidate.semanticSimilarity || 0);
        const dictionary = entries.map((item) => item.candidate.dictionaryScore || 0);
        const heuristic = entries.map((item) => item.candidate.heuristicScore || 0);
        const fusedConfidenceScore = average(confidences);
        const rationaleDistribution = {
            embedding: average(embedding),
            lexical: average(lexical),
            dictionary: average(dictionary),
            heuristic: average(heuristic),
        };
        const fusedRankingQuality = clamp01(fusedConfidenceScore * 0.6 +
            rationaleDistribution.embedding * 0.2 +
            rationaleDistribution.lexical * 0.2);
        const override = overrides.find((item) => item.groupId === groupId);
        const resolvedCode = override?.forcedAcordCode || canonicalCode;
        profiles.push({
            acordCode: resolvedCode,
            canonicalCode,
            groupId,
            equivalentCodes,
            documentIds,
            families,
            ontologyNamespaces,
            fusedConfidenceScore,
            fusedRankingQuality: toFixed(fusedRankingQuality),
            rationaleDistribution,
            lineage: [
                `fusion.documents=${documentIds.join("|")}`,
                `fusion.families=${families.join("|")}`,
                `fusion.ontologies=${ontologyNamespaces.join("|")}`,
                ...(override
                    ? [`fusion.override=${override.forcedAcordCode}`]
                    : ["fusion.override=none"]),
            ],
        });
        const uniqueCodes = Array.from(new Set(entries.map((item) => item.acordCode))).sort((a, b) => a.localeCompare(b));
        if (uniqueCodes.length > 1) {
            conflicts.push({
                conflictId: `fusion-conflict-${hashString(`${groupId}:document`)}`,
                class: "cross-document-disagreement",
                groupId,
                canonicalCode,
                documentIds,
                codes: uniqueCodes,
                families,
                ontologyNamespaces,
                resolvedCode,
                warning: "Equivalent field group has divergent selected codes across documents.",
            });
        }
        if (families.length > 1 && uniqueCodes.length > 1) {
            conflicts.push({
                conflictId: `fusion-conflict-${hashString(`${groupId}:family`)}`,
                class: "cross-family-disagreement",
                groupId,
                canonicalCode,
                documentIds,
                codes: uniqueCodes,
                families,
                ontologyNamespaces,
                resolvedCode,
                warning: "Equivalent field group diverges across form families.",
            });
        }
        if (ontologyNamespaces.length > 1 && uniqueCodes.length > 1) {
            conflicts.push({
                conflictId: `fusion-conflict-${hashString(`${groupId}:ontology`)}`,
                class: "cross-ontology-disagreement",
                groupId,
                canonicalCode,
                documentIds,
                codes: uniqueCodes,
                families,
                ontologyNamespaces,
                resolvedCode,
                warning: "Equivalent field group diverges across ontology namespaces.",
            });
        }
    }
    profiles.sort((left, right) => left.canonicalCode.localeCompare(right.canonicalCode));
    conflicts.sort((left, right) => left.conflictId.localeCompare(right.conflictId));
    const graph = getCrossFormUnificationGraph();
    const profileHash = hashString(stableSerialize(profiles.map((item) => ({
        acordCode: item.acordCode,
        canonicalCode: item.canonicalCode,
        fusedConfidenceScore: item.fusedConfidenceScore,
    }))));
    const conflictHash = hashString(stableSerialize(conflicts.map((item) => ({
        conflictId: item.conflictId,
        class: item.class,
        resolvedCode: item.resolvedCode,
    }))));
    const fusedRationaleDistribution = {
        embedding: average(profiles.map((item) => item.rationaleDistribution.embedding)),
        lexical: average(profiles.map((item) => item.rationaleDistribution.lexical)),
        dictionary: average(profiles.map((item) => item.rationaleDistribution.dictionary)),
        heuristic: average(profiles.map((item) => item.rationaleDistribution.heuristic)),
    };
    const fusedRankingQuality = average(profiles.map((item) => item.fusedRankingQuality));
    const denominator = Math.max(1, profiles.length);
    const byClass = {
        document: conflicts.filter((item) => item.class === "cross-document-disagreement").length,
        family: conflicts.filter((item) => item.class === "cross-family-disagreement").length,
        ontology: conflicts.filter((item) => item.class === "cross-ontology-disagreement").length,
    };
    return {
        generatedAt: CANONICAL_GENERATED_AT,
        documentCount: documents.length,
        profileHash,
        unificationHash: graph.graphHash,
        conflictHash,
        profiles,
        conflicts,
        fusedConsistency: {
            crossDocumentAgreement: toFixed(1 - byClass.document / denominator),
            crossFamilyAgreement: toFixed(1 - byClass.family / denominator),
            crossOntologyAgreement: toFixed(1 - byClass.ontology / denominator),
        },
        fusedRationaleDistribution,
        fusedRankingQuality,
        lineage: [
            `fusion.profileHash=${profileHash}`,
            `fusion.unificationHash=${graph.graphHash}`,
            `fusion.conflictHash=${conflictHash}`,
        ],
    };
}
function buildUnifiedSchemaFromFusion(report) {
    return {
        generatedAt: CANONICAL_GENERATED_AT,
        documentCount: report.documentCount,
        profileHash: report.profileHash,
        fields: report.profiles.map((item) => ({
            groupId: item.groupId,
            canonicalCode: item.canonicalCode,
            equivalentCodes: item.equivalentCodes,
            fusedConfidenceScore: item.fusedConfidenceScore,
            rationaleDistribution: item.rationaleDistribution,
            ontologyNamespaces: item.ontologyNamespaces,
            lineage: item.lineage,
        })),
    };
}
function xmlEscape(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
function xmlTag(value) {
    const normalized = value
        .replace(/[^A-Za-z0-9_.-]/g, "_")
        .replace(/^[^A-Za-z_]+/, "");
    return normalized || "Field";
}
function buildUnifiedAcordXmlFromFusion(report) {
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<ACORD>");
    lines.push(`  <UnifiedSubmission generatedAt="${CANONICAL_GENERATED_AT}" documents="${report.documentCount}" profileHash="${report.profileHash}" unificationHash="${report.unificationHash}">`);
    for (const profile of report.profiles) {
        const tag = xmlTag(profile.canonicalCode);
        lines.push(`    <${tag} groupId="${xmlEscape(profile.groupId)}" canonicalCode="${xmlEscape(profile.canonicalCode)}" fusedConfidence="${profile.fusedConfidenceScore.toFixed(3)}" rankingQuality="${profile.fusedRankingQuality.toFixed(3)}" ontologies="${xmlEscape(profile.ontologyNamespaces.join("|"))}" families="${xmlEscape(profile.families.join("|"))}" documents="${xmlEscape(profile.documentIds.join("|"))}" equivalents="${xmlEscape(profile.equivalentCodes.join("|"))}">${xmlEscape(profile.lineage.join("|"))}</${tag}>`);
    }
    lines.push("  </UnifiedSubmission>");
    lines.push("</ACORD>");
    const xml = lines.join("\n");
    return {
        generatedAt: CANONICAL_GENERATED_AT,
        unifiedXmlHash: hashString(xml),
        xml,
        includedGroups: report.profiles.length,
    };
}
function detectCrossDocumentFusionDrift(baseline, current) {
    const differences = [];
    if (baseline.profileHash !== current.profileHash) {
        differences.push({
            key: "profileHash",
            baselineValue: baseline.profileHash,
            currentValue: current.profileHash,
        });
    }
    if (baseline.unificationHash !== current.unificationHash) {
        differences.push({
            key: "unificationHash",
            baselineValue: baseline.unificationHash,
            currentValue: current.unificationHash,
        });
    }
    if (baseline.conflictHash !== current.conflictHash) {
        differences.push({
            key: "conflictHash",
            baselineValue: baseline.conflictHash,
            currentValue: current.conflictHash,
        });
    }
    if (typeof baseline.fusedRankingQuality === "number" &&
        typeof current.fusedRankingQuality === "number" &&
        baseline.fusedRankingQuality !== current.fusedRankingQuality) {
        differences.push({
            key: "fusedRankingQuality",
            baselineValue: baseline.fusedRankingQuality,
            currentValue: current.fusedRankingQuality,
        });
    }
    return {
        hasDrift: differences.length > 0,
        differences,
    };
}
