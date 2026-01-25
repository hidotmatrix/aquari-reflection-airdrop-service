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
  previous: string;    // Balance from previous snapshot (baseline)
  current: string;     // Balance from current snapshot
  min: string;         // MIN(previous, current) - used for reward calculation
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
  previousBalance: string,
  currentBalance: string,
  minRequired: string
): EligibilityResult {
  const previous = BigInt(previousBalance);
  const current = BigInt(currentBalance);
  const min = BigInt(minRequired);

  // Must hold at both snapshots
  if (previous === 0n) {
    return { isEligible: false, reason: 'Not held in previous snapshot', minBalance: '0' };
  }

  if (current === 0n) {
    return { isEligible: false, reason: 'Not held in current snapshot', minBalance: '0' };
  }

  // Calculate MIN balance (anti-gaming: rewards based on lowest balance between snapshots)
  const minBalance = previous < current ? previous : current;

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
