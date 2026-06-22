import { loadJsonBlob, saveJsonBlob } from "../../../services/blobStorage";
import { buildTenantBlobName } from "./storageKeys";

type IdempotencyRecord = {
  key: string;
  tenantId: string;
  requestHash: string;
  response: unknown;
  createdAt: string;
};

export async function loadIdempotentResponse(
  tenantId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<unknown | undefined> {
  const body = await loadJsonBlob("idempotency", buildTenantBlobName(tenantId, idempotencyKey));
  if (!body) return undefined;
  const record = JSON.parse(body) as IdempotencyRecord;
  if (record.requestHash !== requestHash) return undefined;
  return record.response;
}

export async function saveIdempotentResponse(
  tenantId: string,
  idempotencyKey: string,
  requestHash: string,
  response: unknown,
): Promise<void> {
  const record: IdempotencyRecord = {
    key: idempotencyKey,
    tenantId,
    requestHash,
    response,
    createdAt: new Date().toISOString(),
  };
  await saveJsonBlob("idempotency", buildTenantBlobName(tenantId, idempotencyKey), record);
}
