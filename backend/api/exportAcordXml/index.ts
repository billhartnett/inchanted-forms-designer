import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

interface ExportAcordXmlRequest {
  mappings: Record<string, { acordLabel: string }>;
  pages: Array<{
    lines: Array<{ content: string }>;
  }>;
}

export async function exportAcordXml(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as ExportAcordXmlRequest;

    if (!body?.mappings || !body?.pages) {
      return {
        status: 400,
        jsonBody: { error: "Missing mappings or pages" }
      };
    }

    const { mappings, pages } = body;

    // Build XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ACORD>\n  <InsuranceForm>\n`;

    for (const key of Object.keys(mappings)) {
      const [pageIndex, lineIndex] = key.split("-").map(Number);
      const acordLabel = mappings[key].acordLabel;

      const text = pages[pageIndex].lines[lineIndex].content;

      xml += `    <${acordLabel}>${escapeXml(text)}</${acordLabel}>\n`;
    }

    xml += `  </InsuranceForm>\n</ACORD>`;

    return {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": "attachment; filename=acord.xml"
      },
      body: xml
    };
  } catch (err: any) {
    context.error("exportAcordXml error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to export ACORD XML", details: err.message }
    };
  }
}

function escapeXml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

app.http("exportAcordXml", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: exportAcordXml
});
