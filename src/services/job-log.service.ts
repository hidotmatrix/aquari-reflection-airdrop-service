import { Db, ObjectId } from 'mongodb';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════
// Job Log Service - Persistent job tracking in MongoDB
// ═══════════════════════════════════════════════════════════

export interface JobLogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface JobLog {
  _id?: ObjectId;
  jobId: string;
  type: 'snapshot-start' | 'snapshot-end' | 'calculate' | 'airdrop';
  weekId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress?: {
    percentage: number;
    current?: number;
    total?: number;
    stage?: string;
  };
  logs: JobLogEntry[];
  error?: string;
  result?: Record<string, unknown>;
  retryCount: number;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = 'job_logs';

let db: Db | null = null;

/**
 * Initialize the job log service with database connection
 */
export function initializeJobLogService(database: Db): void {
  db = database;
  logger.info('Job log service initialized');
}

/**
 * Get the database instance
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Job log service not initialized - call initializeJobLogService first');
  }
  return db;
}

/**
 * Create a new job log entry when a job is queued
 */
export async function createJobLog(
  jobId: string,
  type: JobLog['type'],
  weekId: string
): Promise<JobLog> {
  const now = new Date();
  const jobLog: JobLog = {
    jobId,
    type,
    weekId,
    status: 'queued',
    logs: [{
      timestamp: now,
      level: 'info',
      message: `Job queued: ${type} for ${weekId}`
    }],
    retryCount: 0,
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const result = await getDb().collection<JobLog>(COLLECTION_NAME).insertOne(jobLog);
  jobLog._id = result.insertedId;

  logger.debug(`Created job log: ${jobId} (${type})`);
  return jobLog;
}

/**
 * Update job status to running
 */
export async function markJobRunning(jobId: string): Promise<void> {
  const now = new Date();
  await getDb().collection<JobLog>(COLLECTION_NAME).updateOne(
    { jobId },
    {
      $set: {
        status: 'running',
        startedAt: now,
        updatedAt: now,
      },
      $push: {
        logs: {
          timestamp: now,
          level: 'info',
          message: 'Job started'
        }
      }
    }
  );
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  progress: JobLog['progress'],
  logMessage?: string
): Promise<void> {
  const now = new Date();
  const update: Record<string, unknown> = {
    $set: {
      progress,
      updatedAt: now,
    }
  };

  if (logMessage) {
    update.$push = {
      logs: {
        timestamp: now,
        level: 'info',
        message: logMessage
      }
    };
  }

  await getDb().collection<JobLog>(COLLECTION_NAME).updateOne(
    { jobId },
    update
  );
}

/**
 * Add a log entry to a job
 */
export async function addJobLogEntry(
  jobId: string,
  level: JobLogEntry['level'],
  message: string
): Promise<void> {
  const now = new Date();
  await getDb().collection<JobLog>(COLLECTION_NAME).updateOne(
    { jobId },
    {
      $set: { updatedAt: now },
      $push: {
        logs: {
          timestamp: now,
          level,
          message
        }
      }
    }
  );
}

/**
 * Mark job as completed
 */
export async function markJobCompleted(
  jobId: string,
  result?: Record<string, unknown>
): Promise<void> {
  const now = new Date();
  await getDb().collection<JobLog>(COLLECTION_NAME).updateOne(
    { jobId },
    {
      $set: {
        status: 'completed',
        completedAt: now,
        updatedAt: now,
        result,
        progress: { percentage: 100 }
      },
      $push: {
        logs: {
          timestamp: now,
          level: 'success',
          message: 'Job completed successfully'
        }
      }
    }
  );
}

/**
 * Mark job as failed
 */
export async function markJobFailed(
  jobId: string,
  error: string
): Promise<void> {
  const now = new Date();
  await getDb().collection<JobLog>(COLLECTION_NAME).updateOne(
    { jobId },
    {
      $set: {
        status: 'failed',
        completedAt: now,
        updatedAt: now,
        error,
      },
      $push: {
        logs: {
          timestamp: now,
          level: 'error',
          message: `Job failed: ${error}`
        }
      }
    }
  );
}

/**
 * Increment retry count
 */
export async function incrementRetryCount(jobId: string): Promise<void> {
  await getDb().collection<JobLog>(COLLECTION_NAME).updateOne(
    { jobId },
    {
      $inc: { retryCount: 1 },
      $set: { updatedAt: new Date() }
    }
  );
}

/**
 * Get job log by job ID
 */
export async function getJobLogByJobId(jobId: string): Promise<JobLog | null> {
  return getDb().collection<JobLog>(COLLECTION_NAME).findOne({ jobId });
}

/**
 * Get job log by MongoDB _id
 */
export async function getJobLogById(id: string): Promise<JobLog | null> {
  try {
    return getDb().collection<JobLog>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  } catch {
    // If id is not a valid ObjectId, try as jobId
    return getJobLogByJobId(id);
  }
}

/**
 * Get recent job logs
 */
export async function getRecentJobLogs(limit: number = 20): Promise<JobLog[]> {
  return getDb().collection<JobLog>(COLLECTION_NAME)
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Get active (running) job logs
 */
export async function getActiveJobLogs(): Promise<JobLog[]> {
  return getDb().collection<JobLog>(COLLECTION_NAME)
    .find({ status: { $in: ['queued', 'running'] } })
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Get job logs for a specific week
 */
export async function getJobLogsByWeek(weekId: string): Promise<JobLog[]> {
  return getDb().collection<JobLog>(COLLECTION_NAME)
    .find({ weekId })
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Get the latest job log for a specific type and week
 */
export async function getLatestJobLog(
  type: JobLog['type'],
  weekId: string
): Promise<JobLog | null> {
  return getDb().collection<JobLog>(COLLECTION_NAME).findOne(
    { type, weekId },
    { sort: { createdAt: -1 } }
  );
}

/**
 * Get job logs by status
 */
export async function getJobLogsByStatus(
  status: JobLog['status'],
  limit: number = 50
): Promise<JobLog[]> {
  return getDb().collection<JobLog>(COLLECTION_NAME)
    .find({ status })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Create indexes for the job_logs collection
 */
export async function createJobLogIndexes(): Promise<void> {
  const collection = getDb().collection(COLLECTION_NAME);

  await Promise.all([
    collection.createIndex({ jobId: 1 }, { unique: true }),
    collection.createIndex({ weekId: 1 }),
    collection.createIndex({ type: 1 }),
    collection.createIndex({ status: 1 }),
    collection.createIndex({ createdAt: -1 }),
    collection.createIndex({ weekId: 1, type: 1, createdAt: -1 }),
  ]);

  logger.info('Job log indexes created');
}

/**
 * Clean up old completed job logs (keep last N days)
 */
export async function cleanupOldJobLogs(daysToKeep: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await getDb().collection<JobLog>(COLLECTION_NAME).deleteMany({
    status: 'completed',
    completedAt: { $lt: cutoffDate }
  });

  if (result.deletedCount > 0) {
    logger.info(`Cleaned up ${result.deletedCount} old job logs`);
  }

  return result.deletedCount;
}
