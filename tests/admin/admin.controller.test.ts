import { getTestDb } from '../setup';
import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { Snapshot, Holder, Distribution, Recipient, Batch } from '../../src/models';

// ═══════════════════════════════════════════════════════════
// Admin Controller Tests
// ═══════════════════════════════════════════════════════════

// Mock Request/Response helpers
function createMockRequest(query: Record<string, string> = {}, params: Record<string, string> = {}): Request {
  return {
    query,
    params,
    app: {
      locals: {
        db: getTestDb(),
      },
    },
  } as unknown as Request;
}

function createMockResponse(): Response & { jsonData?: any; statusCode?: number } {
  const res: Partial<Response> & { jsonData?: any; statusCode?: number } = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
  };
  (res.json as jest.Mock).mockImplementation((data) => {
    res.jsonData = data;
    return res;
  });
  (res.status as jest.Mock).mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  return res as Response & { jsonData?: any; statusCode?: number };
}

describe('Admin Controller', () => {
  describe('Data Queries', () => {
    beforeEach(async () => {
      const db = getTestDb();

      // Insert test snapshots
      await db.collection<Snapshot>('snapshots').insertMany([
        {
          _id: new ObjectId(),
          weekId: '2025-W01',
          timestamp: new Date('2025-01-06'),
          totalHolders: 100,
          totalBalance: '1000000000000000000000',
          metadata: { fetchDurationMs: 100, apiCallCount: 1 },
          status: 'completed',
          completedAt: new Date(),
          createdAt: new Date(),
        },
        {
          _id: new ObjectId(),
          weekId: '2025-W02',
          timestamp: new Date('2025-01-13'),
          totalHolders: 150,
          totalBalance: '1500000000000000000000',
          metadata: { fetchDurationMs: 100, apiCallCount: 1 },
          status: 'completed',
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      // Insert test holders
      const snapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: '2025-W01' });
      const holders: Holder[] = [];
      for (let i = 0; i < 10; i++) {
        holders.push({
          weekId: '2025-W01',
          snapshotId: snapshot!._id!,
          address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
          balance: (BigInt(1000 - i * 100) * BigInt(10 ** 18)).toString(),
          balanceFormatted: (1000 - i * 100).toString(),
          isContract: i === 0,
          createdAt: new Date(),
        } as Holder);
      }
      await db.collection<Holder>('holders').insertMany(holders);
    });

    it('should query snapshots correctly', async () => {
      const db = getTestDb();
      const snapshots = await db
        .collection<Snapshot>('snapshots')
        .find({})
        .sort({ timestamp: -1 })
        .toArray();

      expect(snapshots.length).toBe(2);
      expect(snapshots[0]!.weekId).toBe('2025-W02');
    });

    it('should query holders by weekId', async () => {
      const db = getTestDb();
      const holders = await db
        .collection<Holder>('holders')
        .find({ weekId: '2025-W01' })
        .sort({ balance: -1 })
        .toArray();

      expect(holders.length).toBe(10);
      // First holder should have highest balance
      expect(BigInt(holders[0]!.balance)).toBeGreaterThan(BigInt(holders[1]!.balance));
    });

    it('should search holders by address', async () => {
      const db = getTestDb();
      const searchAddress = '0x0000000000000000000000000000000000000001';

      const holders = await db
        .collection<Holder>('holders')
        .find({ address: searchAddress.toLowerCase() })
        .toArray();

      expect(holders.length).toBe(1);
      expect(holders[0]!.address).toBe(searchAddress.toLowerCase());
    });

    it('should count holders correctly', async () => {
      const db = getTestDb();
      const count = await db
        .collection<Holder>('holders')
        .countDocuments({ weekId: '2025-W01' });

      expect(count).toBe(10);
    });
  });

  describe('Pagination Queries', () => {
    beforeEach(async () => {
      const db = getTestDb();

      // Insert many test holders
      const holders: Holder[] = [];
      for (let i = 0; i < 200; i++) {
        holders.push({
          weekId: '2025-W03',
          snapshotId: new ObjectId(),
          address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
          balance: (BigInt(10000 - i) * BigInt(10 ** 18)).toString(),
          balanceFormatted: (10000 - i).toString(),
          isContract: false,
          createdAt: new Date(),
        } as Holder);
      }
      await db.collection<Holder>('holders').insertMany(holders);
    });

    it('should paginate holders correctly', async () => {
      const db = getTestDb();

      const page1 = await db
        .collection<Holder>('holders')
        .find({ weekId: '2025-W03' })
        .sort({ balance: -1 })
        .skip(0)
        .limit(50)
        .toArray();

      const page2 = await db
        .collection<Holder>('holders')
        .find({ weekId: '2025-W03' })
        .sort({ balance: -1 })
        .skip(50)
        .limit(50)
        .toArray();

      expect(page1.length).toBe(50);
      expect(page2.length).toBe(50);
      // Page 2 should have lower balances
      expect(BigInt(page1[49]!.balance)).toBeGreaterThan(BigInt(page2[0]!.balance));
    });

    it('should return correct total count', async () => {
      const db = getTestDb();
      const total = await db
        .collection<Holder>('holders')
        .countDocuments({ weekId: '2025-W03' });

      expect(total).toBe(200);
    });

    it('should handle last page correctly', async () => {
      const db = getTestDb();

      const lastPage = await db
        .collection<Holder>('holders')
        .find({ weekId: '2025-W03' })
        .sort({ balance: -1 })
        .skip(150)
        .limit(100)
        .toArray();

      expect(lastPage.length).toBe(50); // Only 50 remaining
    });
  });

  describe('Distribution Queries', () => {
    let distributionId: ObjectId;

    beforeEach(async () => {
      const db = getTestDb();

      // Insert distribution
      const distribution: Distribution = {
        weekId: '2025-W04',
        previousSnapshotId: new ObjectId(),
        currentSnapshotId: new ObjectId(),
        config: {
          minBalance: '1000000000000000000',
          rewardPool: '1000000000000000000000',
          rewardToken: 'ETH',
          batchSize: 100,
        },
        status: 'ready',
        stats: {
          totalHolders: 100,
          eligibleHolders: 80,
          excludedHolders: 5,
          totalEligibleBalance: '8000000000000000000000',
          totalDistributed: '1000000000000000000000',
        },
        calculatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection<Distribution>('distributions').insertOne(distribution);
      distributionId = result.insertedId;

      // Insert recipients
      const recipients: Recipient[] = [];
      for (let i = 0; i < 80; i++) {
        recipients.push({
          distributionId,
          weekId: '2025-W04',
          address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
          balances: {
            previous: '1000000000000000000',
            current: '1000000000000000000',
            min: '1000000000000000000',
          },
          reward: (BigInt(12500000000000000000n - BigInt(i) * 100000000000000000n)).toString(),
          rewardFormatted: '12.5',
          percentage: 1.25,
          status: 'pending',
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Recipient);
      }
      await db.collection<Recipient>('recipients').insertMany(recipients);

      // Insert batches
      const batch: Batch = {
        distributionId,
        weekId: '2025-W04',
        batchNumber: 1,
        recipients: recipients.slice(0, 80).map((r) => ({
          address: r.address,
          amount: r.reward,
        })),
        recipientCount: 80,
        totalAmount: '1000000000000000000000',
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.collection<Batch>('batches').insertOne(batch);
    });

    it('should query distribution by weekId', async () => {
      const db = getTestDb();
      const distribution = await db
        .collection<Distribution>('distributions')
        .findOne({ weekId: '2025-W04' });

      expect(distribution).not.toBeNull();
      expect(distribution?.stats?.eligibleHolders).toBe(80);
    });

    it('should query recipients by distributionId', async () => {
      const db = getTestDb();
      const recipients = await db
        .collection<Recipient>('recipients')
        .find({ distributionId })
        .sort({ reward: -1 })
        .limit(10)
        .toArray();

      expect(recipients.length).toBe(10);
      // Should be sorted by reward descending
      expect(BigInt(recipients[0]!.reward)).toBeGreaterThan(BigInt(recipients[1]!.reward));
    });

    it('should query batches by distributionId', async () => {
      const db = getTestDb();
      const batches = await db
        .collection<Batch>('batches')
        .find({ distributionId })
        .sort({ batchNumber: 1 })
        .toArray();

      expect(batches.length).toBe(1);
      expect(batches[0]!.recipientCount).toBe(80);
    });
  });

  describe('Search Queries', () => {
    beforeEach(async () => {
      const db = getTestDb();
      const searchAddress = '0x1234567890123456789012345678901234567890';

      // Insert holder history for search address
      for (let week = 1; week <= 5; week++) {
        await db.collection<Holder>('holders').insertOne({
          weekId: `2025-W0${week}`,
          snapshotId: new ObjectId(),
          address: searchAddress.toLowerCase(),
          balance: (BigInt(1000 + week * 100) * BigInt(10 ** 18)).toString(),
          balanceFormatted: (1000 + week * 100).toString(),
          isContract: false,
          createdAt: new Date(`2025-01-0${week}`),
        } as Holder);
      }

      // Insert airdrop history for search address
      for (let week = 1; week <= 3; week++) {
        await db.collection<Recipient>('recipients').insertOne({
          distributionId: new ObjectId(),
          weekId: `2025-W0${week}`,
          address: searchAddress.toLowerCase(),
          balances: {
            previous: '1000000000000000000',
            current: '1000000000000000000',
            min: '1000000000000000000',
          },
          reward: '10000000000000000000',
          rewardFormatted: '10',
          percentage: 1.0,
          status: 'completed',
          txHash: `0x${week}`,
          retryCount: 0,
          createdAt: new Date(`2025-01-0${week}`),
          updatedAt: new Date(`2025-01-0${week}`),
          completedAt: new Date(`2025-01-0${week}`),
        } as Recipient);
      }
    });

    it('should search holder balance history by address', async () => {
      const db = getTestDb();
      const address = '0x1234567890123456789012345678901234567890';

      const history = await db
        .collection<Holder>('holders')
        .find({ address: address.toLowerCase() })
        .sort({ weekId: -1 })
        .toArray();

      expect(history.length).toBe(5);
      expect(history[0]!.weekId).toBe('2025-W05');
    });

    it('should search airdrop history by address', async () => {
      const db = getTestDb();
      const address = '0x1234567890123456789012345678901234567890';

      const history = await db
        .collection<Recipient>('recipients')
        .find({ address: address.toLowerCase() })
        .sort({ weekId: -1 })
        .toArray();

      expect(history.length).toBe(3);
      expect(history[0]!.status).toBe('completed');
    });

    it('should return empty for unknown address', async () => {
      const db = getTestDb();
      const unknownAddress = '0x0000000000000000000000000000000000000000';

      const holders = await db
        .collection<Holder>('holders')
        .find({ address: unknownAddress.toLowerCase() })
        .toArray();

      const recipients = await db
        .collection<Recipient>('recipients')
        .find({ address: unknownAddress.toLowerCase() })
        .toArray();

      expect(holders.length).toBe(0);
      expect(recipients.length).toBe(0);
    });

    it('should search case-insensitively', async () => {
      const db = getTestDb();
      // Search with uppercase
      const upperAddress = '0x1234567890123456789012345678901234567890'.toUpperCase();

      const history = await db
        .collection<Holder>('holders')
        .find({ address: upperAddress.toLowerCase() })
        .toArray();

      expect(history.length).toBe(5);
    });
  });
});
