"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOntologyBundles = getOntologyBundles;
exports.selectOntologyBundlesForFamily = selectOntologyBundlesForFamily;
exports.validateOntologyBundleSignatures = validateOntologyBundleSignatures;
exports.arbitrateCandidateByOntology = arbitrateCandidateByOntology;
const ontology_1 = require("./ontology");
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
function withNamespace(ontology, namespace) {
    return {
        ...ontology,
        ontologyId: `${ontology.ontologyId}:${namespace}`,
        hash: hashString(`${namespace}:${ontology.hash}`),
        nodes: Object.fromEntries(Object.entries(ontology.nodes).map(([code, node]) => [
            code,
            {
                ...node,
                sections: Array.from(new Set([namespace, ...node.sections])).sort((a, b) => a.localeCompare(b)),
            },
        ])),
    };
}
function createBundle(namespace, version, precedence, compatibility) {
    const base = (0, ontology_1.buildAcordOntology)();
    const ontology = withNamespace(base, namespace);
    const metadata = {
        bundleId: `${namespace}@${version}`,
        namespace,
        version,
        signature: hashString(stableSerialize({ namespace, version, hash: ontology.hash })),
        compatibility,
        precedence,
        generatedAt: "deterministic",
    };
    return {
        metadata,
        ontology,
    };
}
let cachedBundles = null;
function getOntologyBundles() {
    if (!cachedBundles) {
        cachedBundles = [
            createBundle("acord-core", "2026.06.10", 300, ["acord-core", "carrier-supplemental", "internal-extended"]),
            createBundle("carrier-supplemental", "2026.06.10", 200, ["acord-core", "carrier-supplemental"]),
            createBundle("internal-extended", "2026.06.10", 100, ["acord-core", "internal-extended"]),
        ];
    }
    return cachedBundles.map((bundle) => ({
        metadata: { ...bundle.metadata, compatibility: [...bundle.metadata.compatibility] },
        ontology: bundle.ontology,
    }));
}
function selectOntologyBundlesForFamily(familyId) {
    const bundles = getOntologyBundles();
    const normalized = (familyId || "").toLowerCase();
    if (normalized.includes("contractor") || normalized.includes("supplement")) {
        return bundles
            .filter((bundle) => bundle.metadata.namespace === "acord-core" ||
            bundle.metadata.namespace === "carrier-supplemental")
            .sort((a, b) => b.metadata.precedence - a.metadata.precedence);
    }
    if (normalized.includes("acord")) {
        return bundles
            .filter((bundle) => bundle.metadata.namespace === "acord-core" ||
            bundle.metadata.namespace === "internal-extended")
            .sort((a, b) => b.metadata.precedence - a.metadata.precedence);
    }
    return bundles.sort((a, b) => b.metadata.precedence - a.metadata.precedence);
}
function validateOntologyBundleSignatures(bundles) {
    const invalidBundleIds = bundles
        .filter((bundle) => {
        const expected = hashString(stableSerialize({
            namespace: bundle.metadata.namespace,
            version: bundle.metadata.version,
            hash: bundle.ontology.hash,
        }));
        return expected !== bundle.metadata.signature;
    })
        .map((bundle) => bundle.metadata.bundleId)
        .sort((a, b) => a.localeCompare(b));
    return {
        valid: invalidBundleIds.length === 0,
        invalidBundleIds,
    };
}
function arbitrateCandidateByOntology(candidate, bundles) {
    const contenders = bundles
        .filter((bundle) => Boolean(bundle.ontology.nodes[candidate.acordCode]))
        .sort((a, b) => b.metadata.precedence - a.metadata.precedence);
    const winner = contenders[0] || bundles[0];
    const overriddenNamespaces = contenders
        .slice(1)
        .map((bundle) => bundle.metadata.namespace)
        .sort((a, b) => a.localeCompare(b));
    const reason = contenders.length > 1
        ? `Selected ${winner.metadata.namespace} by precedence over ${overriddenNamespaces.join(", ")}.`
        : `Selected ${winner.metadata.namespace} as only matching ontology.`;
    return {
        acordCode: candidate.acordCode,
        winningNamespace: winner?.metadata.namespace || "acord-core",
        overriddenNamespaces,
        reason,
        score: Number(((winner?.metadata.precedence || 0) / 300).toFixed(6)),
    };
}
