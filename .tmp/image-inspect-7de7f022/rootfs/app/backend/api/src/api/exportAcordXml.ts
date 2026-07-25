import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  buildAcordXmlFromPayload,
  type ExportAcordXmlResponse,
} from "../mapping/acordXml";
import type { MappingPersistencePayload } from "../types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";

type ExportAcordXmlRequest = MappingPersistencePayload & {
  suppressedOcrBlockIds?: string[];
};

export async function exportAcordXml(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as ExportAcordXmlRequest;

    const validated = validateMappingPersistencePayload({
      ...body,
      suppressedOcrBlockIds: body.suppressedOcrBlockIds || [],
    });
    if (!validated.valid) {
      const error = "error" in validated ? validated.error : "Invalid mapping payload";
      return {
        status: 400,
        jsonBody: { error }
      };
    }

    const result: ExportAcordXmlResponse = buildAcordXmlFromPayload(validated.payload, {
      suppressedOcrBlockIds: body.suppressedOcrBlockIds,
    });

    return {
      status: 200,
      jsonBody: result,
    };
  } catch (err: any) {
    context.error("exportAcordXml error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to export ACORD XML", details: err.message }
    };
  }
}

export default exportAcordXml;
