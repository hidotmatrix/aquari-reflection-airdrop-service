import { Db, ObjectId } from 'mongodb';
import { getConfig } from '../config/env';
import { logger } from '../utils/logger';
import { getWeekId } from '../utils/week';
import {
  Snapshot,
  createSnapshot,
  Holder,
  fromMoralisResponse,
} from '../models';
import {
  fetchHoldersWithRetry,
  fetchMockHolders,
} from './moralis.service';

// ═══════════════════════════════════════════════════════════
// Snapshot Service
// ═══════════════════════════════════════════════════════════

export interface TakeSnapshotResult {
  snapshot: Snapshot;
  holdersInserted: number;
}

/**
 * Take a snapshot of all token holders
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

  // Check if snapshot already exists
  const existing = await db.collection<Snapshot>('snapshots').findOne({ weekId: targetWeekId });
  if (existing && existing.status === 'completed') {
    throw new Error(`Snapshot for week ${targetWeekId} already exists`);
  }

  // Create or update snapshot record
  let snapshotId: ObjectId;
  if (existing) {
    snapshotId = existing._id!;
    await db.collection<Snapshot>('snapshots').updateOne(
      { _id: snapshotId },
      {
        $set: {
          status: 'in_progress',
        },
        $unset: {
          error: '',
        },
      }
    );
  } else {
    const snapshot = createSnapshot({ weekId: targetWeekId });
    snapshot.status = 'in_progress';
    const result = await db.collection<Snapshot>('snapshots').insertOne(snapshot);
    snapshotId = result.insertedId;
  }

  try {
    // Fetch holders from Moralis (or mock)
    const fetchFn = config.MOCK_MODE ? fetchMockHolders : fetchHoldersWithRetry;
    const { holders: moralisHolders, apiCallCount, totalSupply } = await fetchFn(
      config.AQUARI_ADDRESS,
      config.MOCK_MODE ? 500 : 3, // Mock: 500 holders, Real: 3 retries
      onProgress
    );

    // Clear existing holders for this week (in case of retry)
    await db.collection<Holder>('holders').deleteMany({ weekId: targetWeekId });

    // Convert and insert holders in batches
    const BATCH_SIZE = 1000;
    let totalBalance = 0n;
    let insertedCount = 0;

    for (let i = 0; i < moralisHolders.length; i += BATCH_SIZE) {
      const batch = moralisHolders.slice(i, i + BATCH_SIZE);
      const holders = batch.map(h => fromMoralisResponse(h, targetWeekId, snapshotId));

      // Calculate total balance
      for (const holder of holders) {
        totalBalance += BigInt(holder.balance);
      }

      await db.collection<Holder>('holders').insertMany(holders);
      insertedCount += holders.length;

      logger.debug(`Inserted holders batch: ${insertedCount}/${moralisHolders.length}`);
    }

    const durationMs = Date.now() - startTime;

    // Update snapshot with results
    await db.collection<Snapshot>('snapshots').updateOne(
      { _id: snapshotId },
      {
        $set: {
          totalHolders: insertedCount,
          totalBalance: totalBalance.toString(),
          metadata: {
            fetchDurationMs: durationMs,
            apiCallCount,
          },
          status: 'completed',
          completedAt: new Date(),
        },
      }
    );

    const finalSnapshot = await db.collection<Snapshot>('snapshots').findOne({ _id: snapshotId });

    logger.info(
      `Snapshot completed: ${insertedCount} holders, ${durationMs}ms, ${apiCallCount} API calls`
    );

    return {
      snapshot: finalSnapshot!,
      holdersInserted: insertedCount,
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
