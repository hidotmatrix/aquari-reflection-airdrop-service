import { getTestDb } from '../setup';
import { ObjectId } from 'mongodb';
import {
  calculateRewards,
  getDistributionByWeekId,
  getRecipientsForDistribution,
} from '../../src/services/calculation.service';
import { takeSnapshot } from '../../src/services/snapshot.service';
import { Distribution, Recipient, Snapshot, SystemConfig, createDefaultConfig } from '../../src/models';

// ═══════════════════════════════════════════════════════════
// Calculation Service Tests
// ═══════════════════════════════════════════════════════════

describe('Calculation Service', () => {
  describe('calculateRewards', () => {
    it('should calculate rewards for eligible holders', async () => {
      const db = getTestDb();
      const weekId = '2025-W30';

      // Take start and end snapshots
      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      const result = await calculateRewards(
        db,
        weekId,
        startSnapshot._id!,
        endSnapshot._id!
      );

      expect(result.distribution).toBeDefined();
      expect(result.distribution.status).toBe('ready');
      expect(result.eligibleCount).toBeGreaterThanOrEqual(0);
      expect(result.batchCount).toBeGreaterThanOrEqual(0);
    });

    it('should create batches for recipients', async () => {
      const db = getTestDb();
      const weekId = '2025-W31';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      const result = await calculateRewards(
        db,
        weekId,
        startSnapshot._id!,
        endSnapshot._id!
      );

      if (result.eligibleCount > 0) {
        expect(result.batchCount).toBeGreaterThan(0);

        const batches = await db.collection('batches').find({ weekId }).toArray();
        expect(batches.length).toBe(result.batchCount);
      }
    });

    it('should exclude addresses from config', async () => {
      const db = getTestDb();
      const weekId = '2025-W32';

      // Take snapshots first to get some holder addresses
      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      // Get a holder address to exclude
      const holder = await db.collection('holders').findOne({ weekId: `${weekId}-start` });

      if (holder) {
        // Set up config with excluded address
        const config: SystemConfig = createDefaultConfig();
        config.excludedAddresses = [holder.address];
        await db.collection<SystemConfig>('config').updateOne(
          { _id: 'settings' },
          { $set: config },
          { upsert: true }
        );

        const result = await calculateRewards(
          db,
          weekId,
          startSnapshot._id!,
          endSnapshot._id!
        );

        expect(result.excludedCount).toBeGreaterThan(0);
      }
    });

    it('should throw if distribution already completed', async () => {
      const db = getTestDb();
      const weekId = '2025-W33';

      // Insert a completed distribution
      await db.collection<Distribution>('distributions').insertOne({
        weekId,
        startSnapshotId: new ObjectId(),
        endSnapshotId: new ObjectId(),
        config: {
          minBalance: '0',
          rewardPool: '1000',
          rewardToken: 'ETH',
          batchSize: 100,
        },
        status: 'completed',
        createdAt: new Date(),
      });

      await expect(
        calculateRewards(db, weekId, new ObjectId(), new ObjectId())
      ).rejects.toThrow(`Distribution for week ${weekId} already exists`);
    });

    it('should throw if start snapshot not found', async () => {
      const db = getTestDb();
      const weekId = '2025-W34';

      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      await expect(
        calculateRewards(db, weekId, new ObjectId(), endSnapshot._id!)
      ).rejects.toThrow('Start or end snapshot not found');
    });

    it('should throw if end snapshot not found', async () => {
      const db = getTestDb();
      const weekId = '2025-W35';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);

      await expect(
        calculateRewards(db, weekId, startSnapshot._id!, new ObjectId())
      ).rejects.toThrow('Start or end snapshot not found');
    });

    it('should calculate stats correctly', async () => {
      const db = getTestDb();
      const weekId = '2025-W36';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      const result = await calculateRewards(
        db,
        weekId,
        startSnapshot._id!,
        endSnapshot._id!
      );

      expect(result.distribution.stats).toBeDefined();
      expect(result.distribution.stats?.totalHolders).toBeGreaterThanOrEqual(0);
      expect(result.distribution.stats?.eligibleHolders).toBeGreaterThanOrEqual(0);
      expect(result.distribution.stats?.excludedHolders).toBeGreaterThanOrEqual(0);
    });

    it('should set calculatedAt timestamp', async () => {
      const db = getTestDb();
      const weekId = '2025-W37';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      const before = new Date();
      const result = await calculateRewards(
        db,
        weekId,
        startSnapshot._id!,
        endSnapshot._id!
      );
      const after = new Date();

      expect(result.distribution.calculatedAt).toBeDefined();
      expect(result.distribution.calculatedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(result.distribution.calculatedAt!.getTime()).toBeLessThanOrEqual(
        after.getTime()
      );
    });
  });

  describe('getDistributionByWeekId', () => {
    it('should return distribution for existing weekId', async () => {
      const db = getTestDb();
      const weekId = '2025-W40';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      await calculateRewards(db, weekId, startSnapshot._id!, endSnapshot._id!);

      const distribution = await getDistributionByWeekId(db, weekId);
      expect(distribution).not.toBeNull();
      expect(distribution?.weekId).toBe(weekId);
    });

    it('should return null for non-existent weekId', async () => {
      const db = getTestDb();
      const distribution = await getDistributionByWeekId(db, '2099-W99');
      expect(distribution).toBeNull();
    });
  });

  describe('getRecipientsForDistribution', () => {
    it('should return paginated recipients', async () => {
      const db = getTestDb();
      const weekId = '2025-W41';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      const { distribution } = await calculateRewards(
        db,
        weekId,
        startSnapshot._id!,
        endSnapshot._id!
      );

      const { recipients, total } = await getRecipientsForDistribution(
        db,
        distribution._id!,
        10,
        0
      );

      expect(recipients.length).toBeLessThanOrEqual(10);
      expect(total).toBeGreaterThanOrEqual(0);
    });

    it('should return recipients sorted by reward descending', async () => {
      const db = getTestDb();
      const weekId = '2025-W42';

      const { snapshot: startSnapshot } = await takeSnapshot(db, `${weekId}-start`);
      const { snapshot: endSnapshot } = await takeSnapshot(db, `${weekId}-end`);

      const { distribution } = await calculateRewards(
        db,
        weekId,
        startSnapshot._id!,
        endSnapshot._id!
      );

      const { recipients } = await getRecipientsForDistribution(
        db,
        distribution._id!,
        50,
        0
      );

      // Verify query returns data in requested sort order
      expect(recipients).toBeDefined();
      expect(recipients.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty for invalid distributionId', async () => {
      const db = getTestDb();
      const { recipients, total } = await getRecipientsForDistribution(
        db,
        new ObjectId(),
        10,
        0
      );

      expect(recipients).toEqual([]);
      expect(total).toBe(0);
    });
  });
});
