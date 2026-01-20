import { Db, ObjectId } from 'mongodb';
import { logger } from '../utils/logger';
import {
  Distribution,
  Batch,
  Recipient,
} from '../models';
import { executeBatchAirdrop, isGasPriceAcceptable } from './blockchain.service';

// ═══════════════════════════════════════════════════════════
// Airdrop Service - Orchestrates batch execution
// ═══════════════════════════════════════════════════════════

export interface AirdropResult {
  distribution: Distribution;
  processedBatches: number;
  failedBatches: number;
  totalDistributed: string;
}

/**
 * Process all pending batches for a distribution
 */
export async function processDistribution(
  db: Db,
  distributionId: ObjectId
): Promise<AirdropResult> {
  logger.info(`Processing distribution ${distributionId}`);

  // Get distribution
  const distribution = await db
    .collection<Distribution>('distributions')
    .findOne({ _id: distributionId });

  if (!distribution) {
    throw new Error(`Distribution ${distributionId} not found`);
  }

  if (!['ready', 'processing', 'failed'].includes(distribution.status)) {
    throw new Error(
      `Distribution ${distributionId} is not ready for processing (status: ${distribution.status}). ` +
      `Must be 'ready', 'processing', or 'failed' to retry.`
    );
  }

  // Update status to processing
  await db.collection<Distribution>('distributions').updateOne(
    { _id: distributionId },
    { $set: { status: 'processing' } }
  );

  // Get pending batches
  const batches = await db
    .collection<Batch>('batches')
    .find({
      distributionId,
      status: { $in: ['pending', 'failed'] },
    })
    .sort({ batchNumber: 1 })
    .toArray();

  logger.info(`Found ${batches.length} pending/failed batches to process`);

  let processedCount = 0;
  let failedCount = 0;
  let totalDistributed = 0n;

  for (const batch of batches) {
    try {
      // Check gas price before each batch
      if (!(await isGasPriceAcceptable())) {
        logger.warn('Gas price too high, pausing airdrop');
        break;
      }

      // Check retry count
      if (batch.retryCount >= batch.maxRetries) {
        logger.warn(
          `Batch ${batch.batchNumber} exceeded max retries, skipping`
        );
        failedCount++;
        continue;
      }

      // Update batch status to processing
      await db.collection<Batch>('batches').updateOne(
        { _id: batch._id },
        {
          $set: { status: 'processing', updatedAt: new Date() },
        }
      );

      // Execute batch
      const execution = await executeBatchAirdrop(batch.recipients);

      // Update batch as completed
      await db.collection<Batch>('batches').updateOne(
        { _id: batch._id },
        {
          $set: {
            status: 'completed',
            execution,
            updatedAt: new Date(),
            completedAt: new Date(),
          },
        }
      );

      // Update all recipients in this batch
      await db.collection<Recipient>('recipients').updateMany(
        {
          distributionId,
          address: { $in: batch.recipients.map(r => r.address) },
        },
        {
          $set: {
            status: 'completed',
            batchId: batch._id,
            batchNumber: batch.batchNumber,
            txHash: execution.txHash,
            updatedAt: new Date(),
            completedAt: new Date(),
          },
        }
      );

      totalDistributed += BigInt(batch.totalAmount);
      processedCount++;

      logger.info(
        `Batch ${batch.batchNumber} completed: ${execution.txHash}`
      );

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update batch as failed
      await db.collection<Batch>('batches').updateOne(
        { _id: batch._id },
        {
          $set: {
            status: 'failed',
            lastError: errorMessage,
            updatedAt: new Date(),
          },
          $inc: { retryCount: 1 },
        }
      );

      // Update recipients as failed
      await db.collection<Recipient>('recipients').updateMany(
        {
          distributionId,
          address: { $in: batch.recipients.map(r => r.address) },
        },
        {
          $set: {
            status: 'failed',
            error: errorMessage,
            updatedAt: new Date(),
          },
          $inc: { retryCount: 1 },
        }
      );

      failedCount++;
      logger.error(`Batch ${batch.batchNumber} failed: ${errorMessage}`);
    }
  }

  // Check if all batches are completed
  const pendingBatches = await db.collection<Batch>('batches').countDocuments({
    distributionId,
    status: { $in: ['pending', 'processing'] },
  });

  const allFailedBatches = await db.collection<Batch>('batches').countDocuments({
    distributionId,
    status: 'failed',
  });

  // Update distribution status
  let finalStatus: Distribution['status'];
  if (pendingBatches === 0 && allFailedBatches === 0) {
    finalStatus = 'completed';
  } else if (pendingBatches === 0 && allFailedBatches > 0) {
    finalStatus = 'failed';
  } else {
    finalStatus = 'processing';
  }

  await db.collection<Distribution>('distributions').updateOne(
    { _id: distributionId },
    {
      $set: {
        status: finalStatus,
        'stats.totalDistributed': totalDistributed.toString(),
        ...(finalStatus === 'completed' ? { completedAt: new Date() } : {}),
      },
    }
  );

  const finalDistribution = await db
    .collection<Distribution>('distributions')
    .findOne({ _id: distributionId });

  logger.info(
    `Distribution processing complete: ${processedCount} processed, ${failedCount} failed`
  );

  return {
    distribution: finalDistribution!,
    processedBatches: processedCount,
    failedBatches: failedCount,
    totalDistributed: totalDistributed.toString(),
  };
}

/**
 * Process a single batch
 */
export async function processSingleBatch(
  db: Db,
  batchId: ObjectId
): Promise<Batch> {
  const batch = await db.collection<Batch>('batches').findOne({ _id: batchId });

  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  if (batch.status === 'completed') {
    logger.info(`Batch ${batch.batchNumber} already completed`);
    return batch;
  }

  // Update to processing
  await db.collection<Batch>('batches').updateOne(
    { _id: batchId },
    { $set: { status: 'processing', updatedAt: new Date() } }
  );

  try {
    const execution = await executeBatchAirdrop(batch.recipients);

    await db.collection<Batch>('batches').updateOne(
      { _id: batchId },
      {
        $set: {
          status: 'completed',
          execution,
          updatedAt: new Date(),
          completedAt: new Date(),
        },
      }
    );

    // Update recipients
    await db.collection<Recipient>('recipients').updateMany(
      {
        distributionId: batch.distributionId,
        address: { $in: batch.recipients.map(r => r.address) },
      },
      {
        $set: {
          status: 'completed',
          batchId: batch._id,
          batchNumber: batch.batchNumber,
          txHash: execution.txHash,
          updatedAt: new Date(),
          completedAt: new Date(),
        },
      }
    );

    return (await db.collection<Batch>('batches').findOne({ _id: batchId }))!;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db.collection<Batch>('batches').updateOne(
      { _id: batchId },
      {
        $set: {
          status: 'failed',
          lastError: errorMessage,
          updatedAt: new Date(),
        },
        $inc: { retryCount: 1 },
      }
    );

    throw error;
  }
}

/**
 * Get pending distributions ready for processing
 */
export async function getPendingDistributions(
  db: Db
): Promise<Distribution[]> {
  return db
    .collection<Distribution>('distributions')
    .find({ status: 'ready' })
    .sort({ createdAt: 1 })
    .toArray();
}

/**
 * Get batch statistics for a distribution
 */
export async function getBatchStats(
  db: Db,
  distributionId: ObjectId
): Promise<Record<string, number>> {
  const result = await db
    .collection<Batch>('batches')
    .aggregate([
      { $match: { distributionId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])
    .toArray();

  const stats: Record<string, number> = {};
  for (const item of result) {
    stats[item._id as string] = item.count;
  }

  return stats;
}
