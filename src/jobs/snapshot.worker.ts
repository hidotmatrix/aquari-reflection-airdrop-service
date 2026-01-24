import { Worker, Job, ConnectionOptions } from 'bullmq';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { getConfig, getTokenAddress } from '../config/env';
import { logger } from '../utils/logger';
import { SnapshotJobData, SnapshotJobResult } from './queue';
import { Snapshot, Holder, fromMoralisResponse } from '../models';
import { fetchHoldersPage, fetchMockHolders } from '../services/moralis.service';
import { getWeekId } from '../utils/week';
import { calculateRewards } from '../services/calculation.service';
import {
  initializeJobLogService,
  createJobLog,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  updateJobProgress,
  addJobLogEntry,
  JobLog,
} from '../services/job-log.service';

/**
 * Get Redis connection options for worker
 */
function getWorkerRedisConnection(): ConnectionOptions {
  const config = getConfig();
  return {
    host: new URL(config.REDIS_URL).hostname || 'localhost',
    port: parseInt(new URL(config.REDIS_URL).port || '6379'),
  };
}

// ═══════════════════════════════════════════════════════════
// Snapshot Worker - Processes snapshot jobs from the queue
// ═══════════════════════════════════════════════════════════

let db: Db | null = null;
let mongoClient: MongoClient | null = null;

/**
 * Get database connection
 */
async function getDb(): Promise<Db> {
  if (!db) {
    const config = getConfig();
    mongoClient = new MongoClient(config.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();
    logger.info('Worker connected to MongoDB');

    // Initialize job log service with the database
    initializeJobLogService(db);
  }
  return db;
}

/**
 * Helper to determine job type from SnapshotJobData
 */
function getJobType(data: SnapshotJobData): JobLog['type'] {
  if (data.type === 'start') return 'snapshot-start';
  if (data.type === 'end') return 'snapshot-end';
  // 'full' type runs both snapshots, defaults to snapshot-start for logging
  return 'snapshot-start';
}

/**
 * Process a snapshot job
 */
async function processSnapshotJob(
  job: Job<SnapshotJobData, SnapshotJobResult>
): Promise<SnapshotJobResult> {
  const { weekId, type } = job.data;
  const config = getConfig();
  const database = await getDb();
  const jobId = job.id || `job-${Date.now()}`;

  logger.info(`════════════════════════════════════════════════════════════`);
  logger.info(`Processing snapshot job: ${jobId}`);
  logger.info(`  Week ID: ${weekId}, Type: ${type}`);
  logger.info(`════════════════════════════════════════════════════════════`);

  // Create job log entry in MongoDB
  const jobType = getJobType(job.data);
  try {
    await createJobLog(jobId, jobType, weekId);
    await markJobRunning(jobId);
  } catch (err) {
    // Job log might already exist if retrying
    logger.debug('Job log entry might already exist:', err);
    await markJobRunning(jobId);
  }

  try {
    let result: SnapshotJobResult;

    // For full flow, process both start and end snapshots, then calculate
    if (type === 'full') {
      result = await processFullFlow(job, database, jobId);
    } else {
      // Single snapshot processing
      const snapshotWeekId = `${weekId}-${type}`;
      result = await processSingleSnapshot(job, database, snapshotWeekId, jobId);
    }

    // Mark job as completed in MongoDB
    await markJobCompleted(jobId, { ...result });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markJobFailed(jobId, errorMessage);
    throw error;
  }
}

/**
 * Process a single snapshot (start or end)
 */
async function processSingleSnapshot(
  job: Job<SnapshotJobData, SnapshotJobResult>,
  database: Db,
  snapshotWeekId: string,
  jobId: string
): Promise<SnapshotJobResult> {
  const config = getConfig();
  const startTime = Date.now();

  // Check if snapshot already exists and is completed
  const existing = await database.collection<Snapshot>('snapshots').findOne({
    weekId: snapshotWeekId,
  });

  if (existing && existing.status === 'completed') {
    logger.info(`Snapshot ${snapshotWeekId} already completed with ${existing.totalHolders} holders`);
    return {
      success: true,
      snapshotId: existing._id!.toString(),
      holdersInserted: existing.totalHolders,
    };
  }

  // Create or update snapshot record
  let snapshotId: ObjectId;
  let resumeCursor: string | null = null;
  let existingHolderCount = 0;

  if (existing) {
    snapshotId = existing._id!;

    // Resume from where we left off
    if (existing.status === 'in_progress' && existing.progress?.lastCursor) {
      resumeCursor = existing.progress.lastCursor;
      existingHolderCount = existing.progress.insertedCount || 0;
      logger.info(`Resuming snapshot from cursor, already have ${existingHolderCount} holders`);
    } else if (existing.status === 'failed') {
      // Reset for fresh start after failure
      await database.collection<Holder>('holders').deleteMany({ weekId: snapshotWeekId });
      logger.info(`Cleared holders for failed snapshot, starting fresh`);
    }

    await database.collection<Snapshot>('snapshots').updateOne(
      { _id: snapshotId },
      {
        $set: {
          status: 'in_progress',
          progress: {
            fetchedCount: existingHolderCount,
            insertedCount: existingHolderCount,
            lastCursor: resumeCursor,
            lastUpdated: new Date(),
            startedAt: existing.progress?.startedAt || new Date(),
            jobId: job.id,
          },
        },
        $unset: { error: '' },
      }
    );
  } else {
    // Create new snapshot
    const snapshot: Snapshot = {
      weekId: snapshotWeekId,
      timestamp: new Date(),
      totalHolders: 0,
      totalBalance: '0',
      status: 'in_progress',
      progress: {
        fetchedCount: 0,
        insertedCount: 0,
        lastCursor: null,
        lastUpdated: new Date(),
        startedAt: new Date(),
        jobId: job.id,
      },
      createdAt: new Date(),
    };

    const result = await database.collection<Snapshot>('snapshots').insertOne(snapshot);
    snapshotId = result.insertedId;
  }

  try {
    const useMockData = config.MOCK_SNAPSHOTS;
    let totalInserted = existingHolderCount;
    let apiCallCount = 0;
    let totalBalance = 0n;

    // Update job progress
    await job.updateProgress({
      weekId: snapshotWeekId,
      status: 'fetching',
      fetched: totalInserted,
      inserted: totalInserted,
    });
    await addJobLogEntry(jobId, 'info', `Starting snapshot for ${snapshotWeekId}`);

    if (useMockData) {
      // Mock mode
      logger.info('[MOCK] Using mock holder data');
      await addJobLogEntry(jobId, 'info', '[MOCK] Using mock holder data');
      const tokenAddress = getTokenAddress();
      const { holders: mockHolders, apiCallCount: mockCalls } = await fetchMockHolders(
        tokenAddress,
        500
      );

      await database.collection<Holder>('holders').deleteMany({ weekId: snapshotWeekId });

      const holders = mockHolders.map((h) => fromMoralisResponse(h, snapshotWeekId, snapshotId));
      for (const holder of holders) {
        totalBalance += BigInt(holder.balance);
      }

      await database.collection<Holder>('holders').insertMany(holders);
      totalInserted = holders.length;
      apiCallCount = mockCalls;

      await job.updateProgress({
        weekId: snapshotWeekId,
        status: 'saving',
        fetched: totalInserted,
        inserted: totalInserted,
      });
    } else {
      // Real mode - fetch from Moralis with incremental saving
      const tokenAddress = getTokenAddress();
      logger.info(`Fetching holders from Moralis for ${tokenAddress}`);
      await addJobLogEntry(jobId, 'info', `Fetching holders from Moralis for ${tokenAddress}`);

      let cursor = resumeCursor || '';
      let consecutiveErrors = 0;
      const MAX_ERRORS = 5;
      const BATCH_SIZE = 100;
      let pendingHolders: Holder[] = [];

      do {
        try {
          const result = await fetchHoldersPage(tokenAddress, cursor || undefined);
          apiCallCount++;
          consecutiveErrors = 0;

          const holders = result.holders.map((h) =>
            fromMoralisResponse(h, snapshotWeekId, snapshotId)
          );
          pendingHolders.push(...holders);

          for (const holder of holders) {
            totalBalance += BigInt(holder.balance);
          }

          cursor = result.nextCursor || '';

          // Insert batch if we have enough or this is the last page
          if (pendingHolders.length >= BATCH_SIZE || !cursor) {
            if (pendingHolders.length > 0) {
              await database.collection<Holder>('holders').insertMany(pendingHolders);
              totalInserted += pendingHolders.length;

              // Update progress in DB
              await database.collection<Snapshot>('snapshots').updateOne(
                { _id: snapshotId },
                {
                  $set: {
                    'progress.fetchedCount': totalInserted,
                    'progress.insertedCount': totalInserted,
                    'progress.lastCursor': cursor,
                    'progress.lastUpdated': new Date(),
                  },
                }
              );

              // Update job progress
              await job.updateProgress({
                weekId: snapshotWeekId,
                status: cursor ? 'fetching' : 'finalizing',
                fetched: totalInserted + pendingHolders.length,
                inserted: totalInserted,
                cursor: cursor || null,
              });

              // CLI progress log
              const progressPct = cursor ? '' : ' (100%)';
              logger.info(
                `📊 Progress: ${totalInserted.toLocaleString()} holders saved${progressPct} | API calls: ${apiCallCount}`
              );

              // Update job log periodically (every ~500 holders)
              if (totalInserted % 500 < BATCH_SIZE) {
                await updateJobProgress(jobId, {
                  percentage: cursor ? Math.min(90, Math.floor(totalInserted / 10)) : 95,
                  current: totalInserted,
                  stage: cursor ? 'fetching' : 'finalizing',
                }, `Progress: ${totalInserted.toLocaleString()} holders saved`);
              }

              pendingHolders = [];
            }
          }

          // Rate limiting
          if (cursor) {
            await sleep(500);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          if (message === 'RATE_LIMITED') {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_ERRORS) {
              // Save what we have and mark as failed
              if (pendingHolders.length > 0) {
                await database.collection<Holder>('holders').insertMany(pendingHolders);
                totalInserted += pendingHolders.length;
              }

              await database.collection<Snapshot>('snapshots').updateOne(
                { _id: snapshotId },
                {
                  $set: {
                    'progress.insertedCount': totalInserted,
                    'progress.lastCursor': cursor,
                    'progress.lastUpdated': new Date(),
                  },
                }
              );

              throw new Error(
                `Rate limited. Saved ${totalInserted} holders. Job will retry with cursor.`
              );
            }

            const backoffMs = Math.min(2000 * Math.pow(2, consecutiveErrors), 30000);
            logger.warn(`⚠️  Rate limited, waiting ${backoffMs}ms (attempt ${consecutiveErrors}/${MAX_ERRORS})`);
            await addJobLogEntry(jobId, 'warn', `Rate limited, waiting ${backoffMs}ms (attempt ${consecutiveErrors}/${MAX_ERRORS})`);
            await sleep(backoffMs);
            continue;
          }

          throw error;
        }
      } while (cursor);
    }

    const durationMs = Date.now() - startTime;

    // Mark as completed
    await database.collection<Snapshot>('snapshots').updateOne(
      { _id: snapshotId },
      {
        $set: {
          totalHolders: totalInserted,
          totalBalance: totalBalance.toString(),
          metadata: {
            fetchDurationMs: durationMs,
            apiCallCount,
          },
          status: 'completed',
          completedAt: new Date(),
        },
        $unset: { progress: '' },
      }
    );

    logger.info(`════════════════════════════════════════════════════════════`);
    logger.info(`✅ Snapshot completed: ${snapshotWeekId}`);
    logger.info(`   Holders: ${totalInserted.toLocaleString()}`);
    logger.info(`   Duration: ${(durationMs / 1000).toFixed(1)}s`);
    logger.info(`   API calls: ${apiCallCount}`);
    logger.info(`════════════════════════════════════════════════════════════`);

    // Log completion to job log
    await addJobLogEntry(jobId, 'success', `Snapshot completed: ${totalInserted.toLocaleString()} holders in ${(durationMs / 1000).toFixed(1)}s`);

    return {
      success: true,
      snapshotId: snapshotId.toString(),
      holdersInserted: totalInserted,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await database.collection<Snapshot>('snapshots').updateOne(
      { _id: snapshotId },
      {
        $set: {
          status: 'failed',
          error: errorMessage,
        },
      }
    );

    logger.error(`❌ Snapshot failed: ${errorMessage}`);
    await addJobLogEntry(jobId, 'error', `Snapshot failed: ${errorMessage}`);
    throw error;
  }
}

/**
 * Process full flow: start snapshot -> end snapshot -> calculate rewards
 */
async function processFullFlow(
  job: Job<SnapshotJobData, SnapshotJobResult>,
  database: Db,
  jobId: string
): Promise<SnapshotJobResult> {
  const { weekId } = job.data;

  logger.info(`Processing full flow for week ${weekId}`);
  await addJobLogEntry(jobId, 'info', `Starting full flow for week ${weekId}`);

  // Step 1: Start snapshot
  await job.updateProgress({ step: 'start_snapshot', weekId });
  await addJobLogEntry(jobId, 'info', 'Step 1/3: Starting start snapshot');
  const startResult = await processSingleSnapshot(job, database, `${weekId}-start`, jobId);

  if (!startResult.success) {
    return startResult;
  }

  // Step 2: End snapshot
  await job.updateProgress({ step: 'end_snapshot', weekId });
  await addJobLogEntry(jobId, 'info', 'Step 2/3: Starting end snapshot');
  const endResult = await processSingleSnapshot(job, database, `${weekId}-end`, jobId);

  if (!endResult.success) {
    return endResult;
  }

  // Step 3: Calculate rewards
  await job.updateProgress({ step: 'calculate_rewards', weekId });
  await addJobLogEntry(jobId, 'info', 'Step 3/3: Calculating rewards');

  const startSnapshot = await database.collection<Snapshot>('snapshots').findOne({
    weekId: `${weekId}-start`,
  });
  const endSnapshot = await database.collection<Snapshot>('snapshots').findOne({
    weekId: `${weekId}-end`,
  });

  if (!startSnapshot || !endSnapshot) {
    throw new Error('Snapshots not found after processing');
  }

  const calcResult = await calculateRewards(
    database,
    weekId,
    startSnapshot._id!,
    endSnapshot._id!
  );

  logger.info(`════════════════════════════════════════════════════════════`);
  logger.info(`✅ Full flow completed for week ${weekId}`);
  logger.info(`   Eligible holders: ${calcResult.eligibleCount}`);
  logger.info(`   Batches created: ${calcResult.batchCount}`);
  logger.info(`════════════════════════════════════════════════════════════`);

  await addJobLogEntry(jobId, 'success', `Full flow completed: ${calcResult.eligibleCount} eligible holders, ${calcResult.batchCount} batches`);

  return {
    success: true,
    snapshotId: endSnapshot._id!.toString(),
    holdersInserted: endResult.holdersInserted,
  };
}

// ═══════════════════════════════════════════════════════════
// Worker Initialization
// ═══════════════════════════════════════════════════════════

let worker: Worker<SnapshotJobData, SnapshotJobResult> | null = null;

export function startWorker(): Worker<SnapshotJobData, SnapshotJobResult> {
  if (worker) {
    return worker;
  }

  const connection = getWorkerRedisConnection();

  worker = new Worker<SnapshotJobData, SnapshotJobResult>(
    'snapshot',
    processSnapshotJob,
    {
      connection,
      concurrency: 1, // Process one snapshot at a time
      lockDuration: 300000, // 5 minutes lock
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed:`, err.message);
  });

  worker.on('progress', (job, progress) => {
    logger.debug(`Job ${job.id} progress:`, progress);
  });

  worker.on('error', (err) => {
    logger.error('Worker error:', err);
  });

  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('Snapshot worker started and listening for jobs...');
  logger.info('═══════════════════════════════════════════════════════════');

  return worker;
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
  }
  logger.info('Snapshot worker stopped');
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run worker if this file is executed directly
if (require.main === module) {
  startWorker();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await stopWorker();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await stopWorker();
    process.exit(0);
  });
}
