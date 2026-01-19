import cron from 'node-cron';
import { Db } from 'mongodb';
import { isRedisRequired } from '../config/redis';
import { logger } from '../utils/logger';
import { runSnapshotJob } from './snapshot.job';
import { runCalculateJob } from './calculate.job';
import { runAirdropJob } from './airdrop.job';

// ═══════════════════════════════════════════════════════════
// Job Scheduler - Manages all cron jobs
// ═══════════════════════════════════════════════════════════

const jobs: cron.ScheduledTask[] = [];

/**
 * Initialize all scheduled jobs
 */
export function initializeJobs(db: Db): void {
  // Log if Redis is not required (development mode)
  if (!isRedisRequired()) {
    logger.info('Redis not required in development mode - cron jobs will run locally');
  }

  // Sunday 23:59 UTC - Take weekly snapshot
  const snapshotJob = cron.schedule(
    '59 23 * * 0', // Sunday 23:59
    async () => {
      logger.info('[SCHEDULER] Running snapshot job');
      try {
        await runSnapshotJob(db);
      } catch (error) {
        logger.error('[SCHEDULER] Snapshot job failed:', error);
      }
    },
    { timezone: 'UTC' }
  );
  jobs.push(snapshotJob);

  // Monday 00:30 UTC - Calculate rewards
  const calculationJob = cron.schedule(
    '30 0 * * 1', // Monday 00:30
    async () => {
      logger.info('[SCHEDULER] Running calculation job');
      try {
        await runCalculateJob(db);
      } catch (error) {
        logger.error('[SCHEDULER] Calculation job failed:', error);
      }
    },
    { timezone: 'UTC' }
  );
  jobs.push(calculationJob);

  // Monday 01:00 UTC - Execute airdrops
  const airdropJob = cron.schedule(
    '0 1 * * 1', // Monday 01:00
    async () => {
      logger.info('[SCHEDULER] Running airdrop job');
      try {
        await runAirdropJob(db);
      } catch (error) {
        logger.error('[SCHEDULER] Airdrop job failed:', error);
      }
    },
    { timezone: 'UTC' }
  );
  jobs.push(airdropJob);

  logger.info('Scheduled jobs initialized:');
  logger.info('  - Snapshot: Sunday 23:59 UTC');
  logger.info('  - Calculation: Monday 00:30 UTC');
  logger.info('  - Airdrop: Monday 01:00 UTC');
}

/**
 * Stop all scheduled jobs
 */
export function stopAllJobs(): void {
  jobs.forEach((job) => job.stop());
  jobs.length = 0;
  logger.info('All scheduled jobs stopped');
}

// Re-export queue functions for manual triggering
export {
  getRedisConnection,
  getSnapshotQueue,
  getSnapshotQueueEvents,
  queueSnapshotJob,
  getJobStatus,
  getActiveJobs,
  closeQueue,
  type SnapshotJobData,
  type SnapshotJobResult,
} from './queue';

export { startWorker, stopWorker } from './snapshot.worker';
