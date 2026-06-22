import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getCarrierAdapterBundles } from "shared/quality";

type GetCarrierSemanticAdaptersRequest = {
  familyId?: string;
};

export async function getCarrierSemanticAdaptersHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json().catch(() => ({}))) as GetCarrierSemanticAdaptersRequest;
    const familyId =
      body.familyId || request.query.get("familyId") || request.query.get("family") || undefined;

    return {
      status: 200,
      jsonBody: {
        familyId: familyId || "default",
        bundles: getCarrierAdapterBundles(familyId),
      },
    };
  } catch (error: any) {
    context.error("getCarrierSemanticAdapters error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to retrieve carrier semantic adapters",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("getCarrierSemanticAdapters", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "carrier/adapters",
  handler: getCarrierSemanticAdaptersHandler,
});
