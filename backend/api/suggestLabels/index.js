"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveMapping = saveMapping;
const functions_1 = require("@azure/functions");
const storage_blob_1 = require("@azure/storage-blob");
const containerName = process.env.MAPPINGS_CONTAINER;
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobService = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
const container = blobService.getContainerClient(containerName);
async function saveMapping(request, context) {
    try {
        const body = (await request.json());
        if (!body?.mappings || !body?.pages || !body?.fileName) {
            return {
                status: 400,
                jsonBody: { error: "Missing mappings, pages, or fileName" }
            };
        }
        const { mappings, pages, fileName } = body;
        const blob = container.getBlockBlobClient(fileName + ".json");
        const payload = JSON.stringify({ mappings, pages }, null, 2);
        await blob.upload(payload, Buffer.byteLength(payload));
        return {
            status: 200,
            jsonBody: { success: true }
        };
    }
    catch (err) {
        context.error("saveMapping error:", err);
        return {
            status: 500,
            jsonBody: { error: "Failed to save mapping", details: err.message }
        };
    }
}
functions_1.app.http("saveMapping", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: saveMapping
});
