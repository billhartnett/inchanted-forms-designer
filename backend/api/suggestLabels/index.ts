import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import OpenAI from "openai";
import acord from "../../../shared/acord.json";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!
});

// Define the expected request body shape
interface SuggestLabelsRequest {
    textBlocks: Array<{ content: string; boundingBox?: any }>;
}

export async function suggestLabels(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const body = (await req.json()) as SuggestLabelsRequest;
        const { textBlocks } = body;

        if (!textBlocks || !Array.isArray(textBlocks)) {
            return { status: 400, jsonBody: { error: "textBlocks[] is required" } };
        }

        // Prepare ACORD dictionary for the model
        const acordFields = acord.map(a => `${a.label}: ${a.description}`).join("\n");

        const prompt = `
You are an ACORD insurance forms expert. 
Your job is to map extracted form text to ACORD eLabels.

ACORD Fields:
${acordFields}

For each text block, return:
- bestMatch: the most likely ACORD label
- confidence: 0–1
- candidates: array of { label, confidence }
- reason: short explanation

Respond ONLY in JSON.

Text Blocks:
${JSON.stringify(textBlocks, null, 2)}
        `;

        const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You map text to ACORD eLabels." },
                { role: "user", content: prompt }
            ]
        });

        const json = JSON.parse(response.choices[0].message.content);

        return {
            status: 200,
            jsonBody: json
        };

    } catch (err: any) {
        context.error("suggestLabels error:", err);
        return { status: 500, jsonBody: { error: err.message } };
    }
}

app.http("suggestLabels", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: suggestLabels
});
