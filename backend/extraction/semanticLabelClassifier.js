"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifySemanticLabel = classifySemanticLabel;
exports.classifyCategoryMode = classifyCategoryMode;
exports.classifyBlockSemantic = classifyBlockSemantic;
function norm(value) {
    return value.toLowerCase().trim();
}
function classifySemanticLabel(text) {
    const value = norm(text);
    if (!value)
        return "generic";
    if (/\bsignature\b|\bsigned\b|\bauthorized\b/.test(value))
        return "signature";
    if (/\bname\b|\binsured\b|\bapplicant\b|\bproducer\b/.test(value))
        return "person_name";
    if (/\baddress\b|\bcity\b|\bstate\b|\bzip\b|\bpostal\b/.test(value))
        return "address";
    if (/\bdate\b|\bdob\b|\beffective\b|\bexpiration\b/.test(value))
        return "date";
    if (/\$|\bpremium\b|\bdeductible\b|\blimit\b|\bamount\b/.test(value))
        return "currency";
    if (/\bpolicy\b|\bclaim\b|\bvin\b|\bssn\b|\bnumber\b|\bid\b|\bcode\b/.test(value))
        return "identifier";
    if (/\byes\b|\bno\b|\bcheck\b|\bselect\b/.test(value))
        return "boolean_choice";
    if (/\bvehicle\b|\bauto\b|\bvin\b|\bdriver\b/.test(value))
        return "vehicle";
    if (/\bproperty\b|\bdwelling\b|\bpremises\b/.test(value))
        return "property";
    if (/\bpolicy\b|\bcarrier\b|\bterm\b/.test(value))
        return "policy";
    if (/\bcoverage\b|\bliability\b|\bcollision\b|\bcomprehensive\b/.test(value))
        return "coverage";
    return "generic";
}
function classifyCategoryMode(text) {
    const semantic = classifySemanticLabel(text);
    switch (semantic) {
        case "person_name":
        case "address":
            return "party_information";
        case "policy":
        case "identifier":
            return "policy_information";
        case "vehicle":
            return "vehicle_information";
        case "property":
            return "property_information";
        case "coverage":
        case "currency":
            return "coverage_information";
        case "signature":
        case "boolean_choice":
            return "compliance_information";
        default:
            return "general_information";
    }
}
function classifyBlockSemantic(block) {
    return {
        semanticLabel: classifySemanticLabel(block.text),
        categoryMode: classifyCategoryMode(block.text),
    };
}
