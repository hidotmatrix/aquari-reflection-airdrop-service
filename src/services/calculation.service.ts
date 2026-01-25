import { Db, ObjectId } from 'mongodb';
import { getConfig } from '../config/env';
import { logger } from '../utils/logger';
import { formatTokenAmount } from '../utils/format';
import {
  Distribution,
  createDistribution,
  Recipient,
  createRecipient,
  calculateEligibility,
  Batch,
  createBatches,
  BatchRecipient,
  SystemConfig,
  createDefaultConfig,
  RewardToken,
} from '../models';
import { getHolderBalanceMap } from './snapshot.service';
import { getWalletTokenBalance, initializeBlockchain, isBlockchainReady } from './blockchain.service';

// ═══════════════════════════════════════════════════════════
// Calculation Service
// ═══════════════════════════════════════════════════════════

export interface CalculationResult {
  distribution: Distribution;
  eligibleCount: number;
  excludedCount: number;
  batchCount: number;
}

/**
 * Calculate rewards based on previous and current snapshots
 */
export async function calculateRewards(
  db: Db,
  weekId: string,
  previousSnapshotId: ObjectId,
  currentSnapshotId: ObjectId
): Promise<CalculationResult> {
  const config = getConfig();
  const startTime = Date.now();

  logger.info(`Calculating rewards for cycle ${weekId}`);

  // Check if distribution already exists
  const existing = await db.collection<Distribution>('distributions').findOne({ weekId });
  if (existing && existing.status === 'completed') {
    throw new Error(`Distribution for cycle ${weekId} already exists`);
  }

  // Get system config (or create default)
  let systemConfig = await db.collection<SystemConfig>('config').findOne({ _id: 'settings' });
  if (!systemConfig) {
    systemConfig = createDefaultConfig();
    await db.collection<SystemConfig>('config').insertOne(systemConfig);
  }

  // Create distribution record (reward pool is TBD - admin sets on approval)
  const distribution = createDistribution({
    weekId,
    previousSnapshotId,
    currentSnapshotId,
    config: {
      minBalance: config.MIN_BALANCE,
      rewardPool: '0', // TBD - admin sets this on approval
      rewardToken: config.REWARD_TOKEN as RewardToken,
      batchSize: config.BATCH_SIZE,
    },
  });
  distribution.status = 'calculating';

  let distributionId: ObjectId;
  if (existing) {
    distributionId = existing._id!;
    await db.collection<Distribution>('distributions').updateOne(
      { _id: distributionId },
      { $set: { ...distribution, _id: distributionId } }
    );
  } else {
    const result = await db.collection<Distribution>('distributions').insertOne(distribution);
    distributionId = result.insertedId;
  }

  try {
    // Get holder balance maps for both snapshots
    const previousSnapshot = await db.collection('snapshots').findOne({ _id: previousSnapshotId });
    const currentSnapshot = await db.collection('snapshots').findOne({ _id: currentSnapshotId });

    if (!previousSnapshot || !currentSnapshot) {
      throw new Error('Previous or current snapshot not found');
    }

    const [previousBalances, currentBalances] = await Promise.all([
      getHolderBalanceMap(db, previousSnapshot.weekId),
      getHolderBalanceMap(db, currentSnapshot.weekId),
    ]);

    // Get all unique addresses from both snapshots
    const allAddresses = new Set([...previousBalances.keys(), ...currentBalances.keys()]);

    // Get excluded addresses from config (LPs, foundation, etc.)
    const configExcludedSet = new Set(
      systemConfig.excludedAddresses.map(a => a.toLowerCase())
    );

    // Get bot-restricted addresses from restricted_addresses collection
    const restrictedAddresses = await db
      .collection<{ address: string }>('restricted_addresses')
      .find({})
      .project({ address: 1 })
      .toArray();

    const botRestrictedSet = new Set(
      restrictedAddresses.map(r => r.address.toLowerCase())
    );

    logger.info(
      `Exclusions: ${configExcludedSet.size} config addresses, ${botRestrictedSet.size} bot-restricted addresses`
    );

    // Calculate eligible holders
    const eligibleHolders: Array<{
      address: string;
      previousBalance: string;
      currentBalance: string;
      minBalance: string;
    }> = [];

    let configExcludedCount = 0;
    let botRestrictedCount = 0;
    let totalEligibleBalance = 0n;

    for (const address of allAddresses) {
      // Skip config-excluded addresses (LPs, foundation, etc.)
      if (configExcludedSet.has(address)) {
        configExcludedCount++;
        continue;
      }

      // Skip bot-restricted addresses (AQUARI antibot)
      if (botRestrictedSet.has(address)) {
        botRestrictedCount++;
        continue;
      }

      const previousBalance = previousBalances.get(address) ?? '0';
      const currentBalance = currentBalances.get(address) ?? '0';

      const eligibility = calculateEligibility(
        previousBalance,
        currentBalance,
        config.MIN_BALANCE
      );

      if (eligibility.isEligible) {
        eligibleHolders.push({
          address,
          previousBalance,
          currentBalance,
          minBalance: eligibility.minBalance,
        });
        totalEligibleBalance += BigInt(eligibility.minBalance);
      }
    }

    const totalExcluded = configExcludedCount + botRestrictedCount;
    logger.info(
      `Found ${eligibleHolders.length} eligible holders (excluded: ${configExcludedCount} config + ${botRestrictedCount} bot-restricted = ${totalExcluded} total)`
    );

    // Clear existing recipients for this distribution
    await db.collection<Recipient>('recipients').deleteMany({ distributionId });

    // Calculate and create recipient records
    // Get wallet token balance as the reward pool
    if (!isBlockchainReady()) {
      initializeBlockchain();
    }

    let rewardPool: bigint;
    if (isBlockchainReady()) {
      const walletBalance = await getWalletTokenBalance();
      rewardPool = BigInt(walletBalance);
      logger.info(`Using wallet balance as reward pool: ${formatTokenAmount(walletBalance, 18, 2)} ${config.REWARD_TOKEN}`);
    } else {
      // Fallback to 1000 AQUARI if blockchain not available
      const DEFAULT_REWARD_POOL = '1000000000000000000000';
      rewardPool = BigInt(DEFAULT_REWARD_POOL);
      logger.warn('Blockchain not initialized, using default 1000 AQUARI reward pool');
    }
    const recipients: Recipient[] = [];
    const batchRecipients: BatchRecipient[] = [];
    let totalDistributed = 0n;

    for (const holder of eligibleHolders) {
      const minBalance = BigInt(holder.minBalance);

      // Calculate reward: (holder's MIN balance / total eligible balance) * reward pool
      const reward = totalEligibleBalance > 0n
        ? (minBalance * rewardPool) / totalEligibleBalance
        : 0n;

      if (reward > 0n) {
        const percentage = Number(minBalance * 10000n / totalEligibleBalance) / 100;

        const recipient = createRecipient({
          distributionId,
          weekId,
          address: holder.address,
          balances: {
            previous: holder.previousBalance,
            current: holder.currentBalance,
            min: holder.minBalance,
          },
          reward: reward.toString(),
          rewardFormatted: `${formatTokenAmount(reward.toString(), 18, 8)} ${config.REWARD_TOKEN}`,
          percentage,
        });

        recipients.push(recipient);
        batchRecipients.push({
          address: holder.address,
          amount: reward.toString(),
        });
        totalDistributed += reward;
      }
    }

    // Insert recipients in batches
    if (recipients.length > 0) {
      const BATCH_SIZE = 1000;
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        await db.collection<Recipient>('recipients').insertMany(batch);
      }
    }

    // Create batches for airdrop execution
    await db.collection<Batch>('batches').deleteMany({ distributionId });

    const batches = createBatches(
      distributionId,
      weekId,
      batchRecipients,
      config.BATCH_SIZE
    );

    if (batches.length > 0) {
      await db.collection<Batch>('batches').insertMany(batches);
    }

    // Update distribution with results
    const durationMs = Date.now() - startTime;
    await db.collection<Distribution>('distributions').updateOne(
      { _id: distributionId },
      {
        $set: {
          status: 'ready',
          stats: {
            totalHolders: allAddresses.size,
            eligibleHolders: eligibleHolders.length,
            excludedHolders: totalExcluded,
            configExcluded: configExcludedCount,
            botRestricted: botRestrictedCount,
            totalEligibleBalance: totalEligibleBalance.toString(),
            totalDistributed: totalDistributed.toString(),
          },
          calculatedAt: new Date(),
        },
      }
    );

    const finalDistribution = await db
      .collection<Distribution>('distributions')
      .findOne({ _id: distributionId });

    logger.info(
      `Calculation completed: ${recipients.length} recipients, ${batches.length} batches, ${durationMs}ms`
    );

    return {
      distribution: finalDistribution!,
      eligibleCount: recipients.length,
      excludedCount: totalExcluded,
      batchCount: batches.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db.collection<Distribution>('distributions').updateOne(
      { _id: distributionId },
      {
        $set: {
          status: 'failed',
          error: errorMessage,
        },
      }
    );

    logger.error(`Calculation failed: ${errorMessage}`);
    throw error;
  }
}

/**
 * Get distribution by week ID
 */
export async function getDistributionByWeekId(
  db: Db,
  weekId: string
): Promise<Distribution | null> {
  return db.collection<Distribution>('distributions').findOne({ weekId });
}

/**
 * Get recipients for a distribution
 */
export async function getRecipientsForDistribution(
  db: Db,
  distributionId: ObjectId,
  limit: number = 100,
  skip: number = 0
): Promise<{ recipients: Recipient[]; total: number }> {
  const [recipients, total] = await Promise.all([
    db
      .collection<Recipient>('recipients')
      .find({ distributionId })
      .sort({ reward: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection<Recipient>('recipients').countDocuments({ distributionId }),
  ]);

  return { recipients, total };
}
