/**
 * TODO: implement queue-backed async extraction orchestration for large PDFs.
 * The current platform runs inline requests, but the architecture reserves
 * this module for long-running extraction and mapping jobs.
 */
export type QueueJob = {
  queueName: string;
  payload: Record<string, unknown>;
};

export async function enqueueJob(_job: QueueJob): Promise<void> {
  return Promise.resolve();
}