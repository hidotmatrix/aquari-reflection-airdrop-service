import { ObjectId } from 'mongodb';

// ═══════════════════════════════════════════════════════════
// Distribution Model
// ═══════════════════════════════════════════════════════════

export type DistributionStatus =
  | 'pending'
  | 'calculating'
  | 'ready'
  | 'processing'
  | 'completed'
  | 'failed';

export type RewardToken = 'ETH' | 'USDC' | 'AQUARI';

export interface DistributionConfig {
  minBalance: string;
  rewardPool: string;
  rewardToken: RewardToken;
  batchSize: number;
  // Auto-airdrop tracking
  autoApproved?: boolean;
  walletBalanceUsed?: string;  // Wallet balance at time of auto-approval
  autoApprovedAt?: Date;
}

export interface DistributionStats {
  totalHolders: number;
  eligibleHolders: number;
  excludedHolders: number;
  configExcluded?: number;    // LPs, foundation, burn address, etc.
  botRestricted?: number;     // AQUARI antibot restricted addresses
  totalEligibleBalance: string;
  totalDistributed: string;
}

export interface Distribution {
  _id?: ObjectId;
  weekId: string;
  status: DistributionStatus;
  previousSnapshotId: ObjectId;   // Previous cycle's snapshot (baseline)
  currentSnapshotId: ObjectId;    // Current cycle's snapshot
  config: DistributionConfig;
  stats?: DistributionStats;
  createdAt: Date;
  updatedAt?: Date;
  calculatedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface CreateDistributionInput {
  weekId: string;
  previousSnapshotId: ObjectId;   // Previous cycle's snapshot (baseline)
  currentSnapshotId: ObjectId;    // Current cycle's snapshot
  config: DistributionConfig;
}

export interface UpdateDistributionInput {
  status?: DistributionStatus;
  stats?: Partial<DistributionStats>;
  calculatedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// ═══════════════════════════════════════════════════════════
// Factory functions
// ═══════════════════════════════════════════════════════════

export function createDistribution(input: CreateDistributionInput): Distribution {
  return {
    weekId: input.weekId,
    status: 'pending',
    previousSnapshotId: input.previousSnapshotId,
    currentSnapshotId: input.currentSnapshotId,
    config: input.config,
    stats: {
      totalHolders: 0,
      eligibleHolders: 0,
      excludedHolders: 0,
      totalEligibleBalance: '0',
      totalDistributed: '0',
    },
    createdAt: new Date(),
  };
}
