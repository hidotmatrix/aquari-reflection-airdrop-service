import { Db, ObjectId } from 'mongodb';
import { Job, JobType, JobStatus, JobLog, JobProgress, createJob } from '../models/Job';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════
// Job Service - MongoDB-based job tracking and execution
// ═══════════════════════════════════════════════════════════

/**
 * Create a new job
 */
export async function createNewJob(
  db: Db,
  type: JobType,
  weekId: string
): Promise<Job> {
  // Check for existing running job of same type/week
  const existing = await db.collection<Job>('jobs').findOne({
    type,
    weekId,
    status: { $in: ['pending', 'running'] },
  });

  if (existing) {
    return existing;
  }

  const job = createJob({ type, weekId });
  const result = await db.collection<Job>('jobs').insertOne(job);
  job._id = result.insertedId;

  logger.info(`Created job ${job._id} - ${type} for ${weekId}`);
  return job;
}

/**
 * Get job by ID
 */
export async function getJobById(db: Db, jobId: string): Promise<Job | null> {
  try {
    return await db.collection<Job>('jobs').findOne({ _id: new ObjectId(jobId) });
  } catch {
    return null;
  }
}

/**
 * Get active jobs
 */
export async function getActiveJobs(db: Db): Promise<Job[]> {
  return db
    .collection<Job>('jobs')
    .find({ status: { $in: ['pending', 'running'] } })
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Get recent jobs
 */
export async function getRecentJobs(db: Db, limit: number = 20): Promise<Job[]> {
  return db
    .collection<Job>('jobs')
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Update job status
 */
export async function updateJobStatus(
  db: Db,
  jobId: ObjectId,
  status: JobStatus,
  error?: string
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'running') {
    update.startedAt = new Date();
  } else if (status === 'completed' || status === 'failed') {
    update.completedAt = new Date();
  }

  if (error) {
    update.error = error;
  }

  await db.collection<Job>('jobs').updateOne(
    { _id: jobId },
    { $set: update }
  );
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  db: Db,
  jobId: ObjectId,
  progress: JobProgress
): Promise<void> {
  await db.collection<Job>('jobs').updateOne(
    { _id: jobId },
    {
      $set: {
        progress,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Add log to job
 */
export async function addJobLog(
  db: Db,
  jobId: ObjectId,
  level: JobLog['level'],
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  const log: JobLog = {
    timestamp: new Date(),
    level,
    message,
    data,
  };

  await db.collection<Job>('jobs').updateOne(
    { _id: jobId },
    {
      $push: { logs: log },
      $set: { updatedAt: new Date() },
    }
  );

  // Also log to console
  const logFn = level === 'error' ? logger.error : level === 'warn' ? logger.warn : logger.info;
  logFn(`[Job ${jobId}] ${message}`, data || '');
}

/**
 * Set job result
 */
export async function setJobResult(
  db: Db,
  jobId: ObjectId,
  result: Record<string, unknown>
): Promise<void> {
  await db.collection<Job>('jobs').updateOne(
    { _id: jobId },
    {
      $set: {
        result,
        updatedAt: new Date(),
      },
    }
  );
}

// ═══════════════════════════════════════════════════════════
// Job Runner Helper - Creates a context for job execution
// ═══════════════════════════════════════════════════════════

export interface JobContext {
  jobId: ObjectId;
  db: Db;
  log: (message: string, data?: Record<string, unknown>) => Promise<void>;
  warn: (message: string, data?: Record<string, unknown>) => Promise<void>;
  error: (message: string, data?: Record<string, unknown>) => Promise<void>;
  success: (message: string, data?: Record<string, unknown>) => Promise<void>;
  setProgress: (current: number, total: number, stage: string) => Promise<void>;
  setResult: (result: Record<string, unknown>) => Promise<void>;
}

export function createJobContext(db: Db, jobId: ObjectId): JobContext {
  return {
    jobId,
    db,
    log: (message, data) => addJobLog(db, jobId, 'info', message, data),
    warn: (message, data) => addJobLog(db, jobId, 'warn', message, data),
    error: (message, data) => addJobLog(db, jobId, 'error', message, data),
    success: (message, data) => addJobLog(db, jobId, 'success', message, data),
    setProgress: async (current, total, stage) => {
      const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
      await updateJobProgress(db, jobId, { current, total, percentage, stage });
    },
    setResult: (result) => setJobResult(db, jobId, result),
  };
}
