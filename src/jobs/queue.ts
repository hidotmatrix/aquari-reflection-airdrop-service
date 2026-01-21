import { Queue, QueueEvents, ConnectionOptions } from 'bullmq';
import { getConfig } from '../config/env';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════
// Job Queue Manager
// ═══════════════════════════════════════════════════════════

export interface SnapshotJobData {
  weekId: string;
  type: 'start' | 'end' | 'full';
}

export interface SnapshotJobResult {
  success: boolean;
  snapshotId?: string;
  holdersInserted?: number;
  error?: string;
}

let snapshotQueue: Queue<SnapshotJobData, SnapshotJobResult> | null = null;
let snapshotQueueEvents: QueueEvents | null = null;

/**
 * Get Redis connection options
 */
export function getRedisConnection(): ConnectionOptions {
  const config = getConfig();
  return {
    host: new URL(config.REDIS_URL).hostname || 'localhost',
    port: parseInt(new URL(config.REDIS_URL).port || '6379'),
  };
}

/**
 * Get snapshot queue (singleton)
 */
export function getSnapshotQueue(): Queue<SnapshotJobData, SnapshotJobResult> {
  if (!snapshotQueue) {
    const connection = getRedisConnection();
    snapshotQueue = new Queue('snapshot', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          count: 50, // Keep last 50 failed jobs
        },
      },
    });

    logger.info('Snapshot queue initialized');
  }
  return snapshotQueue!;
}

/**
 * Get queue events for listening to job progress
 */
export function getSnapshotQueueEvents(): QueueEvents {
  if (!snapshotQueueEvents) {
    const connection = getRedisConnection();
    snapshotQueueEvents = new QueueEvents('snapshot', { connection });
  }
  return snapshotQueueEvents;
}

/**
 * Add a snapshot job to the queue
 */
export async function queueSnapshotJob(
  weekId: string,
  type: 'start' | 'end' | 'full'
): Promise<string> {
  const queue = getSnapshotQueue();

  // Check if job already exists for this weekId
  const existingJobs = await queue.getJobs(['active', 'waiting', 'delayed']);
  const duplicate = existingJobs.find(
    (job) => job.data.weekId === weekId && job.data.type === type
  );

  if (duplicate) {
    logger.info(`Job already exists for ${weekId} (${type}), returning existing job ID`);
    return duplicate.id!;
  }

  const job = await queue.add(
    `snapshot-${type}`,
    { weekId, type },
    {
      jobId: `snapshot-${weekId}-${type}-${Date.now()}`,
    }
  );

  logger.info(`Queued snapshot job: ${job.id} for ${weekId} (${type})`);
  return job.id!;
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string) {
  const queue = getSnapshotQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;

  return {
    id: job.id,
    data: job.data,
    state,
    progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    returnvalue: job.returnvalue,
  };
}

/**
 * Get all active/waiting snapshot jobs
 */
export async function getActiveJobs() {
  const queue = getSnapshotQueue();
  const [active, waiting, delayed] = await Promise.all([
    queue.getJobs(['active']),
    queue.getJobs(['waiting']),
    queue.getJobs(['delayed']),
  ]);

  return {
    active: active.map((j) => ({
      id: j.id,
      data: j.data,
      progress: j.progress,
      attemptsMade: j.attemptsMade,
    })),
    waiting: waiting.map((j) => ({ id: j.id, data: j.data })),
    delayed: delayed.map((j) => ({ id: j.id, data: j.data })),
  };
}

/**
 * Close all connections
 */
export async function closeQueue(): Promise<void> {
  if (snapshotQueueEvents) {
    await snapshotQueueEvents.close();
    snapshotQueueEvents = null;
  }
  if (snapshotQueue) {
    await snapshotQueue.close();
    snapshotQueue = null;
  }
  logger.info('Queue connections closed');
}
