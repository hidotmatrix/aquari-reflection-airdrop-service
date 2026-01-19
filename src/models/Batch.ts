import { ObjectId } from 'mongodb';

// ═══════════════════════════════════════════════════════════
// Batch Model
// ═══════════════════════════════════════════════════════════

export type BatchStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface BatchRecipient {
  address: string;
  amount: string;
}

export interface BatchExecution {
  txHash: string;
  gasUsed: string;
  gasPrice: string;
  blockNumber: number;
  confirmedAt: Date;
}

export interface Batch {
  _id?: ObjectId;
  distributionId: ObjectId;
  weekId: string;
  batchNumber: number;
  recipients: BatchRecipient[];
  recipientCount: number;
  totalAmount: string;
  status: BatchStatus;
  execution?: BatchExecution;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateBatchInput {
  distributionId: ObjectId;
  weekId: string;
  batchNumber: number;
  recipients: BatchRecipient[];
  maxRetries?: number;
}

export interface UpdateBatchInput {
  status?: BatchStatus;
  execution?: BatchExecution;
  retryCount?: number;
  lastError?: string;
  completedAt?: Date;
}

// ═══════════════════════════════════════════════════════════
// Factory functions
// ═══════════════════════════════════════════════════════════

export function createBatch(input: CreateBatchInput): Batch {
  const now = new Date();
  const totalAmount = input.recipients.reduce(
    (sum, r) => sum + BigInt(r.amount),
    0n
  );

  return {
    distributionId: input.distributionId,
    weekId: input.weekId,
    batchNumber: input.batchNumber,
    recipients: input.recipients,
    recipientCount: input.recipients.length,
    totalAmount: totalAmount.toString(),
    status: 'pending',
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    createdAt: now,
    updatedAt: now,
  };
}

// ═══════════════════════════════════════════════════════════
// Batch creation helper
// ═══════════════════════════════════════════════════════════

export function createBatches(
  distributionId: ObjectId,
  weekId: string,
  recipients: BatchRecipient[],
  batchSize: number,
  maxRetries: number = 3
): Batch[] {
  const batches: Batch[] = [];

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batchRecipients = recipients.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    batches.push(
      createBatch({
        distributionId,
        weekId,
        batchNumber,
        recipients: batchRecipients,
        maxRetries,
      })
    );
  }

  return batches;
}
