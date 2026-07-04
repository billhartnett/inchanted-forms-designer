"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acordSearch = acordSearch;
exports.acordLookupByCode = acordLookupByCode;
exports.acordAll = acordAll;
exports.acordSuggest = acordSuggest;
const functions_1 = require("@azure/functions");
const mapping_1 = require("../../mapping");
function parseLimit(value) {
    if (!value)
        return 20;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 20;
    return Math.max(1, Math.min(100, Math.floor(parsed)));
}
async function acordSearch(request, context) {
    try {
        const query = request.query.get("query") || "";
        const limit = parseLimit(request.query.get("limit"));
        if (!query.trim()) {
            return {
                status: 400,
                jsonBody: {
                    error: "Missing query parameter",
                },
            };
        }
        const results = (0, mapping_1.searchAcordLabels)(query, limit);
        return {
            status: 200,
            jsonBody: {
                query,
                limit,
                total: results.length,
                items: results.map((result) => ({
                    ...result.entry,
                    relevanceScore: result.score,
                })),
                dictionary: (0, mapping_1.getAcordDictionarySummary)(),
            },
        };
    }
    catch (error) {
        context.error("acordSearch error", error);
        return {
            status: 500,
            jsonBody: {
                error: "Failed to search ACORD dictionary",
                details: error?.message || "Unknown error",
            },
        };
    }
}
async function acordLookupByCode(request, context) {
    try {
        const rawCode = request.params.acordCode || "";
        if (!rawCode.trim()) {
            return {
                status: 400,
                jsonBody: { error: "Missing acordCode route parameter" },
            };
        }
        const found = (0, mapping_1.lookupAcordLabel)(rawCode);
        if (!found) {
            return {
                status: 404,
                jsonBody: {
                    error: "ACORD code not found",
                    acordCode: rawCode,
                },
            };
        }
        return {
            status: 200,
            jsonBody: found,
        };
    }
    catch (error) {
        context.error("acordLookupByCode error", error);
        return {
            status: 500,
            jsonBody: {
                error: "Failed to lookup ACORD code",
                details: error?.message || "Unknown error",
            },
        };
    }
}
async function acordAll(_request, context) {
    try {
        const all = (0, mapping_1.listAcordLabels)();
        return {
            status: 200,
            jsonBody: {
                total: all.length,
                dictionary: (0, mapping_1.getAcordDictionarySummary)(),
                items: all,
            },
        };
    }
    catch (error) {
        context.error("acordAll error", error);
        return {
            status: 500,
            jsonBody: {
                error: "Failed to load ACORD dictionary",
                details: error?.message || "Unknown error",
            },
        };
    }
}
async function acordSuggest(request, context) {
    try {
        const body = (await request.json());
        if (!body?.text || !body.text.trim()) {
            return {
                status: 400,
                jsonBody: {
                    error: "Missing text in request body",
                },
            };
        }
        return {
            status: 200,
            jsonBody: (0, mapping_1.suggestAcordLabel)(body.text, body.context),
        };
    }
    catch (error) {
        context.error("acordSuggest error", error);
        return {
            status: 500,
            jsonBody: {
                error: "Failed to suggest ACORD mapping",
                details: error?.message || "Unknown error",
            },
        };
    }
}
functions_1.app.http("acordSearch", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "acord/search",
    handler: acordSearch,
});
functions_1.app.http("acordLabelSearch", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "acord/labels/search",
    handler: acordSearch,
});
functions_1.app.http("opsLabelSearch", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "ops/label-search",
    handler: acordSearch,
});
functions_1.app.http("acordLookupByCode", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "acord/code/{acordCode}",
    handler: acordLookupByCode,
});
functions_1.app.http("acordLabelLookupByCode", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "acord/labels/code/{acordCode}",
    handler: acordLookupByCode,
});
functions_1.app.http("acordAll", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "acord/all",
    handler: acordAll,
});
functions_1.app.http("acordLabelAll", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "acord/labels/all",
    handler: acordAll,
});
functions_1.app.http("opsAcordDictionary", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "ops/acord-dictionary",
    handler: acordAll,
});
functions_1.app.http("acordSuggest", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "acord/suggest",
    handler: acordSuggest,
});
functions_1.app.http("acordLabelSuggest", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "acord/labels/suggest",
    handler: acordSuggest,
});
