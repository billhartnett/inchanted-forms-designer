import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

import {
  getAllAcordEntries,
  getAcordDictionaryState,
  lookupAcordByCode,
  searchAcordDictionary,
} from "../src/services/acordDictionary";

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

    const results = searchAcordDictionary(query, limit);

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
        dictionary: getAcordDictionaryState(),
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

    const found = lookupAcordByCode(rawCode);
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
    const all = getAllAcordEntries();

    return {
      status: 200,
      jsonBody: {
        total: all.length,
        dictionary: getAcordDictionaryState(),
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

    const combined = `${body.text} ${body.context || ""}`.trim();
    const [best] = searchAcordDictionary(combined, 1);

    if (!best) {
      return {
        status: 200,
        jsonBody: {
          acordCode: "ACORD.UNKNOWN",
          label: "Unknown Field",
          confidenceScore: 0.5,
          source: "ai",
        },
      };
    }

    const confidenceScore = Math.min(0.99, 0.5 + best.score / 300);

    return {
      status: 200,
      jsonBody: {
        acordCode: best.entry.acordCode,
        label: best.entry.label,
        confidenceScore: Number(confidenceScore.toFixed(2)),
        source: "ai",
      },
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

app.http("acordLookupByCode", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "acord/code/{acordCode}",
  handler: acordLookupByCode,
});

app.http("acordAll", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "acord/all",
  handler: acordAll,
});

app.http("acordSuggest", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "acord/suggest",
  handler: acordSuggest,
});
