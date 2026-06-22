"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestLabels = suggestLabels;
const functions_1 = require("@azure/functions");
const mapping_1 = require("../../mapping");
async function suggestLabels(request, context) {
    try {
        const body = (await request.json());
        if (!body?.text || !body.text.trim()) {
            return {
                status: 400,
                jsonBody: { error: "Missing text in request body" },
            };
        }
        return {
            status: 200,
            jsonBody: (0, mapping_1.suggestAcordLabel)(body.text, body.context),
        };
    }
    catch (err) {
        context.error("suggestLabels error:", err);
        return {
            status: 500,
            jsonBody: { error: "Failed to suggest labels", details: err.message },
        };
    }
}
functions_1.app.http("suggestLabels", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "suggestLabels",
    handler: suggestLabels,
});
