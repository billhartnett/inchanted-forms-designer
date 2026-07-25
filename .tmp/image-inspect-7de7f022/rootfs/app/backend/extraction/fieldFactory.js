"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTypedField = buildTypedField;
exports.buildTypedFields = buildTypedFields;
function buildTypedField(block, inference) {
    const common = {
        id: block.id,
        pageIndex: Math.max(0, block.page - 1),
        x: block.boundingBox.x,
        y: block.boundingBox.y,
        width: block.boundingBox.width,
        height: block.boundingBox.height,
        rotation: 0,
        opacity: 1,
        groupId: null,
        metadata: {
            acordCode: "",
            acordLabel: "",
            acordDescription: "",
            fieldType: inference.fieldType,
            required: false,
            confidenceScore: block.confidence,
            source: "ocr",
        },
    };
    if (inference.fieldType === "numeric") {
        return {
            ...common,
            type: "numeric",
            stroke: "#1e293b",
            strokeWidth: 1,
            fill: "#ffffff",
            min: 0,
            max: 100,
            step: 1,
            value: null,
            placeholder: "0",
        };
    }
    if (inference.fieldType === "date") {
        return {
            ...common,
            type: "date",
            stroke: "#1e293b",
            strokeWidth: 1,
            fill: "#ffffff",
            dateFormat: "MM/DD/YYYY",
            value: "",
            placeholder: "Pick a date",
        };
    }
    if (inference.fieldType === "checkbox") {
        return {
            ...common,
            type: "checkbox",
            stroke: "#1e293b",
            strokeWidth: 1,
            fill: "#ffffff",
            checked: false,
            label: block.text,
        };
    }
    if (inference.fieldType === "radio") {
        return {
            ...common,
            type: "radio",
            stroke: "#1e293b",
            strokeWidth: 1,
            fill: "#ffffff",
            checked: false,
            groupName: "radio-group",
            label: block.text,
        };
    }
    if (inference.fieldType === "signature") {
        return {
            ...common,
            type: "signature",
            stroke: "#1e293b",
            strokeWidth: 1,
            fill: "#ffffff",
            placeholder: "Sign here",
            signed: false,
            showStrokePreview: false,
        };
    }
    return {
        ...common,
        type: "text",
        text: block.text,
        fontSize: 14,
        fontFamily: "Geist Variable",
        textAlign: "left",
        color: "#0f172a",
        stroke: "#1e293b",
        strokeWidth: 0,
    };
}
function buildTypedFields(blocks, inferences) {
    const inferenceByBlockId = new Map(inferences.map((item) => [item.blockId, item]));
    return blocks
        .map((block) => {
        const inference = inferenceByBlockId.get(block.id);
        return inference ? buildTypedField(block, inference) : null;
    })
        .filter((field) => Boolean(field));
}
