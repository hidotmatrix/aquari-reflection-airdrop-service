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
  startSnapshotId: ObjectId;
  endSnapshotId: ObjectId;
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
  startSnapshotId: ObjectId;
  endSnapshotId: ObjectId;
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
    startSnapshotId: input.startSnapshotId,
    endSnapshotId: input.endSnapshotId,
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
