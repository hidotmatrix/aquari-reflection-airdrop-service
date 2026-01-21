import { Db } from 'mongodb';
import { logger } from '../utils/logger';
import { getWeekId } from '../utils/week';
import { getDistributionByWeekId } from '../services/calculation.service';
import { processDistribution } from '../services/airdrop.service';

// ═══════════════════════════════════════════════════════════
// Airdrop Job - Monday 01:00 UTC
// Processes all ready distributions and executes batch airdrops
// ═══════════════════════════════════════════════════════════

export async function runAirdropJob(db: Db): Promise<void> {
  const currentWeekId = getWeekId();

  logger.info(`[AIRDROP JOB] Starting airdrop processing for week ${currentWeekId}`);

  try {
    // Get current week's distribution
    const distribution = await getDistributionByWeekId(db, currentWeekId);

    if (!distribution) {
      logger.warn(`[AIRDROP JOB] No distribution found for week ${currentWeekId}`);
      return;
    }

    if (distribution.status === 'completed') {
      logger.info(
        `[AIRDROP JOB] Distribution for week ${currentWeekId} already completed`
      );
      return;
    }

    if (distribution.status !== 'ready' && distribution.status !== 'processing') {
      logger.warn(
        `[AIRDROP JOB] Distribution ${currentWeekId} not ready (status: ${distribution.status})`
      );
      return;
    }

    // Process the distribution
    const result = await processDistribution(db, distribution._id!);

    logger.info(
      `[AIRDROP JOB] Completed: ${result.processedBatches} batches processed, ${result.failedBatches} failed`
    );

    if (result.failedBatches > 0) {
      logger.warn(
        `[AIRDROP JOB] ${result.failedBatches} batches failed - manual intervention may be required`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[AIRDROP JOB] Failed: ${message}`);
    throw error;
  }
}
