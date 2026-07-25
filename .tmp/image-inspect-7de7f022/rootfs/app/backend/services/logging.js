"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logInfo = logInfo;
exports.logWarn = logWarn;
exports.logError = logError;
function logInfo(message, details) {
    console.info(`[backend] ${message}`, details ?? "");
}
function logWarn(message, details) {
    console.warn(`[backend] ${message}`, details ?? "");
}
function logError(message, details) {
    console.error(`[backend] ${message}`, details ?? "");
}
