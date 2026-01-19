import cron from 'node-cron';
import { Db } from 'mongodb';
import { logger } from '../utils/logger';
import { runSnapshotJob } from './snapshot.job';
import { runCalculateJob } from './calculate.job';
import { runAirdropJob } from './airdrop.job';

// ═══════════════════════════════════════════════════════════
// Job Scheduler - Cron Jobs Initialization
// ═══════════════════════════════════════════════════════════

/*
 * CRON SCHEDULE:
 *
 * JOB 1: SNAPSHOT
 * Schedule: Sunday 23:59 UTC
 * Cron: "59 23 * * 0"
 *
 * JOB 2: CALCULATE
 * Schedule: Monday 00:30 UTC
 * Cron: "30 0 * * 1"
 *
 * JOB 3: AIRDROP
 * Schedule: Monday 01:00 UTC
 * Cron: "0 1 * * 1"
 */

interface ScheduledJob {
  name: string;
  schedule: string;
  task: cron.ScheduledTask | null;
}

const jobs: ScheduledJob[] = [];

export function initializeJobs(db: Db): void {
  logger.info('Initializing cron jobs...');

  // Job 1: Snapshot - Sunday 23:59 UTC
  const snapshotJob = cron.schedule(
    '59 23 * * 0',
    async () => {
      logger.info('Cron triggered: SNAPSHOT');
      try {
        await runSnapshotJob(db);
      } catch (error) {
        logger.error('Snapshot job error:', error);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  jobs.push({ name: 'snapshot', schedule: '59 23 * * 0', task: snapshotJob });
  logger.info('Scheduled: SNAPSHOT job (Sunday 23:59 UTC)');

  // Job 2: Calculate - Monday 00:30 UTC
  const calculateJob = cron.schedule(
    '30 0 * * 1',
    async () => {
      logger.info('Cron triggered: CALCULATE');
      try {
        await runCalculateJob(db);
      } catch (error) {
        logger.error('Calculate job error:', error);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  jobs.push({ name: 'calculate', schedule: '30 0 * * 1', task: calculateJob });
  logger.info('Scheduled: CALCULATE job (Monday 00:30 UTC)');

  // Job 3: Airdrop - Monday 01:00 UTC
  const airdropJob = cron.schedule(
    '0 1 * * 1',
    async () => {
      logger.info('Cron triggered: AIRDROP');
      try {
        await runAirdropJob(db);
      } catch (error) {
        logger.error('Airdrop job error:', error);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  jobs.push({ name: 'airdrop', schedule: '0 1 * * 1', task: airdropJob });
  logger.info('Scheduled: AIRDROP job (Monday 01:00 UTC)');

  logger.info(`Initialized ${jobs.length} cron jobs`);
}

export function stopAllJobs(): void {
  for (const job of jobs) {
    if (job.task) {
      job.task.stop();
      logger.info(`Stopped job: ${job.name}`);
    }
  }
}

export function getJobStatus(): Array<{ name: string; schedule: string; active: boolean }> {
  return jobs.map(job => ({
    name: job.name,
    schedule: job.schedule,
    active: job.task !== null,
  }));
}

// Export individual job runners for manual execution
export { runSnapshotJob } from './snapshot.job';
export { runCalculateJob } from './calculate.job';
export { runAirdropJob } from './airdrop.job';
