import { loadJsonBlob, saveJsonBlob } from "../services/blobStorage";
import { buildTenantBlobName } from "./storageKeys";

type SubmissionQueueRecord = {
  tenantId: string;
  queueId: string;
  submissionId: string;
  packageId: string;
  carrierId: string;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string;
  createdAt: string;
};

function queueBlobName(tenantId: string, queueId: string): string {
  return buildTenantBlobName(tenantId, queueId);
}

export async function enqueueSubmissionRetry(record: Omit<SubmissionQueueRecord, "createdAt">): Promise<void> {
  await saveJsonBlob("submission-queue", queueBlobName(record.tenantId, record.queueId), {
    ...record,
    createdAt: new Date().toISOString(),
  });
}

export async function loadQueuedSubmission(tenantId: string, queueId: string): Promise<SubmissionQueueRecord | undefined> {
  const body = await loadJsonBlob("submission-queue", queueBlobName(tenantId, queueId));
  if (!body) return undefined;
  return JSON.parse(body) as SubmissionQueueRecord;
}

export async function moveSubmissionToDeadLetter(
  tenantId: string,
  queueId: string,
  reason: string,
): Promise<void> {
  const record = await loadQueuedSubmission(tenantId, queueId);
  if (!record) return;
  await saveJsonBlob("submission-dead-letter", queueBlobName(tenantId, queueId), {
    ...record,
    deadLetteredAt: new Date().toISOString(),
    reason,
  });
}
