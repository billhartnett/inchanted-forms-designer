import fs from "node:fs/promises";
import path from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";
import { getStorageConnectionString } from "./config";

const LOCAL_BLOB_ROOT = path.resolve(__dirname, "../api/__blobstorage__");

function getLocalBlobPath(containerName: string, blobName: string) {
  return path.join(LOCAL_BLOB_ROOT, containerName, blobName);
}

async function loadLocalJsonBlob(
  containerName: string,
  blobName: string,
): Promise<string | null> {
  const filePath = getLocalBlobPath(containerName, blobName);

  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function saveLocalJsonBlob(
  containerName: string,
  blobName: string,
  payload: unknown,
): Promise<{ blobName: string; url: string }> {
  const filePath = getLocalBlobPath(containerName, blobName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const json = JSON.stringify(payload, null, 2);
  await fs.writeFile(filePath, json, "utf8");

  return {
    blobName,
    url: `file://${filePath.replace(/\\/g, "/")}`,
  };
}

async function streamToString(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (!stream) return "";

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function loadJsonBlob(
  containerName: string,
  blobName: string,
): Promise<string | null> {
  const connectionString = getStorageConnectionString();
  if (!connectionString) {
    return loadLocalJsonBlob(containerName, blobName);
  }

  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  const container = blobService.getContainerClient(containerName);
  const blob = container.getBlockBlobClient(blobName);

  if (!(await blob.exists())) {
    return null;
  }

  const download = await blob.download();
  return streamToString(download.readableStreamBody);
}

export async function saveJsonBlob(
  containerName: string,
  blobName: string,
  payload: unknown,
): Promise<{ blobName: string; url: string }> {
  const connectionString = getStorageConnectionString();
  if (!connectionString) {
    return saveLocalJsonBlob(containerName, blobName, payload);
  }

  const blobService = BlobServiceClient.fromConnectionString(connectionString);
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