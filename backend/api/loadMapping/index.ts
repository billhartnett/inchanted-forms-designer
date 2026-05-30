import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";

export async function loadMapping(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const fileName = request.query.get("fileName");
    if (!fileName) {
      return {
        status: 400,
        jsonBody: { error: "Missing fileName query parameter" }
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

    const blobName = `${fileName}.mapping.json`;
    const blob = container.getBlockBlobClient(blobName);

    if (!(await blob.exists())) {
      return {
        status: 404,
        jsonBody: { error: "Mapping not found", blobName }
      };
    }

    const download = await blob.download();
    const json = await streamToString(download.readableStreamBody);

    return {
      status: 200,
      jsonBody: JSON.parse(json)
    };
  } catch (err: any) {
    context.error("loadMapping error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to load mapping", details: err.message }
    };
  }
}

async function streamToString(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (!stream) return "";
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

app.http("loadMapping", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: loadMapping
});
