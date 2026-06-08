import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  AzureKeyCredential,
  DocumentAnalysisClient,
} from "@azure/ai-form-recognizer";

function createClient() {
  const endpoint = process.env.DI_ENDPOINT;
  const key = process.env.DI_KEY;

  if (!endpoint || !key) {
    throw new Error(
      "Document Intelligence is not configured. Set DI_ENDPOINT and DI_KEY in local.settings.json.",
    );
  }

  return new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
}

export async function extractText(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const client = createClient();
    const form = await req.formData();
    const file = form.get("file") as File;

    if (!file) {
      return { status: 400, jsonBody: { error: "No file uploaded" } };
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Use the prebuilt layout model for text + bounding boxes
    const poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
    const result = await poller.pollUntilDone();

    const pages =
      result.pages?.map((page) => ({
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        unit: page.unit,
        lines: page.lines?.map((line) => ({
          content: line.content,
          boundingBox: line.polygon,
        })),
      })) ?? [];

    return {
      status: 200,
      jsonBody: {
        pages,
        raw: result, // optional: useful for debugging
      },
    };
  } catch (err: any) {
    context.error("extractText error:", err);
    return { status: 500, jsonBody: { error: err.message } };
  }
}

app.http("extractText", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: extractText,
});
