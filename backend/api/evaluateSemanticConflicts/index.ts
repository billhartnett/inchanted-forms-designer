import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { resolveSemanticConflicts } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateSemanticConflictsRequest = {
  payload?: MappingPersistencePayload;
  familyId?: string;
};

export async function evaluateSemanticConflictsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateSemanticConflictsRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    return {
      status: 200,
      jsonBody: resolveSemanticConflicts(validated.payload, {
        familyId: body.familyId,
      }),
    };
  } catch (error: any) {
    context.error("evaluateSemanticConflicts error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate semantic conflicts",
        details: error?.message,
      },
    };
  }
}

app.http("evaluateSemanticConflicts", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "conflicts/semantic",
  handler: evaluateSemanticConflictsHandler,
});
