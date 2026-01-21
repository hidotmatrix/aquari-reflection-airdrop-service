import { Db, ObjectId } from 'mongodb';
import { getConfig, getTokenAddress } from '../config/env';
import { logger } from '../utils/logger';
import { getWeekId } from '../utils/week';
import {
  Snapshot,
  SnapshotProgress,
  createSnapshot,
  Holder,
  fromMoralisResponse,
} from '../models';
import {
  fetchHoldersPage,
  fetchMockHolders,
} from './moralis.service';

// ═══════════════════════════════════════════════════════════
// Snapshot Service - Now with incremental progress tracking
// ═══════════════════════════════════════════════════════════

export interface TakeSnapshotResult {
  snapshot: Snapshot;
  holdersInserted: number;
}

// In-memory progress tracking for real-time status
const activeSnapshots = new Map<string, {
  weekId: string;
  fetched: number;
  inserted: number;
  cursor: string | null;
  status: string;
  startedAt: Date;
}>();

/**
 * Get snapshot progress (for real-time status)
 */
export function getSnapshotProgress(weekId: string) {
  return activeSnapshots.get(weekId) || null;
}

/**
 * Get all active snapshots
 */
export function getActiveSnapshots() {
  return Array.from(activeSnapshots.values());
}

/**
 * Take a snapshot of all token holders with incremental saving
 */
export async function takeSnapshot(
  db: Db,
  weekId?: string,
  onProgress?: (count: number, cursor: string | null) => void
): Promise<TakeSnapshotResult> {
  const config = getConfig();
  const targetWeekId = weekId ?? getWeekId();
  const startTime = Date.now();

  logger.info(`Taking snapshot for week ${targetWeekId}`);

  // Check if snapshot already exists and is completed
  const existing = await db.collection<Snapshot>('snapshots').findOne({ weekId: targetWeekId });
  if (existing && existing.status === 'completed') {
    throw new Error(`Snapshot for week ${targetWeekId} already exists and is completed`);
  }

  // Check if we can resume
  let snapshotId: ObjectId;
  let resumeCursor: string | null = null;
  let existingHolderCount = 0;

  if (existing) {
    snapshotId = existing._id!;

    // If in_progress, we can resume
    if (existing.status === 'in_progress' && existing.progress?.lastCursor) {
      resumeCursor = existing.progress.lastCursor;
      existingHolderCount = existing.progress.insertedCount || 0;
      logger.info(`Resuming snapshot from cursor, already have ${existingHolderCount} holders`);
    } else {
      // Reset for fresh start
      await db.collection<Holder>('holders').deleteMany({ weekId: targetWeekId });
    }

    await db.collection<Snapshot>('snapshots').updateOne(
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
          },
        },
        $unset: { error: '' },
      }
    );
  } else {
    const snapshot = createSnapshot({ weekId: targetWeekId });
    snapshot.status = 'in_progress';
    snapshot.progress = {
      fetchedCount: 0,
      insertedCount: 0,
      lastCursor: null,
      lastUpdated: new Date(),
      startedAt: new Date(),
    };
    const result = await db.collection<Snapshot>('snapshots').insertOne(snapshot);
    snapshotId = result.insertedId;
  }

  // Track in memory for real-time status
  activeSnapshots.set(targetWeekId, {
    weekId: targetWeekId,
    fetched: existingHolderCount,
    inserted: existingHolderCount,
    cursor: resumeCursor,
    status: 'fetching',
    startedAt: new Date(),
  });

  try {
    const useMockData = config.MOCK_SNAPSHOTS;
    let totalInserted = existingHolderCount;
    let apiCallCount = 0;
    let totalBalance = 0n;

    if (useMockData) {
      // Mock mode - generate fake data
      logger.info('[MOCK] Using mock holder data');
      const tokenAddress = getTokenAddress();
      const { holders: mockHolders, apiCallCount: mockCalls } = await fetchMockHolders(
        tokenAddress,
        500,
        onProgress
      );

      await db.collection<Holder>('holders').deleteMany({ weekId: targetWeekId });

      const holders = mockHolders.map(h => fromMoralisResponse(h, targetWeekId, snapshotId));
      for (const holder of holders) {
        totalBalance += BigInt(holder.balance);
      }

      await db.collection<Holder>('holders').insertMany(holders);
      totalInserted = holders.length;
      apiCallCount = mockCalls;
    } else {
      // Real mode - fetch from Moralis with incremental saving
      const tokenAddress = getTokenAddress();
      logger.info(`Fetching real holder data from Moralis for ${tokenAddress}`);

      let cursor = resumeCursor || '';
      let consecutiveErrors = 0;
      const MAX_ERRORS = 5;
      const BATCH_SIZE = 100; // Insert every 100 holders

      let pendingHolders: Holder[] = [];

      do {
        try {
          const result = await fetchHoldersPage(tokenAddress, cursor || undefined);
          apiCallCount++;
          consecutiveErrors = 0;

          // Convert holders
          const holders = result.holders.map(h => fromMoralisResponse(h, targetWeekId, snapshotId));
          pendingHolders.push(...holders);

          // Calculate balance
          for (const holder of holders) {
            totalBalance += BigInt(holder.balance);
          }

          cursor = result.nextCursor || '';

          // Update in-memory progress
          const progress = activeSnapshots.get(targetWeekId);
          if (progress) {
            progress.fetched = totalInserted + pendingHolders.length;
            progress.cursor = cursor;
          }

          // Insert batch if we have enough
          if (pendingHolders.length >= BATCH_SIZE || !cursor) {
            if (pendingHolders.length > 0) {
              await db.collection<Holder>('holders').insertMany(pendingHolders);
              totalInserted += pendingHolders.length;

              // Update progress in DB
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

              if (progress) {
                progress.inserted = totalInserted;
              }

              logger.info(`Progress: ${totalInserted} holders inserted, cursor: ${cursor ? 'continuing...' : 'done'}`);
              pendingHolders = [];
            }
          }

          if (onProgress) {
            onProgress(totalInserted, cursor || null);
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
              // Save what we have and fail gracefully
              if (pendingHolders.length > 0) {
                await db.collection<Holder>('holders').insertMany(pendingHolders);
                totalInserted += pendingHolders.length;
              }
              throw new Error(`Rate limited. Saved ${totalInserted} holders. Resume with cursor.`);
            }

            const backoffMs = Math.min(2000 * Math.pow(2, consecutiveErrors), 30000);
            logger.warn(`Rate limited, waiting ${backoffMs}ms (attempt ${consecutiveErrors}/${MAX_ERRORS})`);
            await sleep(backoffMs);
            continue;
          }

          throw error;
        }
      } while (cursor);
    }

    const durationMs = Date.now() - startTime;

    // Mark as completed
    await db.collection<Snapshot>('snapshots').updateOne(
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

    activeSnapshots.delete(targetWeekId);

    const finalSnapshot = await db.collection<Snapshot>('snapshots').findOne({ _id: snapshotId });

    logger.info(
      `Snapshot completed: ${totalInserted} holders, ${durationMs}ms, ${apiCallCount} API calls`
    );

    return {
      snapshot: finalSnapshot!,
      holdersInserted: totalInserted,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db.collection<Snapshot>('snapshots').updateOne(
      { _id: snapshotId },
      {
        $set: {
          status: 'failed',
          error: errorMessage,
        },
      }
    );

    const progress = activeSnapshots.get(targetWeekId);
    if (progress) {
      progress.status = 'failed';
    }

    logger.error(`Snapshot failed: ${errorMessage}`);
    throw error;
  }
}

/**
 * Get snapshot by week ID
 */
export async function getSnapshotByWeekId(
  db: Db,
  weekId: string
): Promise<Snapshot | null> {
  return db.collection<Snapshot>('snapshots').findOne({ weekId });
}

/**
 * Get holders for a snapshot
 */
export async function getHoldersForSnapshot(
  db: Db,
  snapshotId: ObjectId,
  limit: number = 100,
  skip: number = 0
): Promise<{ holders: Holder[]; total: number }> {
  const [holders, total] = await Promise.all([
    db
      .collection<Holder>('holders')
      .find({ snapshotId })
      .sort({ balance: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection<Holder>('holders').countDocuments({ snapshotId }),
  ]);

  return { holders, total };
}

/**
 * Get holder balance map for a week
 */
export async function getHolderBalanceMap(
  db: Db,
  weekId: string
): Promise<Map<string, string>> {
  const holders = await db
    .collection<Holder>('holders')
    .find({ weekId })
    .project({ address: 1, balance: 1 })
    .toArray();

  const map = new Map<string, string>();
  for (const holder of holders) {
    map.set(holder.address, holder.balance);
  }

  return map;
}

/**
 * Get recent snapshots
 */
export async function getRecentSnapshots(
  db: Db,
  limit: number = 10
): Promise<Snapshot[]> {
  return db
    .collection<Snapshot>('snapshots')
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
