import { Db } from 'mongodb';
import { logger } from '../utils/logger';
import { getWeekId } from '../utils/week';
import { takeSnapshot } from '../services/snapshot.service';

// ═══════════════════════════════════════════════════════════
// Snapshot Job - Sunday 23:59 UTC
// Takes a snapshot of all token holders
// ═══════════════════════════════════════════════════════════

export async function runSnapshotJob(db: Db): Promise<void> {
  const weekId = getWeekId();

  logger.info(`[SNAPSHOT JOB] Starting snapshot for week ${weekId}`);

  try {
    const result = await takeSnapshot(db, weekId, (count, cursor) => {
      logger.debug(`[SNAPSHOT JOB] Progress: ${count} holders fetched`);
    });

    logger.info(
      `[SNAPSHOT JOB] Completed: ${result.holdersInserted} holders saved for week ${weekId}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check if it's a duplicate snapshot error (not a real failure)
    if (message.includes('already exists')) {
      logger.warn(`[SNAPSHOT JOB] Snapshot for week ${weekId} already exists, skipping`);
      return;
    }

    logger.error(`[SNAPSHOT JOB] Failed: ${message}`);
    throw error;
  }
}
