import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getCrossFormUnificationGraph } from "shared/quality";

export async function getUnificationGraphHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    return {
      status: 200,
      jsonBody: getCrossFormUnificationGraph(),
    };
  } catch (error: any) {
    context.error("getUnificationGraph error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to retrieve unification graph",
        details: error?.message,
      },
    };
  }
}

export default getUnificationGraphHandler;
