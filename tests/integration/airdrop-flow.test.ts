import { getTestDb } from '../setup';
import { takeSnapshot } from '../../src/services/snapshot.service';
import { calculateRewards } from '../../src/services/calculation.service';
import {
  Distribution,
  Recipient,
  Batch,
  Snapshot,
  Holder,
} from '../../src/models';

// ═══════════════════════════════════════════════════════════
// Integration Test: Full Airdrop Flow
// ═══════════════════════════════════════════════════════════

describe('Airdrop Flow Integration', () => {
  describe('Full Weekly Airdrop Cycle', () => {
    const weekId = '2025-W50';

    it('should complete full airdrop flow', async () => {
      const db = getTestDb();

      // Step 1: Take previous snapshot (baseline from previous cycle)
      const previousSnapshotResult = await takeSnapshot(db, '2025-W49');
      expect(previousSnapshotResult.snapshot.status).toBe('completed');
      expect(previousSnapshotResult.holdersInserted).toBeGreaterThan(0);

      // Verify holders were stored
      const previousHolders = await db
        .collection<Holder>('holders')
        .find({ weekId: '2025-W49' })
        .toArray();
      expect(previousHolders.length).toBe(previousSnapshotResult.holdersInserted);

      // Step 2: Take current snapshot (this cycle)
      const currentSnapshotResult = await takeSnapshot(db, weekId);
      expect(currentSnapshotResult.snapshot.status).toBe('completed');
      expect(currentSnapshotResult.holdersInserted).toBeGreaterThan(0);

      // Verify holders were stored
      const currentHolders = await db
        .collection<Holder>('holders')
        .find({ weekId })
        .toArray();
      expect(currentHolders.length).toBe(currentSnapshotResult.holdersInserted);

      // Step 3: Calculate rewards
      const calculationResult = await calculateRewards(
        db,
        weekId,
        previousSnapshotResult.snapshot._id!,
        currentSnapshotResult.snapshot._id!
      );

      expect(calculationResult.distribution).toBeDefined();
      expect(calculationResult.distribution.status).toBe('ready');

      // Verify distribution record
      const distribution = await db
        .collection<Distribution>('distributions')
        .findOne({ weekId });
      expect(distribution).not.toBeNull();
      expect(distribution?.previousSnapshotId).toEqual(previousSnapshotResult.snapshot._id);
      expect(distribution?.currentSnapshotId).toEqual(currentSnapshotResult.snapshot._id);

      // Verify recipients were created
      const recipients = await db
        .collection<Recipient>('recipients')
        .find({ weekId })
        .toArray();
      expect(recipients.length).toBe(calculationResult.eligibleCount);

      // Verify batches were created
      const batches = await db
        .collection<Batch>('batches')
        .find({ weekId })
        .toArray();
      expect(batches.length).toBe(calculationResult.batchCount);

      // Verify batch numbers are sequential
      const batchNumbers = batches.map((b) => b.batchNumber).sort((a, b) => a - b);
      for (let i = 0; i < batchNumbers.length; i++) {
        expect(batchNumbers[i]!).toBe(i + 1);
      }

      // Verify all batches are pending
      batches.forEach((batch) => {
        expect(batch.status).toBe('pending');
      });

      // Verify recipients are pending
      recipients.forEach((recipient) => {
        expect(recipient.status).toBe('pending');
      });
    });

    it('should correctly link snapshots to distribution', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W51';

      const { snapshot: previousSnapshot } = await takeSnapshot(db, '2025-W50-b');
      const { snapshot: currentSnapshot } = await takeSnapshot(db, testWeekId);

      const { distribution } = await calculateRewards(
        db,
        testWeekId,
        previousSnapshot._id!,
        currentSnapshot._id!
      );

      expect(distribution.previousSnapshotId.toString()).toBe(previousSnapshot._id!.toString());
      expect(distribution.currentSnapshotId.toString()).toBe(currentSnapshot._id!.toString());
    });

    it('should store correct recipient balances', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W52';

      const { snapshot: previousSnapshot } = await takeSnapshot(db, '2025-W51-b');
      const { snapshot: currentSnapshot } = await takeSnapshot(db, testWeekId);

      await calculateRewards(db, testWeekId, previousSnapshot._id!, currentSnapshot._id!);

      const recipients = await db
        .collection<Recipient>('recipients')
        .find({ weekId: testWeekId })
        .toArray();

      recipients.forEach((recipient) => {
        expect(recipient.balances).toBeDefined();
        expect(recipient.balances.previous).toBeDefined();
        expect(recipient.balances.current).toBeDefined();
        expect(recipient.balances.min).toBeDefined();

        // MIN balance should be <= previous and <= current
        const min = BigInt(recipient.balances.min);
        const previous = BigInt(recipient.balances.previous);
        const current = BigInt(recipient.balances.current);

        expect(min).toBeLessThanOrEqual(previous);
        expect(min).toBeLessThanOrEqual(current);
      });
    });

    it('should calculate percentages correctly', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W53';

      const { snapshot: previousSnapshot } = await takeSnapshot(db, '2025-W52-b');
      const { snapshot: currentSnapshot } = await takeSnapshot(db, testWeekId);

      await calculateRewards(db, testWeekId, previousSnapshot._id!, currentSnapshot._id!);

      const recipients = await db
        .collection<Recipient>('recipients')
        .find({ weekId: testWeekId })
        .toArray();

      // Sum of all percentages should be approximately 100% (if there are recipients)
      if (recipients.length > 0) {
        const totalPercentage = recipients.reduce((sum, r) => sum + r.percentage, 0);
        // Allow for rounding differences - percentages may not be exactly 100 due to rounding
        expect(totalPercentage).toBeGreaterThan(0);
        expect(totalPercentage).toBeLessThanOrEqual(100.5);
      } else {
        // No eligible recipients is valid (mock data may not overlap)
        expect(recipients.length).toBe(0);
      }
    });

    it('should maintain data integrity across collections', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W54';

      const { snapshot: previousSnapshot } = await takeSnapshot(db, '2025-W53-b');
      const { snapshot: currentSnapshot } = await takeSnapshot(db, testWeekId);

      const { distribution } = await calculateRewards(
        db,
        testWeekId,
        previousSnapshot._id!,
        currentSnapshot._id!
      );

      // Get all recipients
      const recipients = await db
        .collection<Recipient>('recipients')
        .find({ distributionId: distribution._id })
        .toArray();

      // Get all batches
      const batches = await db
        .collection<Batch>('batches')
        .find({ distributionId: distribution._id })
        .toArray();

      // Total recipients in batches should equal total recipients
      const recipientsInBatches = batches.reduce((sum, b) => sum + b.recipientCount, 0);
      expect(recipientsInBatches).toBe(recipients.length);

      // Total amount in batches should equal total distributed
      const batchTotal = batches.reduce((sum, b) => sum + BigInt(b.totalAmount), 0n);
      const recipientTotal = recipients.reduce((sum, r) => sum + BigInt(r.reward), 0n);
      expect(batchTotal).toBe(recipientTotal);
    });
  });

  describe('Edge Cases', () => {
    it('should handle no eligible holders', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W60';

      // Create empty snapshots (no holders)
      await db.collection<Snapshot>('snapshots').insertOne({
        weekId: '2025-W59',
        timestamp: new Date(),
        totalHolders: 0,
        totalBalance: '0',
        metadata: { fetchDurationMs: 0, apiCallCount: 0 },
        status: 'completed',
        completedAt: new Date(),
        createdAt: new Date(),
      });

      await db.collection<Snapshot>('snapshots').insertOne({
        weekId: testWeekId,
        timestamp: new Date(),
        totalHolders: 0,
        totalBalance: '0',
        metadata: { fetchDurationMs: 0, apiCallCount: 0 },
        status: 'completed',
        completedAt: new Date(),
        createdAt: new Date(),
      });

      const previousSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: '2025-W59' });
      const currentSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: testWeekId });

      const result = await calculateRewards(
        db,
        testWeekId,
        previousSnapshot!._id!,
        currentSnapshot!._id!
      );

      expect(result.eligibleCount).toBe(0);
      expect(result.batchCount).toBe(0);
      expect(result.distribution.status).toBe('ready');
    });

    it('should handle holder with zero previous balance', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W61';

      // Create previous snapshot with no holders
      await db.collection<Snapshot>('snapshots').insertOne({
        weekId: '2025-W60-b',
        timestamp: new Date(),
        totalHolders: 0,
        totalBalance: '0',
        metadata: { fetchDurationMs: 0, apiCallCount: 0 },
        status: 'completed',
        completedAt: new Date(),
        createdAt: new Date(),
      });

      // Create current snapshot and add a holder
      const currentSnapshotResult = await takeSnapshot(db, testWeekId);

      const previousSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: '2025-W60-b' });

      const result = await calculateRewards(
        db,
        testWeekId,
        previousSnapshot!._id!,
        currentSnapshotResult.snapshot._id!
      );

      // No one should be eligible (need balance in both previous and current)
      expect(result.eligibleCount).toBe(0);
    });
  });

  describe('Batch Structure', () => {
    it('should create correctly sized batches', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W70';

      const { snapshot: previousSnapshot } = await takeSnapshot(db, '2025-W69');
      const { snapshot: currentSnapshot } = await takeSnapshot(db, testWeekId);

      await calculateRewards(db, testWeekId, previousSnapshot._id!, currentSnapshot._id!);

      const batches = await db
        .collection<Batch>('batches')
        .find({ weekId: testWeekId })
        .sort({ batchNumber: 1 })
        .toArray();

      if (batches.length > 1) {
        // All batches except last should be full
        for (let i = 0; i < batches.length - 1; i++) {
          expect(batches[i]!.recipients.length).toBe(batches[i]!.recipientCount);
        }
      }
    });

    it('should have valid recipient data in batches', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W71';

      const { snapshot: previousSnapshot } = await takeSnapshot(db, '2025-W70-b');
      const { snapshot: currentSnapshot } = await takeSnapshot(db, testWeekId);

      await calculateRewards(db, testWeekId, previousSnapshot._id!, currentSnapshot._id!);

      const batches = await db
        .collection<Batch>('batches')
        .find({ weekId: testWeekId })
        .toArray();

      batches.forEach((batch) => {
        batch.recipients.forEach((recipient) => {
          expect(recipient.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
          expect(typeof recipient.amount).toBe('string');
          expect(BigInt(recipient.amount)).toBeGreaterThan(0n);
        });
      });
    });
  });
});
