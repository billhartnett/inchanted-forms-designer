export function sanitizeStorageSegment(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, "-");
}

export function buildTenantBlobName(tenantId: string, key: string, suffix = ".json"): string {
  return `${sanitizeStorageSegment(tenantId)}/${sanitizeStorageSegment(key)}${suffix}`;
}
