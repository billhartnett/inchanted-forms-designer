import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

import {
  getAcordDictionarySummary,
  listAcordLabels,
  lookupAcordLabel,
  searchAcordLabels,
  suggestAcordLabel,
} from "../../mapping";

type SuggestRequest = {
  text: string;
  context?: string;
};

function parseLimit(value: string | null): number {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function acordSearch(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const query = request.query.get("query") || "";
    const limit = parseLimit(request.query.get("limit"));

    if (!query.trim()) {
      return {
        status: 400,
        jsonBody: {
          error: "Missing query parameter",
        },
      };
    }

    const results = searchAcordLabels(query, limit);

    return {
      status: 200,
      jsonBody: {
        query,
        limit,
        total: results.length,
        items: results.map((result) => ({
          ...result.entry,
          relevanceScore: result.score,
        })),
        dictionary: getAcordDictionarySummary(),
      },
    };
  } catch (error: any) {
    context.error("acordSearch error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to search ACORD dictionary",
        details: error?.message || "Unknown error",
      },
    };
  }
}

export async function acordLookupByCode(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const rawCode = request.params.acordCode || "";
    if (!rawCode.trim()) {
      return {
        status: 400,
        jsonBody: { error: "Missing acordCode route parameter" },
      };
    }

    const found = lookupAcordLabel(rawCode);
    if (!found) {
      return {
        status: 404,
        jsonBody: {
          error: "ACORD code not found",
          acordCode: rawCode,
        },
      };
    }

    return {
      status: 200,
      jsonBody: found,
    };
  } catch (error: any) {
    context.error("acordLookupByCode error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to lookup ACORD code",
        details: error?.message || "Unknown error",
      },
    };
  }
}

export async function acordAll(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const all = listAcordLabels();

    return {
      status: 200,
      jsonBody: {
        total: all.length,
        dictionary: getAcordDictionarySummary(),
        items: all,
      },
    };
  } catch (error: any) {
    context.error("acordAll error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to load ACORD dictionary",
        details: error?.message || "Unknown error",
      },
    };
  }
}

export async function acordSuggest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as SuggestRequest;
    if (!body?.text || !body.text.trim()) {
      return {
        status: 400,
        jsonBody: {
          error: "Missing text in request body",
        },
      };
    }

    return {
      status: 200,
      jsonBody: suggestAcordLabel(body.text, body.context),
    };
  } catch (error: any) {
    context.error("acordSuggest error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to suggest ACORD mapping",
        details: error?.message || "Unknown error",
      },
    };
  }
}

app.http("acordSearch", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "acord/search",
  handler: acordSearch,
});

app.http("acordLabelSearch", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "acord/labels/search",
  handler: acordSearch,
});

app.http("opsLabelSearch", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ops/label-search",
  handler: acordSearch,
});

app.http("acordLookupByCode", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "acord/code/{acordCode}",
  handler: acordLookupByCode,
});

app.http("acordLabelLookupByCode", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "acord/labels/code/{acordCode}",
  handler: acordLookupByCode,
});

app.http("acordAll", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "acord/all",
  handler: acordAll,
});

app.http("acordLabelAll", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "acord/labels/all",
  handler: acordAll,
});

app.http("opsAcordDictionary", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ops/acord-dictionary",
  handler: acordAll,
});

app.http("acordSuggest", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "acord/suggest",
  handler: acordSuggest,
});

app.http("acordLabelSuggest", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "acord/labels/suggest",
  handler: acordSuggest,
});
