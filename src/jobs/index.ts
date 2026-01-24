import { Db } from 'mongodb';
import { isRedisRequired } from '../config/redis';
import { logger } from '../utils/logger';
import { initializeScheduler, stopScheduler, getSchedulerState } from './scheduler';

// ═══════════════════════════════════════════════════════════
// Job Scheduler - Entry point for job scheduling
// Delegates to scheduler.ts which handles test/production modes
// ═══════════════════════════════════════════════════════════

/**
 * Initialize all scheduled jobs based on AIRDROP_MODE
 * - test mode: Fast cycles with configurable timing (minutes)
 * - production mode: Weekly cron schedule (Sunday/Monday UTC)
 */
export function initializeJobs(db: Db): void {
  // Log if Redis is not required (development mode)
  if (!isRedisRequired()) {
    logger.info('Redis not required in development mode - jobs will run locally');
  }

  // Initialize the scheduler (handles both test and production modes)
  initializeScheduler(db);
}

/**
 * Stop all scheduled jobs
 */
export function stopAllJobs(): void {
  stopScheduler();
}

// Re-export scheduler functions
export { getSchedulerState } from './scheduler';

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
