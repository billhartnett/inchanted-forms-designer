"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAcordOntology = buildAcordOntology;
exports.getAcordOntology = getAcordOntology;
exports.getAcordOntologyNode = getAcordOntologyNode;
exports.getDefaultOntologyMetadata = getDefaultOntologyMetadata;
exports.validateOntologySelection = validateOntologySelection;
const ONTOLOGY_ID = "acord-canonical-ontology";
const ONTOLOGY_VERSION = "2026.06.10";
const FALLBACK_ENTRIES = [
    {
        acordCode: "GeneralInfo.NamedInsured",
        label: "Named insured",
        description: "Named insured legal entity",
        dataType: "string",
        lob: "all",
        version: "current",
        keywords: ["insured", "name", "applicant"],
    },
    {
        acordCode: "GeneralInfo.MailingAddress.Line1",
        label: "Mailing address line 1",
        description: "Primary mailing street line",
        dataType: "string",
        lob: "all",
        version: "current",
        keywords: ["address", "mailing", "street", "line"],
    },
    {
        acordCode: "GeneralInfo.MailingAddress.City",
        label: "Mailing address city",
        description: "Mailing city",
        dataType: "string",
        lob: "all",
        version: "current",
        keywords: ["city", "address", "mailing"],
    },
    {
        acordCode: "GeneralInfo.MailingAddress.State",
        label: "Mailing address state",
        description: "Mailing state or province code",
        dataType: "string",
        lob: "all",
        version: "current",
        keywords: ["state", "province", "address", "mailing"],
    },
    {
        acordCode: "GeneralInfo.MailingAddress.PostalCode",
        label: "Mailing address postal code",
        description: "Mailing postal code",
        dataType: "string",
        lob: "all",
        version: "current",
        keywords: ["postal", "zip", "address", "mailing"],
    },
    {
        acordCode: "GeneralLiability.Exposure.HazardClass",
        label: "Hazard class",
        description: "General liability hazard class",
        dataType: "string",
        lob: "all",
        version: "current",
        keywords: ["liability", "hazard", "class"],
    },
    {
        acordCode: "CommercialProperty.Building.LocationAddress",
        label: "Building location address",
        description: "Property building location",
        dataType: "string",
        lob: "all",
        version: "current",
        keywords: ["property", "building", "location", "address"],
    },
    {
        acordCode: "Contractors.Operations.Description",
        label: "Contractors operations description",
        description: "Description of contractor operations",
        dataType: "string",
        lob: "all",
        version: "current",
        keywords: ["contractor", "operations", "work", "supplement"],
    },
];
const SECTION_KEYWORDS = [
    { name: "general-information", tokens: ["general", "applicant", "insured", "business"] },
    { name: "liability", tokens: ["liability", "hazard", "exposure"] },
    { name: "property", tokens: ["property", "building", "premises", "location"] },
    { name: "vehicle", tokens: ["vehicle", "auto", "driver"] },
    { name: "contact", tokens: ["address", "city", "state", "postal", "zip", "email", "phone"] },
    { name: "operations", tokens: ["contractor", "operations", "subcontractor", "work"] },
];
const GROUP_KEYWORDS = [
    { name: "identity", tokens: ["name", "insured", "applicant"] },
    { name: "address", tokens: ["address", "street", "city", "state", "postal", "zip"] },
    { name: "coverage", tokens: ["coverage", "limit", "premium"] },
    { name: "classification", tokens: ["class", "code", "type", "description"] },
    { name: "risk", tokens: ["hazard", "loss", "claim", "incident"] },
];
const PARENT_HINTS = [
    { child: ["city", "state", "postal", "zip"], parentToken: "address" },
    { child: ["first", "last", "middle", "surname"], parentToken: "name" },
    { child: ["premium", "limit"], parentToken: "coverage" },
    { child: ["vehicle"], parentToken: "driver" },
];
const MUTUAL_EXCLUSION_HINTS = [
    [["yes", "indicator"], ["no", "indicator"]],
    [["same", "address"], ["different", "address"]],
    [["primary", "residence"], ["secondary", "residence"]],
];
const REQUIRED_SIBLING_HINTS = [
    [["city"], ["state"]],
    [["state"], ["city"]],
    [["postal", "zip"], ["state"]],
    [["effective", "date"], ["expiration", "date"]],
];
function normalizeText(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function splitTokens(value) {
    return normalizeText(value)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 1);
}
function hasTokens(text, required) {
    return required.every((token) => text.includes(token));
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
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
function deriveAliases(entry) {
    const tokens = splitTokens(`${entry.label} ${entry.acordCode}`);
    return uniqueSorted([
        entry.label,
        tokens.slice(0, 2).join(" "),
        entry.acordCode.replace(/_/g, " "),
    ].filter((item) => item.trim().length > 0));
}
function deriveSynonyms(entry) {
    return uniqueSorted([
        ...entry.keywords,
        ...splitTokens(entry.description),
    ].filter((token) => token.length > 2));
}
function deriveSections(normalized) {
    const sections = SECTION_KEYWORDS.filter((item) => item.tokens.some((token) => normalized.includes(token))).map((item) => item.name);
    return sections.length ? uniqueSorted(sections) : ["general-information"];
}
function deriveGroups(normalized) {
    const groups = GROUP_KEYWORDS.filter((item) => item.tokens.some((token) => normalized.includes(token))).map((item) => item.name);
    return groups.length ? uniqueSorted(groups) : ["general"];
}
function deriveParentHints(entry) {
    const normalized = normalizeText(`${entry.acordCode} ${entry.label} ${entry.description}`);
    const parentTokens = PARENT_HINTS
        .filter((hint) => hint.child.some((token) => normalized.includes(token)))
        .map((hint) => hint.parentToken);
    return uniqueSorted(parentTokens);
}
function deriveMutualExclusionHints(entry) {
    const normalized = normalizeText(`${entry.acordCode} ${entry.label}`);
    const hints = [];
    for (const [left, right] of MUTUAL_EXCLUSION_HINTS) {
        if (hasTokens(normalized, left)) {
            hints.push(right.join(" "));
        }
        if (hasTokens(normalized, right)) {
            hints.push(left.join(" "));
        }
    }
    return uniqueSorted(hints);
}
function deriveRequiredSiblingHints(entry) {
    const normalized = normalizeText(`${entry.acordCode} ${entry.label}`);
    const hints = [];
    for (const [left, right] of REQUIRED_SIBLING_HINTS) {
        if (left.some((token) => normalized.includes(token))) {
            hints.push(right.join(" "));
        }
    }
    return uniqueSorted(hints);
}
function indexByTokens(entries) {
    const map = new Map();
    for (const entry of entries) {
        const text = normalizeText(`${entry.acordCode} ${entry.label} ${entry.description}`);
        const tokens = uniqueSorted(splitTokens(text));
        for (const token of tokens) {
            if (token.length < 3)
                continue;
            const list = map.get(token) || [];
            list.push(entry.acordCode);
            map.set(token, list);
        }
    }
    for (const [token, list] of map.entries()) {
        map.set(token, uniqueSorted(list));
    }
    return map;
}
function resolveTokenHintToCodes(tokenIndex, hints, currentCode) {
    const codes = [];
    for (const hint of hints) {
        for (const token of splitTokens(hint)) {
            const matches = tokenIndex.get(token) || [];
            for (const code of matches) {
                if (code !== currentCode) {
                    codes.push(code);
                }
            }
        }
    }
    return uniqueSorted(codes);
}
function buildNodes(entries) {
    const tokenIndex = indexByTokens(entries);
    const nodes = {};
    for (const entry of entries) {
        const normalized = normalizeText(`${entry.acordCode} ${entry.label} ${entry.description}`);
        const parentCodes = resolveTokenHintToCodes(tokenIndex, deriveParentHints(entry), entry.acordCode);
        const mutuallyExclusiveCodes = resolveTokenHintToCodes(tokenIndex, deriveMutualExclusionHints(entry), entry.acordCode);
        const requiredSiblingCodes = resolveTokenHintToCodes(tokenIndex, deriveRequiredSiblingHints(entry), entry.acordCode);
        nodes[entry.acordCode] = {
            acordCode: entry.acordCode,
            aliases: deriveAliases(entry),
            synonyms: deriveSynonyms(entry),
            parentCodes,
            childCodes: [],
            mutuallyExclusiveCodes,
            requiredSiblingCodes,
            sections: deriveSections(normalized),
            groups: deriveGroups(normalized),
        };
    }
    for (const node of Object.values(nodes)) {
        for (const parentCode of node.parentCodes) {
            const parent = nodes[parentCode];
            if (!parent)
                continue;
            parent.childCodes = uniqueSorted([...parent.childCodes, node.acordCode]);
        }
    }
    for (const node of Object.values(nodes)) {
        node.parentCodes = uniqueSorted(node.parentCodes.filter((code) => Boolean(nodes[code])));
        node.childCodes = uniqueSorted(node.childCodes.filter((code) => Boolean(nodes[code])));
        node.mutuallyExclusiveCodes = uniqueSorted(node.mutuallyExclusiveCodes.filter((code) => Boolean(nodes[code])));
        node.requiredSiblingCodes = uniqueSorted(node.requiredSiblingCodes.filter((code) => Boolean(nodes[code])));
    }
    return Object.fromEntries(Object.entries(nodes).sort((left, right) => left[0].localeCompare(right[0])));
}
let cachedOntology = null;
function buildAcordOntology(entries = []) {
    const nodes = buildNodes(entries.length ? entries : FALLBACK_ENTRIES);
    const hash = hashString(stableSerialize(nodes));
    return {
        ontologyId: ONTOLOGY_ID,
        version: ONTOLOGY_VERSION,
        generatedAt: "deterministic",
        hash,
        nodes,
    };
}
function getAcordOntology() {
    if (!cachedOntology) {
        cachedOntology = buildAcordOntology();
    }
    return cachedOntology;
}
function getAcordOntologyNode(acordCode) {
    return getAcordOntology().nodes[acordCode];
}
function getDefaultOntologyMetadata() {
    const ontology = getAcordOntology();
    return {
        ontologyId: ontology.ontologyId,
        ontologyVersion: ontology.version,
        ontologyHash: ontology.hash,
        alignedAt: "deterministic",
        migrationNotes: [],
    };
}
function validateOntologySelection(codes) {
    const ontology = getAcordOntology();
    const selected = new Set(codes);
    const issues = [];
    for (const code of selected) {
        const node = ontology.nodes[code];
        if (!node)
            continue;
        for (const parentCode of node.parentCodes) {
            if (!selected.has(parentCode)) {
                issues.push({
                    type: "parent-missing",
                    acordCode: code,
                    relatedCode: parentCode,
                    message: `${code} is selected without parent ${parentCode}.`,
                });
            }
        }
        for (const siblingCode of node.requiredSiblingCodes) {
            if (!selected.has(siblingCode)) {
                issues.push({
                    type: "required-sibling-missing",
                    acordCode: code,
                    relatedCode: siblingCode,
                    message: `${code} requires sibling ${siblingCode}.`,
                });
            }
        }
        for (const exclusiveCode of node.mutuallyExclusiveCodes) {
            if (selected.has(exclusiveCode)) {
                issues.push({
                    type: "mutually-exclusive",
                    acordCode: code,
                    relatedCode: exclusiveCode,
                    message: `${code} conflicts with ${exclusiveCode}.`,
                });
            }
        }
    }
    const normalized = issues.sort((left, right) => left.type.localeCompare(right.type) ||
        left.acordCode.localeCompare(right.acordCode) ||
        (left.relatedCode || "").localeCompare(right.relatedCode || ""));
    return {
        valid: normalized.length === 0,
        issues: normalized,
    };
}
