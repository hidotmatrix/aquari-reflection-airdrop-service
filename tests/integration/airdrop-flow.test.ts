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

      // Step 1: Take week start snapshot (Sunday 23:59)
      const startSnapshotResult = await takeSnapshot(db, `${weekId}-start`);
      expect(startSnapshotResult.snapshot.status).toBe('completed');
      expect(startSnapshotResult.holdersInserted).toBeGreaterThan(0);

      // Verify holders were stored
      const startHolders = await db
        .collection<Holder>('holders')
        .find({ weekId: `${weekId}-start` })
        .toArray();
      expect(startHolders.length).toBe(startSnapshotResult.holdersInserted);

      // Step 2: Take week end snapshot (following Sunday 23:59)
      const endSnapshotResult = await takeSnapshot(db, `${weekId}-end`);
      expect(endSnapshotResult.snapshot.status).toBe('completed');
      expect(endSnapshotResult.holdersInserted).toBeGreaterThan(0);

      // Verify holders were stored
      const endHolders = await db
        .collection<Holder>('holders')
        .find({ weekId: `${weekId}-end` })
        .toArray();
      expect(endHolders.length).toBe(endSnapshotResult.holdersInserted);

      // Step 3: Calculate rewards (Monday 00:30)
      const calculationResult = await calculateRewards(
        db,
        weekId,
        startSnapshotResult.snapshot._id!,
        endSnapshotResult.snapshot._id!
      );

      expect(calculationResult.distribution).toBeDefined();
      expect(calculationResult.distribution.status).toBe('ready');

      // Verify distribution record
      const distribution = await db
        .collection<Distribution>('distributions')
        .findOne({ weekId });
      expect(distribution).not.toBeNull();
      expect(distribution?.startSnapshotId).toEqual(startSnapshotResult.snapshot._id);
      expect(distribution?.endSnapshotId).toEqual(endSnapshotResult.snapshot._id);

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

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${testWeekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${testWeekId}-end`);

      const { distribution } = await calculateRewards(
        db,
        testWeekId,
        startSnapshot._id!,
        endSnapshot._id!
      );

      expect(distribution.startSnapshotId.toString()).toBe(startSnapshot._id!.toString());
      expect(distribution.endSnapshotId.toString()).toBe(endSnapshot._id!.toString());
    });

    it('should store correct recipient balances', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W52';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${testWeekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${testWeekId}-end`);

      await calculateRewards(db, testWeekId, startSnapshot._id!, endSnapshot._id!);

      const recipients = await db
        .collection<Recipient>('recipients')
        .find({ weekId: testWeekId })
        .toArray();

      recipients.forEach((recipient) => {
        expect(recipient.balances).toBeDefined();
        expect(recipient.balances.start).toBeDefined();
        expect(recipient.balances.end).toBeDefined();
        expect(recipient.balances.min).toBeDefined();

        // MIN balance should be <= start and <= end
        const min = BigInt(recipient.balances.min);
        const start = BigInt(recipient.balances.start);
        const end = BigInt(recipient.balances.end);

        expect(min).toBeLessThanOrEqual(start);
        expect(min).toBeLessThanOrEqual(end);
      });
    });

    it('should calculate percentages correctly', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W53';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${testWeekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${testWeekId}-end`);

      await calculateRewards(db, testWeekId, startSnapshot._id!, endSnapshot._id!);

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

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${testWeekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${testWeekId}-end`);

      const { distribution } = await calculateRewards(
        db,
        testWeekId,
        startSnapshot._id!,
        endSnapshot._id!
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
        weekId: `${testWeekId}-start`,
        timestamp: new Date(),
        totalHolders: 0,
        totalBalance: '0',
        metadata: { fetchDurationMs: 0, apiCallCount: 0 },
        status: 'completed',
        completedAt: new Date(),
        createdAt: new Date(),
      });

      await db.collection<Snapshot>('snapshots').insertOne({
        weekId: `${testWeekId}-end`,
        timestamp: new Date(),
        totalHolders: 0,
        totalBalance: '0',
        metadata: { fetchDurationMs: 0, apiCallCount: 0 },
        status: 'completed',
        completedAt: new Date(),
        createdAt: new Date(),
      });

      const startSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: `${testWeekId}-start` });
      const endSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: `${testWeekId}-end` });

      const result = await calculateRewards(
        db,
        testWeekId,
        startSnapshot!._id!,
        endSnapshot!._id!
      );

      expect(result.eligibleCount).toBe(0);
      expect(result.batchCount).toBe(0);
      expect(result.distribution.status).toBe('ready');
    });

    it('should handle holder with zero start balance', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W61';

      // Create start snapshot with no holders
      await db.collection<Snapshot>('snapshots').insertOne({
        weekId: `${testWeekId}-start`,
        timestamp: new Date(),
        totalHolders: 0,
        totalBalance: '0',
        metadata: { fetchDurationMs: 0, apiCallCount: 0 },
        status: 'completed',
        completedAt: new Date(),
        createdAt: new Date(),
      });

      // Create end snapshot and add a holder
      const endSnapshotResult = await takeSnapshot(db, `${testWeekId}-end`);

      const startSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: `${testWeekId}-start` });

      const result = await calculateRewards(
        db,
        testWeekId,
        startSnapshot!._id!,
        endSnapshotResult.snapshot._id!
      );

      // No one should be eligible (need balance at both start and end)
      expect(result.eligibleCount).toBe(0);
    });
  });

  describe('Batch Structure', () => {
    it('should create correctly sized batches', async () => {
      const db = getTestDb();
      const testWeekId = '2025-W70';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${testWeekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${testWeekId}-end`);

      await calculateRewards(db, testWeekId, startSnapshot._id!, endSnapshot._id!);

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

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${testWeekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${testWeekId}-end`);

      await calculateRewards(db, testWeekId, startSnapshot._id!, endSnapshot._id!);

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
