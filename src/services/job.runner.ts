import { Db, ObjectId } from 'mongodb';
import { getConfig, getTokenAddress } from '../config/env';
import { logger } from '../utils/logger';
import { Job, JobType } from '../models/Job';
import { Snapshot, Holder, fromMoralisResponse } from '../models';
import { getPreviousWeekId } from '../utils/week';
import {
  createNewJob,
  updateJobStatus,
  createJobContext,
  JobContext,
} from './job.service';
import { fetchHoldersPage, fetchMockHolders } from './moralis.service';
import { calculateRewards } from './calculation.service';
import {
  executeBatchAirdrop,
  isBlockchainReady,
  getWalletTokenBalance,
  initializeBlockchain,
} from './blockchain.service';
import {
  createJobLog,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  addJobLogEntry,
  updateJobProgress as updateJobLogProgress,
  JobLog,
} from './job-log.service';

// ═══════════════════════════════════════════════════════════
// Job Runner - Executes jobs with progress tracking
// ═══════════════════════════════════════════════════════════

// Track running jobs to prevent duplicates (in-memory)
const runningJobs = new Set<string>();

/**
 * Start a job (non-blocking - runs in background)
 * Prevents duplicate jobs from running simultaneously
 */
export async function startJob(
  db: Db,
  type: JobType,
  weekId: string
): Promise<Job> {
  const jobKey = `${type}-${weekId}`;

  // Check if already running in memory
  if (runningJobs.has(jobKey)) {
    const existing = await db.collection<Job>('jobs').findOne({
      type,
      weekId,
      status: 'running',
    });
    if (existing) {
      logger.info(`Job already running: ${jobKey}`);
      return existing;
    }
  }

  // Double-check database for running jobs (in case of server restart)
  const existingRunning = await db.collection<Job>('jobs').findOne({
    type,
    weekId,
    status: { $in: ['pending', 'running'] },
  });

  if (existingRunning) {
    logger.info(`Found existing job in DB: ${jobKey} (status: ${existingRunning.status})`);
    // If it's running, track it
    if (existingRunning.status === 'running') {
      runningJobs.add(jobKey);
    }
    return existingRunning;
  }

  // Create the job
  const job = await createNewJob(db, type, weekId);

  // If job was already created and is running (race condition check), return it
  if (job.status === 'running') {
    runningJobs.add(jobKey);
    return job;
  }

  // Mark as running in memory
  runningJobs.add(jobKey);

  // Run the job in the background (don't await)
  runJobAsync(db, job).finally(() => {
    runningJobs.delete(jobKey);
  });

  return job;
}

/**
 * Map job type to job log type
 */
function getJobLogType(type: JobType, _weekId: string): JobLog['type'] {
  if (type === 'snapshot') return 'snapshot';
  if (type === 'calculation') return 'calculate';
  if (type === 'airdrop') return 'airdrop';
  return 'snapshot'; // default for full-flow
}

/**
 * Run job asynchronously
 */
async function runJobAsync(db: Db, job: Job): Promise<void> {
  const ctx = createJobContext(db, job._id!);
  const jobId = job._id!.toString();
  const jobLogType = getJobLogType(job.type, job.weekId);

  // Create job log entry in MongoDB for persistence
  try {
    await createJobLog(jobId, jobLogType, job.weekId);
    await markJobRunning(jobId);
  } catch (err) {
    // Job log might already exist
    logger.debug('Job log entry might already exist:', err);
    try {
      await markJobRunning(jobId);
    } catch {
      // Ignore if job log doesn't exist
    }
  }

  try {
    await updateJobStatus(db, job._id!, 'running');
    await ctx.log(`Starting ${job.type} job for ${job.weekId}`);
    await addJobLogEntry(jobId, 'info', `Starting ${job.type} job for ${job.weekId}`);

    switch (job.type) {
      case 'snapshot':
        await runSnapshotJob(ctx, job.weekId, jobId);
        break;
      case 'calculation':
        await runCalculationJob(ctx, job.weekId, jobId);
        break;
      case 'airdrop':
        await runAirdropJob(ctx, job.weekId, jobId);
        break;
      case 'full-flow':
        await runFullFlowJob(ctx, job.weekId, jobId);
        break;
    }

    await updateJobStatus(db, job._id!, 'completed');
    await ctx.success(`Job completed successfully`);
    await markJobCompleted(jobId, { type: job.type, weekId: job.weekId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.error(`Job failed: ${message}`);
    await updateJobStatus(db, job._id!, 'failed', message);
    await markJobFailed(jobId, message);
  }
}

// ═══════════════════════════════════════════════════════════
// Snapshot Job
// ═══════════════════════════════════════════════════════════

async function runSnapshotJob(ctx: JobContext, weekId: string, jobId: string): Promise<void> {
  const config = getConfig();
  const db = ctx.db;

  await ctx.log(`Taking snapshot for week ${weekId}`);

  // Check if already completed
  const existing = await db.collection<Snapshot>('snapshots').findOne({ weekId });
  if (existing?.status === 'completed') {
    await ctx.log(`Snapshot already completed with ${existing.totalHolders} holders`);
    await ctx.setResult({ snapshotId: existing._id?.toString(), totalHolders: existing.totalHolders });
    return;
  }

  // Create or get snapshot
  let snapshotId: ObjectId;
  let resumeCursor: string | null = null;
  let existingCount = 0;

  if (existing) {
    snapshotId = existing._id!;
    if (existing.status === 'in_progress' && existing.progress?.lastCursor) {
      resumeCursor = existing.progress.lastCursor;
      existingCount = existing.progress.insertedCount || 0;
      await ctx.log(`Resuming from cursor, already have ${existingCount} holders`);
    } else if (existing.status === 'failed') {
      await db.collection<Holder>('holders').deleteMany({ weekId });
      await ctx.log(`Cleared failed snapshot data, starting fresh`);
    }
  } else {
    const snapshot: Snapshot = {
      weekId,
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
        jobId: ctx.jobId.toString(),
      },
      createdAt: new Date(),
    };
    const result = await db.collection<Snapshot>('snapshots').insertOne(snapshot);
    snapshotId = result.insertedId;
    await ctx.log(`Created snapshot record`);
  }

  // Update snapshot status
  await db.collection<Snapshot>('snapshots').updateOne(
    { _id: snapshotId },
    {
      $set: {
        status: 'in_progress',
        'progress.jobId': ctx.jobId.toString(),
        'progress.lastUpdated': new Date(),
      },
    }
  );

  try {
    let totalInserted = existingCount;
    let apiCallCount = 0;
    let totalBalance = 0n;

    if (config.MOCK_SNAPSHOTS) {
      await ctx.log(`[MOCK MODE] Generating mock holder data`);
      const tokenAddress = getTokenAddress();
      const { holders: mockHolders, apiCallCount: mockCalls } = await fetchMockHolders(
        tokenAddress,
        500
      );

      await db.collection<Holder>('holders').deleteMany({ weekId });

      const holders = mockHolders.map((h) => fromMoralisResponse(h, weekId, snapshotId));
      for (const holder of holders) {
        totalBalance += BigInt(holder.balance);
      }

      await db.collection<Holder>('holders').insertMany(holders);
      totalInserted = holders.length;
      apiCallCount = mockCalls;

      await ctx.setProgress(totalInserted, totalInserted, 'Completed');
      await ctx.log(`Inserted ${totalInserted} mock holders`);
    } else {
      await ctx.log(`Fetching real holders from Moralis API`);
      await ctx.setProgress(existingCount, 10000, 'Fetching holders...');

      const tokenAddress = getTokenAddress();
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
            fromMoralisResponse(h, weekId, snapshotId)
          );
          pendingHolders.push(...holders);

          for (const holder of holders) {
            totalBalance += BigInt(holder.balance);
          }

          cursor = result.nextCursor || '';

          // Insert batch
          if (pendingHolders.length >= BATCH_SIZE || !cursor) {
            if (pendingHolders.length > 0) {
              await db.collection<Holder>('holders').insertMany(pendingHolders);
              totalInserted += pendingHolders.length;

              // Update snapshot progress
              await db.collection<Snapshot>('snapshots').updateOne(
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
              const estimatedTotal = Math.max(totalInserted + (cursor ? 1000 : 0), 10000);
              await ctx.setProgress(totalInserted, estimatedTotal, cursor ? 'Fetching...' : 'Finalizing...');

              // Log every 500 holders
              if (totalInserted % 500 === 0 || !cursor) {
                await ctx.log(`Progress: ${totalInserted.toLocaleString()} holders saved`, {
                  apiCalls: apiCallCount,
                  hasMore: !!cursor,
                });
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
              // Save what we have
              if (pendingHolders.length > 0) {
                await db.collection<Holder>('holders').insertMany(pendingHolders);
                totalInserted += pendingHolders.length;
              }
              throw new Error(`Rate limited. Saved ${totalInserted} holders. Can resume later.`);
            }

            const backoffMs = Math.min(2000 * Math.pow(2, consecutiveErrors), 30000);
            await ctx.warn(`Rate limited, waiting ${backoffMs}ms (attempt ${consecutiveErrors}/${MAX_ERRORS})`);
            await sleep(backoffMs);
            continue;
          }

          throw error;
        }
      } while (cursor);
    }

    // Mark snapshot as completed
    await db.collection<Snapshot>('snapshots').updateOne(
      { _id: snapshotId },
      {
        $set: {
          totalHolders: totalInserted,
          totalBalance: totalBalance.toString(),
          metadata: { fetchDurationMs: 0, apiCallCount },
          status: 'completed',
          completedAt: new Date(),
        },
        $unset: { progress: '' },
      }
    );

    await ctx.success(`Snapshot completed: ${totalInserted.toLocaleString()} holders`);
    await ctx.setResult({
      snapshotId: snapshotId.toString(),
      totalHolders: totalInserted,
      apiCallCount,
    });
  } catch (error) {
    await db.collection<Snapshot>('snapshots').updateOne(
      { _id: snapshotId },
      {
        $set: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      }
    );
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// Calculation Job
// ═══════════════════════════════════════════════════════════

async function runCalculationJob(ctx: JobContext, weekId: string, jobId: string): Promise<void> {
  const db = ctx.db;

  await ctx.log(`Calculating rewards for cycle ${weekId}`);
  await ctx.setProgress(0, 3, 'Loading snapshots...');

  // Get the 2 most recent completed snapshots
  const snapshots = await db.collection<Snapshot>('snapshots')
    .find({ status: 'completed' })
    .sort({ createdAt: -1 })
    .limit(2)
    .toArray();

  if (snapshots.length < 2) {
    throw new Error(`Need at least 2 snapshots to calculate. Found: ${snapshots.length}`);
  }

  // Current snapshot is most recent, previous is second most recent
  const currentSnapshot = snapshots[0]!;
  const previousSnapshot = snapshots[1]!;

  // In production mode, verify current snapshot matches the week we're calculating for
  // (In fork mode, weekId is TEST-XXX which won't match snapshot weekIds, so skip this check)
  if (!weekId.startsWith('TEST-') && currentSnapshot.weekId !== weekId) {
    throw new Error(`Current snapshot (${currentSnapshot.weekId}) doesn't match calculation week (${weekId}). Snapshot may have failed.`);
  }

  await ctx.log(`Previous snapshot: ${previousSnapshot.weekId} (${previousSnapshot.totalHolders} holders)`);
  await ctx.log(`Current snapshot: ${currentSnapshot.weekId} (${currentSnapshot.totalHolders} holders)`);
  await ctx.setProgress(1, 3, 'Calculating rewards...');

  const result = await calculateRewards(db, weekId, previousSnapshot._id!, currentSnapshot._id!);

  await ctx.setProgress(3, 3, 'Completed');
  await ctx.success(`Rewards calculated: ${result.eligibleCount} eligible, ${result.batchCount} batches`);
  await ctx.setResult({
    distributionId: result.distribution._id?.toString(),
    eligibleCount: result.eligibleCount,
    excludedCount: result.excludedCount,
    batchCount: result.batchCount,
  });
}

// ═══════════════════════════════════════════════════════════
// Airdrop Job - Process batches and send/simulate transactions
// ═══════════════════════════════════════════════════════════

interface Batch {
  _id?: ObjectId;
  distributionId: ObjectId;
  weekId: string;
  batchNumber: number;
  recipients: Array<{ address: string; amount: string }>;
  recipientCount: number;
  totalAmount: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  execution?: {
    txHash: string;
    gasUsed: string;
    gasPrice: string;
    blockNumber: number;
    confirmedAt: Date;
  };
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

interface Distribution {
  _id?: ObjectId;
  weekId: string;
  status: string;
  stats?: {
    eligibleHolders?: number;
    totalDistributed?: string;
  };
  config?: {
    rewardToken?: string;
  };
}

interface Recipient {
  _id?: ObjectId;
  distributionId: ObjectId;
  weekId: string;
  address: string;
  reward: string;
  status: string;
  batchId?: ObjectId;
  txHash?: string;
}

async function runAirdropJob(ctx: JobContext, weekId: string, jobId: string): Promise<void> {
  const db = ctx.db;
  const config = getConfig();
  const isSimulated = config.MOCK_TRANSACTIONS;

  await ctx.log(`Processing airdrop for week ${weekId}`);
  await ctx.log(`Mode: ${isSimulated ? 'SIMULATED' : 'PRODUCTION'}`);

  // Load distribution
  const distribution = await db.collection<Distribution>('distributions').findOne({ weekId });
  if (!distribution) {
    throw new Error(`Distribution not found for week ${weekId}`);
  }

  // Load pending batches
  const batches = await db.collection<Batch>('batches')
    .find({ distributionId: distribution._id, status: { $in: ['pending', 'queued', 'failed'] } })
    .sort({ batchNumber: 1 })
    .toArray();

  if (batches.length === 0) {
    await ctx.warn('No pending batches to process');
    await ctx.setResult({ processed: 0, message: 'No batches to process' });
    return;
  }

  await ctx.log(`Found ${batches.length} batches to process`);
  await ctx.setProgress(0, batches.length, 'Processing batches...');

  let processedBatches = 0;
  let successfulBatches = 0;
  let failedBatches = 0;
  let totalSent = 0n;

  for (const batch of batches) {
    try {
      await ctx.log(`Processing batch ${batch.batchNumber} (${batch.recipientCount} recipients)`);

      // Update batch status to processing
      await db.collection<Batch>('batches').updateOne(
        { _id: batch._id },
        { $set: { status: 'processing', updatedAt: new Date() } }
      );

      if (isSimulated) {
        // Simulated mode - generate fake transaction data
        await sleep(500); // Simulate network delay

        const fakeTxHash = `0x${'sim'.repeat(4)}${Date.now().toString(16)}${'0'.repeat(32)}`.slice(0, 66);
        const fakeGasUsed = (21000 + batch.recipientCount * 10000).toString();

        // Update batch as completed
        await db.collection<Batch>('batches').updateOne(
          { _id: batch._id },
          {
            $set: {
              status: 'completed',
              execution: {
                txHash: fakeTxHash,
                gasUsed: fakeGasUsed,
                gasPrice: '1000000000', // 1 gwei
                blockNumber: Math.floor(Date.now() / 1000),
                confirmedAt: new Date(),
              },
              updatedAt: new Date(),
              completedAt: new Date(),
            },
          }
        );

        // Update recipients with fake txHash (by address from batch)
        const recipientAddresses = (batch.recipients || []).map(r => r.address);
        if (recipientAddresses.length > 0) {
          await db.collection<Recipient>('recipients').updateMany(
            { distributionId: distribution._id, address: { $in: recipientAddresses } },
            {
              $set: {
                status: 'completed',
                txHash: fakeTxHash,
                updatedAt: new Date(),
                completedAt: new Date(),
              },
            }
          );
        }

        // Calculate total sent
        const batchTotal = BigInt(batch.totalAmount);
        totalSent += batchTotal;

        const batchAmountFormatted = (batchTotal / BigInt(10 ** 18)).toString();
        await ctx.log(`[SIMULATED] Batch ${batch.batchNumber} completed`, {
          txHash: fakeTxHash.slice(0, 18) + '...',
          recipients: batch.recipientCount,
          amount: `${batchAmountFormatted} AQUARI`,
        });

        successfulBatches++;

      } else {
        // Production mode - execute real transactions via Disperse contract
        if (!isBlockchainReady()) {
          initializeBlockchain();
          if (!isBlockchainReady()) {
            throw new Error('Blockchain not initialized - check PRIVATE_KEY and token configuration');
          }
        }

        // Check token balance before executing
        const tokenBalance = BigInt(await getWalletTokenBalance());
        const batchTotal = BigInt(batch.totalAmount);
        if (tokenBalance < batchTotal) {
          throw new Error(`Insufficient token balance: ${tokenBalance} < ${batchTotal}`);
        }

        await ctx.log(`Executing real transaction for batch ${batch.batchNumber}...`);

        // Execute the batch via Disperse contract
        const execution = await executeBatchAirdrop(batch.recipients);

        // Update batch with execution details
        await db.collection<Batch>('batches').updateOne(
          { _id: batch._id },
          {
            $set: {
              status: 'completed',
              execution: {
                txHash: execution.txHash,
                gasUsed: execution.gasUsed,
                gasPrice: execution.gasPrice,
                blockNumber: execution.blockNumber,
                confirmedAt: execution.confirmedAt,
              },
              updatedAt: new Date(),
              completedAt: new Date(),
            },
          }
        );

        // Update recipients with real txHash
        const recipientAddresses = (batch.recipients || []).map(r => r.address);
        if (recipientAddresses.length > 0) {
          await db.collection<Recipient>('recipients').updateMany(
            { distributionId: distribution._id, address: { $in: recipientAddresses } },
            {
              $set: {
                status: 'completed',
                txHash: execution.txHash,
                updatedAt: new Date(),
                completedAt: new Date(),
              },
            }
          );
        }

        totalSent += batchTotal;

        const batchAmountFormatted = (batchTotal / BigInt(10 ** 18)).toString();
        await ctx.log(`Batch ${batch.batchNumber} completed`, {
          txHash: execution.txHash,
          gasUsed: execution.gasUsed,
          recipients: batch.recipientCount,
          amount: `${batchAmountFormatted} AQUARI`,
        });

        successfulBatches++;
      }

      processedBatches++;
      await ctx.setProgress(processedBatches, batches.length, `Batch ${batch.batchNumber}/${batches.length}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.error(`Batch ${batch.batchNumber} failed: ${message}`);

      await db.collection<Batch>('batches').updateOne(
        { _id: batch._id },
        {
          $set: {
            status: 'failed',
            lastError: message,
            updatedAt: new Date(),
          },
          $inc: { retryCount: 1 },
        }
      );

      failedBatches++;
      processedBatches++;
    }

    // Delay between batches to avoid RPC rate limiting
    if (processedBatches < batches.length) {
      await sleep(2000); // 2 second delay
    }
  }

  // Update distribution status
  const allBatches = await db.collection<Batch>('batches')
    .find({ distributionId: distribution._id })
    .toArray();

  const allCompleted = allBatches.every(b => b.status === 'completed');
  const anyFailed = allBatches.some(b => b.status === 'failed');

  const newStatus = allCompleted ? 'completed' : (anyFailed ? 'failed' : 'processing');

  await db.collection<Distribution>('distributions').updateOne(
    { _id: distribution._id },
    {
      $set: {
        status: newStatus,
        'stats.totalDistributed': totalSent.toString(),
        updatedAt: new Date(),
        ...(allCompleted ? { completedAt: new Date() } : {}),
      },
    }
  );

  // Summary
  const totalSentFormatted = (totalSent / BigInt(10 ** 18)).toString();
  await ctx.success(`Airdrop ${isSimulated ? 'simulation' : 'execution'} completed`);
  await ctx.log(`Results: ${successfulBatches} successful, ${failedBatches} failed`);
  await ctx.log(`Total sent: ${totalSentFormatted} ${distribution.config?.rewardToken || 'ETH'}`);

  await ctx.setResult({
    mode: isSimulated ? 'SIMULATED' : 'PRODUCTION',
    processedBatches,
    successfulBatches,
    failedBatches,
    totalSent: totalSent.toString(),
    totalSentFormatted,
  });
}

// ═══════════════════════════════════════════════════════════
// Full Flow Job
// ═══════════════════════════════════════════════════════════

async function runFullFlowJob(ctx: JobContext, weekId: string, jobId: string): Promise<void> {
  const db = ctx.db;
  const config = getConfig();

  await ctx.log(`Running full flow for week ${weekId}`);

  // Check for previous week's snapshot to use as "start"
  const previousWeekId = getPreviousWeekId(weekId);
  const previousSnapshot = await db.collection<Snapshot>('snapshots').findOne({
    weekId: { $regex: `^${previousWeekId}` },
    status: 'completed',
  });

  // Dev mode: Take one snapshot and duplicate for both start/end
  // Production mode: Use previous week as start, current week as end
  const isDevMode = config.NODE_ENV === 'development';

  if (previousSnapshot && !isDevMode) {
    // Production: Use previous week's snapshot as start
    await ctx.log(`Found previous snapshot (${previousWeekId}) - using as start reference`);
    await ctx.log(`Step 1/2: Taking current week snapshot`);
    await ctx.setProgress(0, 2, 'Current snapshot...');
    await runSnapshotJob(ctx, `${weekId}-end`, jobId);

    // Copy reference for start
    const endSnapshot = await db.collection<Snapshot>('snapshots').findOne({
      weekId: `${weekId}-end`,
      status: 'completed'
    });

    if (endSnapshot) {
      // Create start snapshot reference pointing to previous week's data
      await db.collection<Snapshot>('snapshots').updateOne(
        { weekId: `${weekId}-start` },
        {
          $setOnInsert: {
            weekId: `${weekId}-start`,
            timestamp: previousSnapshot.timestamp,
            totalHolders: previousSnapshot.totalHolders,
            totalBalance: previousSnapshot.totalBalance,
            metadata: {
              fetchDurationMs: previousSnapshot.metadata?.fetchDurationMs ?? 0,
              apiCallCount: previousSnapshot.metadata?.apiCallCount ?? 0,
              referencedFrom: previousSnapshot.weekId,
            },
            status: 'completed' as const,
            createdAt: new Date(),
            completedAt: new Date(),
          },
        },
        { upsert: true }
      );

      // Copy holders from previous snapshot with new weekId
      await ctx.log(`Referencing ${previousSnapshot.totalHolders} holders from previous week`);
      const prevHolders = await db.collection<Holder>('holders')
        .find({ snapshotId: previousSnapshot._id })
        .toArray();

      const startSnapshotDoc = await db.collection<Snapshot>('snapshots').findOne({ weekId: `${weekId}-start` });

      if (startSnapshotDoc && prevHolders.length > 0) {
        const newHolders = prevHolders.map(h => ({
          ...h,
          _id: undefined,
          weekId: `${weekId}-start`,
          snapshotId: startSnapshotDoc._id!,
          createdAt: new Date(),
        }));
        await db.collection<Holder>('holders').insertMany(newHolders as Holder[]);
      }
    }

    await ctx.log(`Step 2/2: Calculating rewards`);
    await ctx.setProgress(1, 2, 'Calculating...');
    await runCalculationJob(ctx, weekId, jobId);

    await ctx.setProgress(2, 2, 'Completed');
    await ctx.success(`Full flow completed for week ${weekId} (1 API snapshot + previous week reference)`);

  } else {
    // Dev mode OR first week: Take one snapshot and duplicate
    await ctx.log(`Dev mode: Taking single snapshot and duplicating for calculation`);

    await ctx.log(`Step 1/2: Taking snapshot`);
    await ctx.setProgress(0, 2, 'Taking snapshot...');
    await runSnapshotJob(ctx, `${weekId}-end`, jobId);

    // Duplicate as start snapshot
    await ctx.log(`Step 2/2: Duplicating snapshot for calculation testing`);
    await ctx.setProgress(1, 2, 'Duplicating...');

    const endSnapshot = await db.collection<Snapshot>('snapshots').findOne({
      weekId: `${weekId}-end`,
      status: 'completed'
    });

    if (endSnapshot) {
      // Create start snapshot as copy
      const startSnapshotId = new ObjectId();
      await db.collection<Snapshot>('snapshots').insertOne({
        _id: startSnapshotId,
        weekId: `${weekId}-start`,
        timestamp: endSnapshot.timestamp,
        totalHolders: endSnapshot.totalHolders,
        totalBalance: endSnapshot.totalBalance,
        metadata: {
          fetchDurationMs: endSnapshot.metadata?.fetchDurationMs ?? 0,
          apiCallCount: endSnapshot.metadata?.apiCallCount ?? 0,
          duplicatedFrom: `${weekId}-end`,
        },
        status: 'completed',
        createdAt: new Date(),
        completedAt: new Date(),
      });

      // Copy holders with new weekId and snapshotId
      const holders = await db.collection<Holder>('holders')
        .find({ snapshotId: endSnapshot._id })
        .toArray();

      if (holders.length > 0) {
        const duplicatedHolders = holders.map(h => ({
          ...h,
          _id: undefined,
          weekId: `${weekId}-start`,
          snapshotId: startSnapshotId,
          createdAt: new Date(),
        }));
        await db.collection<Holder>('holders').insertMany(duplicatedHolders as Holder[]);
        await ctx.log(`Duplicated ${holders.length} holders for start snapshot`);
      }
    }

    // Calculate
    await ctx.log(`Calculating rewards`);
    await runCalculationJob(ctx, weekId, jobId);

    await ctx.setProgress(2, 2, 'Completed');
    await ctx.success(`Full flow completed for week ${weekId} (dev mode - single snapshot duplicated)`);
  }
}

// getPreviousWeekId is imported from '../utils/week' - supports weekly, daily, and 6hour modes

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
