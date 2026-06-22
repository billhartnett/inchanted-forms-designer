import type { CarrierSubmissionResponse, SubmissionStatusSnapshot } from "shared/acord";
import { buildSubmissionStatusSnapshot } from "shared/quality";
import { loadJsonBlob, saveJsonBlob } from "../../../services/blobStorage";
import { buildTenantBlobName } from "./storageKeys";

type SubmissionStoreRecord = {
  status: SubmissionStatusSnapshot;
  response?: CarrierSubmissionResponse;
  history: SubmissionStatusSnapshot[];
};

function statusBlobName(tenantId: string, submissionId: string): string {
  return buildTenantBlobName(tenantId, submissionId);
}

async function loadSubmissionRecord(
  tenantId: string,
  submissionId: string,
): Promise<SubmissionStoreRecord | undefined> {
  const body = await loadJsonBlob("submission-status", statusBlobName(tenantId, submissionId));
  if (!body) return undefined;
  return JSON.parse(body) as SubmissionStoreRecord;
}

async function saveSubmissionRecord(
  tenantId: string,
  submissionId: string,
  record: SubmissionStoreRecord,
): Promise<void> {
  await saveJsonBlob("submission-status", statusBlobName(tenantId, submissionId), record);
}

export async function updateSubmissionStatus(input: {
  tenantId: string;
  packageId: string;
  carrierId: string;
  response?: CarrierSubmissionResponse;
}): Promise<SubmissionStoreRecord> {
  const key = input.response?.submissionId || `${input.packageId}:${input.carrierId}`;
  const previous = await loadSubmissionRecord(input.tenantId, key);
  const status = buildSubmissionStatusSnapshot({
    packageId: input.packageId,
    carrierId: input.carrierId,
    response: input.response,
    previous: previous?.status,
  });
  const history = [...(previous?.history || []), status].slice(-200);
  const next = {
    status,
    response: input.response || previous?.response,
    history,
  };
  await saveSubmissionRecord(input.tenantId, key, next);
  return next;
}

export async function getSubmissionStatus(
  tenantId: string,
  submissionId: string,
): Promise<SubmissionStoreRecord | undefined> {
  return loadSubmissionRecord(tenantId, submissionId);
}
