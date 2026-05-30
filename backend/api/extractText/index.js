"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractText = extractText;
const functions_1 = require("@azure/functions");
const openai_1 = __importDefault(require("openai"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
async function extractText(req, context) {
    try {
        const form = await req.formData();
        const file = form.get("file");
        if (!file) {
            return { status: 400, jsonBody: { error: "No file uploaded" } };
        }
        // Convert to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // Write to a temporary file
        const tempPath = path.join(process.cwd(), "temp-upload");
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath);
        }
        const tempFile = path.join(tempPath, file.name);
        fs.writeFileSync(tempFile, buffer);
        // Upload using fs.ReadStream (required by OpenAI v6)
        const uploaded = await openai.files.create({
            file: fs.createReadStream(tempFile),
            purpose: "assistants"
        });
        // Ask GPT‑4o‑mini to extract text
        const prompt = "Extract all text from the uploaded document. File ID: " + uploaded.id;
        const result = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        });
        const text = result.choices[0].message.content;
        // Clean up temp file
        fs.unlinkSync(tempFile);
        return { jsonBody: { text } };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        context.error("extractText error:", err);
        return { status: 500, jsonBody: { error: message } };
    }
}
functions_1.app.http("extractText", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: extractText
});
