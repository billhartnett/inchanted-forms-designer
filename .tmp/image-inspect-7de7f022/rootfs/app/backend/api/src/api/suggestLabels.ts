import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { suggestAcordLabel } from "../mapping";

type SuggestLabelsRequest = {
  text?: string;
  context?: string;
};

export async function suggestLabels(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as SuggestLabelsRequest;
    if (!body?.text || !body.text.trim()) {
      return {
        status: 400,
        jsonBody: { error: "Missing text in request body" },
      };
    }

    return {
      status: 200,
      jsonBody: suggestAcordLabel(body.text, body.context),
    };
  } catch (err: any) {
    context.error("suggestLabels error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to suggest labels", details: err.message },
    };
  }
}

export default suggestLabels;
