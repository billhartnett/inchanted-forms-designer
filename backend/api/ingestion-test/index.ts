import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function ingestionTestHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      ok: true,
      endpoint: "ingestion-test",
      message: "Ingestion test endpoint is active",
      checkedAt: new Date().toISOString(),
    },
  };
}

app.http("ingestionTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ingestion-test",
  handler: ingestionTestHandler,
});
