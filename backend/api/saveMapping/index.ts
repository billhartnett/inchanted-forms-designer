import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";

export async function saveMapping(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = await request.json();

    if (!body || !body.mappings) {
      return {
        status: 400,
        jsonBody: { error: "Missing mapping payload" }
      };
    }

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      return {
        status: 500,
        jsonBody: { error: "Missing AZURE_STORAGE_CONNECTION_STRING" }
      };
    }

    const blobService = BlobServiceClient.fromConnectionString(connectionString);
    const container = blobService.getContainerClient("mappings");
    await container.createIfNotExists();

    const blobName = `${body.fileName || "form"}.mapping.json`;
    const blob = container.getBlockBlobClient(blobName);

    const json = JSON.stringify(body, null, 2);
    await blob.upload(json, Buffer.byteLength(json), {
      blobHTTPHeaders: { blobContentType: "application/json" }
    });

    return {
      status: 200,
      jsonBody: {
        success: true,
        blobName,
        url: blob.url
      }
    };
  } catch (err: any) {
    context.error("saveMapping error:", err);

    return {
      status: 500,
      jsonBody: {
        error: "Failed to save mapping",
        details: err.message
      }
    };
  }
}

app.http("saveMapping", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: saveMapping
});
