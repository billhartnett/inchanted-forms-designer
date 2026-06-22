import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAcordOntology } from "shared/acord";

export async function getAcordOntologyHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: getAcordOntology(),
  };
}

app.http("getAcordOntology", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ontology",
  handler: getAcordOntologyHandler,
});
