import { Db } from 'mongodb';
import { logger } from '../utils/logger';
import { getWeekId, getPreviousWeekId } from '../utils/week';
import { getSnapshotByWeekId } from '../services/snapshot.service';
import { calculateRewards } from '../services/calculation.service';

// ═══════════════════════════════════════════════════════════
// Calculate Job - Monday 00:30 UTC
// Calculates rewards based on start (prev week) and end (this week) snapshots
// ═══════════════════════════════════════════════════════════

export async function runCalculateJob(db: Db): Promise<void> {
  const currentWeekId = getWeekId();
  const previousWeekId = getPreviousWeekId(currentWeekId);

  logger.info(
    `[CALCULATE JOB] Starting calculation for week ${currentWeekId} (snapshots: ${previousWeekId} -> ${currentWeekId})`
  );

  try {
    // Get start snapshot (previous week)
    const startSnapshot = await getSnapshotByWeekId(db, previousWeekId);
    if (!startSnapshot) {
      throw new Error(`Start snapshot not found for week ${previousWeekId}`);
    }
    if (startSnapshot.status !== 'completed') {
      throw new Error(
        `Start snapshot ${previousWeekId} is not completed (status: ${startSnapshot.status})`
      );
    }

    // Get end snapshot (current week - taken just before this job)
    const endSnapshot = await getSnapshotByWeekId(db, currentWeekId);
    if (!endSnapshot) {
      throw new Error(`End snapshot not found for week ${currentWeekId}`);
    }
    if (endSnapshot.status !== 'completed') {
      throw new Error(
        `End snapshot ${currentWeekId} is not completed (status: ${endSnapshot.status})`
      );
    }

    // Calculate rewards
    const result = await calculateRewards(
      db,
      currentWeekId,
      startSnapshot._id!,
      endSnapshot._id!
    );

    logger.info(
      `[CALCULATE JOB] Completed: ${result.eligibleCount} eligible, ${result.batchCount} batches created`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check if it's a duplicate distribution error
    if (message.includes('already exists')) {
      logger.warn(
        `[CALCULATE JOB] Distribution for week ${currentWeekId} already exists, skipping`
      );
      return;
    }

    logger.error(`[CALCULATE JOB] Failed: ${message}`);
    throw error;
  }
}
