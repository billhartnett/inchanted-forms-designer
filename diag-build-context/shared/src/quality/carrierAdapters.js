"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCarrierAdapterBundles = getCarrierAdapterBundles;
exports.adaptCandidateToCarrier = adaptCandidateToCarrier;
exports.evaluateCarrierAdapterMappings = evaluateCarrierAdapterMappings;
exports.buildCarrierAdapterSnapshot = buildCarrierAdapterSnapshot;
exports.evaluateCarrierAdapterDrift = evaluateCarrierAdapterDrift;
const semanticFusion_1 = require("./semanticFusion");
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
function createCarrierBundles() {
    const bundles = [
        {
            carrierId: "carrier-markel",
            carrierLabel: "Markel",
            namespace: "carrier-supplemental-markel",
            version: "2026.06.10",
            precedence: 260,
            compatibility: ["acord-core", "carrier-supplemental"],
            nodes: [
                {
                    carrierCode: "MKL.Contractor.SubcontractorCost",
                    label: "Subcontractor Cost",
                    aliases: ["Subcontractors Paid", "Sub Cost"],
                    synonyms: ["subcontractor amount", "subcontractor paid"],
                    constraints: ["requires:GeneralInfo.NamedInsured"],
                    equivalentAcordCodes: ["Contractors_SubcontractorsPaidAmount"],
                    equivalentUnificationGroups: [(0, semanticFusion_1.resolveUnificationForCode)("Contractors_SubcontractorsPaidAmount").groupId],
                },
                {
                    carrierCode: "MKL.Contractor.RemodelPercent",
                    label: "Remodel Work Percent",
                    aliases: ["Percent Remodel"],
                    synonyms: ["remodel percent", "renovation percentage"],
                    constraints: ["range:0-100"],
                    equivalentAcordCodes: ["ContractorsUnderwriting_RemodelWorkPercent"],
                    equivalentUnificationGroups: [(0, semanticFusion_1.resolveUnificationForCode)("ContractorsUnderwriting_RemodelWorkPercent").groupId],
                },
            ],
            signature: "",
            generatedAt: CANONICAL_GENERATED_AT,
        },
        {
            carrierId: "carrier-anac",
            carrierLabel: "ANAC",
            namespace: "carrier-supplemental-anac",
            version: "2026.06.10",
            precedence: 240,
            compatibility: ["acord-core", "carrier-supplemental"],
            nodes: [
                {
                    carrierCode: "ANAC.Contractor.LicenseNumber",
                    label: "Contractor License Number",
                    aliases: ["License No"],
                    synonyms: ["license identifier", "state license number"],
                    constraints: ["requires:GeneralInfo.NamedInsured"],
                    equivalentAcordCodes: ["ContractorsUnderwriting_LicenseNumberIdentifier"],
                    equivalentUnificationGroups: [(0, semanticFusion_1.resolveUnificationForCode)("ContractorsUnderwriting_LicenseNumberIdentifier").groupId],
                },
                {
                    carrierCode: "ANAC.Contractor.SubcontractorPercent",
                    label: "Subcontractor Percent",
                    aliases: ["Subcontractor %"],
                    synonyms: ["percent subcontracted", "outsourced percent"],
                    constraints: ["range:0-100"],
                    equivalentAcordCodes: ["SuretyLineOfBusiness_JobCostBreakdown_SubcontractorPercent"],
                    equivalentUnificationGroups: [(0, semanticFusion_1.resolveUnificationForCode)("SuretyLineOfBusiness_JobCostBreakdown_SubcontractorPercent").groupId],
                },
            ],
            signature: "",
            generatedAt: CANONICAL_GENERATED_AT,
        },
    ];
    return bundles
        .map((bundle) => ({
        ...bundle,
        signature: hashString(stableSerialize({
            carrierId: bundle.carrierId,
            version: bundle.version,
            namespace: bundle.namespace,
            nodes: bundle.nodes,
        })),
    }))
        .sort((left, right) => right.precedence - left.precedence || left.carrierId.localeCompare(right.carrierId));
}
function getCarrierAdapterBundles(familyId) {
    const bundles = createCarrierBundles();
    const normalized = (familyId || "").toLowerCase();
    if (normalized.includes("contractor") || normalized.includes("supplement")) {
        return bundles;
    }
    return bundles.filter((bundle) => bundle.carrierId === "carrier-markel");
}
function adaptCandidateToCarrier(candidate, familyId, overrides) {
    const bundles = getCarrierAdapterBundles(familyId);
    for (const bundle of bundles) {
        for (const node of bundle.nodes) {
            const equivalent = node.equivalentAcordCodes.includes(candidate.acordCode);
            const aliasMatch = node.aliases
                .concat(node.synonyms)
                .some((term) => `${candidate.label} ${candidate.description || ""}`
                .toLowerCase()
                .includes(term.toLowerCase()));
            if (!equivalent && !aliasMatch)
                continue;
            const override = (overrides || []).find((item) => item.carrierId === bundle.carrierId && item.carrierCode === node.carrierCode);
            const mappedAcordCode = override?.forcedAcordCode || node.equivalentAcordCodes[0] || candidate.acordCode;
            const confidence = clamp01((equivalent ? 0.7 : 0.45) + (aliasMatch ? 0.2 : 0) + bundle.precedence / 1000);
            return {
                carrierId: bundle.carrierId,
                carrierCode: node.carrierCode,
                mappedAcordCode,
                confidence: toFixed(confidence),
                constraints: node.constraints,
                lineage: [
                    `adapter.bundle=${bundle.carrierId}@${bundle.version}`,
                    `adapter.node=${node.carrierCode}`,
                    `adapter.signature=${bundle.signature}`,
                    override ? `adapter.override=${override.forcedAcordCode}` : "adapter.override=none",
                ],
            };
        }
    }
    return {
        carrierId: "carrier-default",
        carrierCode: candidate.acordCode,
        mappedAcordCode: candidate.acordCode,
        confidence: 0,
        constraints: [],
        lineage: ["adapter.match=none"],
    };
}
function evaluateCarrierAdapterMappings(payload, options) {
    const familyId = options?.familyId || payload.formFamily?.familyId;
    const overrides = options?.overrides || payload.carrierAdapterOverrides || [];
    return payload.mappings
        .map((record) => {
        const chosen = payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
            record.mapping.chosen?.acordCode;
        if (!chosen)
            return null;
        const candidate = record.mapping.suggestions.find((item) => item.acordCode === chosen) || record.mapping.chosen;
        if (!candidate)
            return null;
        const adapted = adaptCandidateToCarrier(candidate, familyId, overrides);
        return {
            extractionBlockId: record.extractionBlockId,
            carrierId: adapted.carrierId,
            carrierCode: adapted.carrierCode,
            mappedAcordCode: adapted.mappedAcordCode,
            confidence: adapted.confidence,
            constraints: adapted.constraints,
            lineage: adapted.lineage,
        };
    })
        .filter((item) => Boolean(item))
        .sort((left, right) => left.extractionBlockId.localeCompare(right.extractionBlockId));
}
function buildCarrierAdapterSnapshot(documents, options) {
    const mappings = documents.flatMap((document) => evaluateCarrierAdapterMappings(document.payload, {
        familyId: document.payload.formFamily?.familyId,
        overrides: options?.overrides || document.payload.carrierAdapterOverrides || [],
    }));
    const carriers = Array.from(new Set(mappings.map((item) => item.carrierId))).sort((a, b) => a.localeCompare(b));
    const previous = options?.previousSnapshot;
    const nextVersion = (previous ? Number(previous.versionId.replace("adapter-v", "")) || 0 : 0) + 1;
    const versionId = `adapter-v${nextVersion}`;
    const adapterHash = hashString(stableSerialize(mappings.map((item) => ({
        extractionBlockId: item.extractionBlockId,
        carrierId: item.carrierId,
        carrierCode: item.carrierCode,
        mappedAcordCode: item.mappedAcordCode,
    }))));
    return {
        generatedAt: CANONICAL_GENERATED_AT,
        versionId,
        adapterHash,
        carrierIds: carriers,
        mappingCount: mappings.length,
        lineage: [
            `adapter.version=${versionId}`,
            `adapter.hash=${adapterHash}`,
            `adapter.carriers=${carriers.join("|")}`,
        ],
    };
}
function evaluateCarrierAdapterDrift(baseline, current) {
    if (!baseline) {
        return {
            hasDrift: false,
            driftHash: hashString(stableSerialize({ baseline: null, current: current.adapterHash })),
            differences: [],
        };
    }
    const differences = [
        { key: "adapterHash", baselineValue: baseline.adapterHash, currentValue: current.adapterHash },
        { key: "versionId", baselineValue: baseline.versionId, currentValue: current.versionId },
        { key: "mappingCount", baselineValue: baseline.mappingCount, currentValue: current.mappingCount },
        { key: "carrierCount", baselineValue: baseline.carrierIds.length, currentValue: current.carrierIds.length },
    ].filter((item) => item.baselineValue !== item.currentValue);
    return {
        hasDrift: differences.length > 0,
        driftHash: hashString(stableSerialize(differences)),
        differences,
    };
}
