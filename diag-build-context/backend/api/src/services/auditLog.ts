import type { ImmutableAuditEvent } from "shared/acord";
import { saveJsonBlob, loadJsonBlob } from "../services/blobStorage";
import { buildTenantBlobName, sanitizeStorageSegment } from "./storageKeys";

type AuditInput = Omit<ImmutableAuditEvent, "eventId" | "occurredAt" | "hash"> & {
  payloadHashSeed: string;
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((a, b) => a[0].localeCompare(b[0]));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function appendImmutableAuditEvent(input: AuditInput): Promise<ImmutableAuditEvent> {
  const occurredAt = new Date().toISOString();
  const hash = hashString(stableSerialize({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    domain: input.domain,
    action: input.action,
    objectId: input.objectId,
    payloadHashSeed: input.payloadHashSeed,
    occurredAt,
  }));
  const eventId = `${input.tenantId}:${input.domain}:${occurredAt}:${hash}`;
  const event: ImmutableAuditEvent = {
    eventId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    domain: input.domain,
    action: input.action,
    objectId: input.objectId,
    hash,
    occurredAt,
    lineage: [...input.lineage, `audit.eventId=${eventId}`],
  };

  await saveJsonBlob("audit-logs", buildTenantBlobName(input.tenantId, eventId), event);
  return event;
}

export async function loadTenantAuditEvents(tenantId: string): Promise<ImmutableAuditEvent[]> {
  // Local blob fallback does not support list. Keep deterministic lightweight path via index blob.
  const indexBlobName = `${tenantId}/index.json`;
  const existing = await loadJsonBlob("audit-logs", indexBlobName);
  const index = existing ? (JSON.parse(existing) as string[]) : [];
  const events: ImmutableAuditEvent[] = [];
  for (const entry of index) {
    const body = await loadJsonBlob("audit-logs", buildTenantBlobName(tenantId, entry));
    if (!body) continue;
    events.push(JSON.parse(body) as ImmutableAuditEvent);
  }
  return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function appendAuditIndex(tenantId: string, eventId: string): Promise<void> {
  const indexBlobName = `${sanitizeStorageSegment(tenantId)}/index.json`;
  const existing = await loadJsonBlob("audit-logs", indexBlobName);
  const index = existing ? (JSON.parse(existing) as string[]) : [];
  const next = Array.from(new Set([...index, eventId])).sort((a, b) => a.localeCompare(b));
  await saveJsonBlob("audit-logs", indexBlobName, next);
}
