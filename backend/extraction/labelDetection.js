"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLabel = detectLabel;
exports.detectLabels = detectLabels;
function normalizeText(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function detectLabel(block) {
    const normalizedText = normalizeText(block.text);
    const cues = [];
    if (/[\:]$/.test(block.text.trim())) {
        cues.push("trailing-colon");
    }
    if (/(name|address|city|state|zip|policy|insured|applicant|date|email|phone)/.test(normalizedText)) {
        cues.push("field-cue-token");
    }
    const isInstruction = /^(if yes|if no|describe|list |please explain)/.test(normalizedText) || /[?]$/.test(block.text.trim());
    if (isInstruction) {
        return {
            blockId: block.id,
            normalizedText,
            isLabel: false,
            cues,
            rejectedReason: "instruction-or-question",
        };
    }
    return {
        blockId: block.id,
        normalizedText,
        isLabel: cues.length > 0,
        cues,
        rejectedReason: cues.length > 0 ? undefined : "no-label-cues",
    };
}
function detectLabels(blocks) {
    return blocks.map(detectLabel);
}
