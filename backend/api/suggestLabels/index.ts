import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";

interface SaveMappingRequest {
  mappings: Record<string, any>;
  pages: any[];
  fileName: string;
}

const containerName = process.env.MAPPINGS_CONTAINER!;
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const blobService = BlobServiceClient.fromConnectionString(connectionString);
const container = blobService.getContainerClient(containerName);

export async function saveMapping(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as SaveMappingRequest;

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
  } catch (err: any) {
    context.error("saveMapping error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to save mapping", details: err.message }
    };
  }
}

app.http("saveMapping", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: saveMapping
});
