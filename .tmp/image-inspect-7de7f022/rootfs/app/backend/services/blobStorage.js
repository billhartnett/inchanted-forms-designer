"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadJsonBlob = loadJsonBlob;
exports.saveJsonBlob = saveJsonBlob;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const storage_blob_1 = require("@azure/storage-blob");
const config_1 = require("./config");
const LOCAL_BLOB_ROOT = node_path_1.default.resolve(__dirname, "../api/__blobstorage__");
function getLocalBlobPath(containerName, blobName) {
    return node_path_1.default.join(LOCAL_BLOB_ROOT, containerName, blobName);
}
async function loadLocalJsonBlob(containerName, blobName) {
    const filePath = getLocalBlobPath(containerName, blobName);
    try {
        return await promises_1.default.readFile(filePath, "utf8");
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}
async function saveLocalJsonBlob(containerName, blobName, payload) {
    const filePath = getLocalBlobPath(containerName, blobName);
    await promises_1.default.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
    const json = JSON.stringify(payload, null, 2);
    await promises_1.default.writeFile(filePath, json, "utf8");
    return {
        blobName,
        url: `file://${filePath.replace(/\\/g, "/")}`,
    };
}
async function streamToString(stream) {
    if (!stream)
        return "";
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
}
async function loadJsonBlob(containerName, blobName) {
    const connectionString = (0, config_1.getStorageConnectionString)();
    if (!connectionString) {
        return loadLocalJsonBlob(containerName, blobName);
    }
    const blobService = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
    const container = blobService.getContainerClient(containerName);
    const blob = container.getBlockBlobClient(blobName);
    if (!(await blob.exists())) {
        return null;
    }
    const download = await blob.download();
    return streamToString(download.readableStreamBody);
}
async function saveJsonBlob(containerName, blobName, payload) {
    const connectionString = (0, config_1.getStorageConnectionString)();
    if (!connectionString) {
        return saveLocalJsonBlob(containerName, blobName, payload);
    }
    const blobService = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
    const container = blobService.getContainerClient(containerName);
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(blobName);
    const json = JSON.stringify(payload, null, 2);
    await blob.upload(json, Buffer.byteLength(json), {
        blobHTTPHeaders: { blobContentType: "application/json" },
    });
    return {
        blobName,
        url: blob.url,
    };
}
