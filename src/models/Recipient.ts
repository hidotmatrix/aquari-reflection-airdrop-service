import { ObjectId } from 'mongodb';

// ═══════════════════════════════════════════════════════════
// Recipient Model
// ═══════════════════════════════════════════════════════════

export type RecipientStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface RecipientBalances {
  start: string;
  end: string;
  min: string;
}

export interface Recipient {
  _id?: ObjectId;
  distributionId: ObjectId;
  weekId: string;
  address: string;
  balances: RecipientBalances;
  reward: string;
  rewardFormatted: string;
  percentage: number;
  status: RecipientStatus;
  batchId?: ObjectId;
  batchNumber?: number;
  txHash?: string;
  error?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateRecipientInput {
  distributionId: ObjectId;
  weekId: string;
  address: string;
  balances: RecipientBalances;
  reward: string;
  rewardFormatted: string;
  percentage: number;
}

export interface UpdateRecipientInput {
  status?: RecipientStatus;
  batchId?: ObjectId;
  batchNumber?: number;
  txHash?: string;
  error?: string;
  retryCount?: number;
  completedAt?: Date;
}

// ═══════════════════════════════════════════════════════════
// Factory functions
// ═══════════════════════════════════════════════════════════

export function createRecipient(input: CreateRecipientInput): Recipient {
  const now = new Date();
  return {
    distributionId: input.distributionId,
    weekId: input.weekId,
    address: input.address.toLowerCase(),
    balances: input.balances,
    reward: input.reward,
    rewardFormatted: input.rewardFormatted,
    percentage: input.percentage,
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ═══════════════════════════════════════════════════════════
// Eligibility calculation helpers
// ═══════════════════════════════════════════════════════════

export interface EligibilityResult {
  isEligible: boolean;
  reason?: string;
  minBalance: string;
}

export function calculateEligibility(
  startBalance: string,
  endBalance: string,
  minRequired: string
): EligibilityResult {
  const start = BigInt(startBalance);
  const end = BigInt(endBalance);
  const min = BigInt(minRequired);

  // Must hold at both snapshots
  if (start === 0n) {
    return { isEligible: false, reason: 'Not held at week start', minBalance: '0' };
  }

  if (end === 0n) {
    return { isEligible: false, reason: 'Not held at week end', minBalance: '0' };
  }

  // Calculate MIN balance
  const minBalance = start < end ? start : end;

  // Must meet minimum requirement
  if (minBalance < min) {
    return {
      isEligible: false,
      reason: `Below minimum (${minBalance} < ${min})`,
      minBalance: minBalance.toString(),
    };
  }

  return {
    isEligible: true,
    minBalance: minBalance.toString(),
  };
}
