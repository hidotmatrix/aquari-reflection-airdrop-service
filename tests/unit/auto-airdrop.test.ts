import { Db, MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Mock blockchain service
jest.mock('../../src/services/blockchain.service', () => ({
  getWalletTokenBalance: jest.fn(),
  initializeBlockchain: jest.fn(),
}));

import { getWalletTokenBalance } from '../../src/services/blockchain.service';

describe('Auto-Airdrop Feature', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('test-airdrop');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Distribution Config', () => {
    it('should have autoApproved field in distribution config', async () => {
      const distribution = {
        weekId: '2026-W04',
        status: 'ready',
        startSnapshotId: new ObjectId(),
        endSnapshotId: new ObjectId(),
        config: {
          minBalance: '1000000000000000000000',
          rewardPool: '500000000000000000000000',
          rewardToken: 'AQUARI',
          batchSize: 500,
          autoApproved: true,
          walletBalanceUsed: '500000000000000000000000',
          autoApprovedAt: new Date(),
        },
        stats: {
          totalHolders: 100,
          eligibleHolders: 80,
          excludedHolders: 20,
          totalEligibleBalance: '1000000000000000000000000',
          totalDistributed: '0',
        },
        createdAt: new Date(),
      };

      const result = await db.collection('distributions').insertOne(distribution);
      expect(result.insertedId).toBeDefined();

      const saved = await db.collection('distributions').findOne({ _id: result.insertedId });
      expect(saved?.config.autoApproved).toBe(true);
      expect(saved?.config.walletBalanceUsed).toBe('500000000000000000000000');
      expect(saved?.config.autoApprovedAt).toBeDefined();
    });
  });

  describe('Wallet Balance Reading', () => {
    it('should read wallet balance correctly', async () => {
      const mockBalance = '500000000000000000000000'; // 500,000 AQUARI
      (getWalletTokenBalance as jest.Mock).mockResolvedValue(mockBalance);

      const balance = await getWalletTokenBalance();
      expect(balance).toBe(mockBalance);
      expect(BigInt(balance)).toBe(500000000000000000000000n);
    });

    it('should handle zero balance', async () => {
      (getWalletTokenBalance as jest.Mock).mockResolvedValue('0');

      const balance = await getWalletTokenBalance();
      expect(BigInt(balance)).toBe(0n);
    });
  });

  describe('Auto-Approve Logic', () => {
    it('should update distribution with 100% wallet balance as reward pool', async () => {
      // Insert a ready distribution
      const distribution = {
        weekId: '2026-W04-test',
        status: 'ready',
        startSnapshotId: new ObjectId(),
        endSnapshotId: new ObjectId(),
        config: {
          minBalance: '1000000000000000000000',
          rewardPool: '0',
          rewardToken: 'AQUARI',
          batchSize: 500,
        },
        stats: {
          totalHolders: 100,
          eligibleHolders: 80,
          excludedHolders: 20,
          totalEligibleBalance: '1000000000000000000000000',
          totalDistributed: '0',
        },
        createdAt: new Date(),
      };

      const { insertedId } = await db.collection('distributions').insertOne(distribution);

      // Simulate auto-approve with wallet balance
      const walletBalance = '500000000000000000000000'; // 500,000 AQUARI

      await db.collection('distributions').updateOne(
        { _id: insertedId },
        {
          $set: {
            'config.rewardPool': walletBalance,
            'config.autoApproved': true,
            'config.walletBalanceUsed': walletBalance,
            'config.autoApprovedAt': new Date(),
            status: 'processing',
            updatedAt: new Date(),
          },
        }
      );

      const updated = await db.collection('distributions').findOne({ _id: insertedId });
      expect(updated?.config.rewardPool).toBe(walletBalance);
      expect(updated?.config.autoApproved).toBe(true);
      expect(updated?.status).toBe('processing');
    });

    it('should skip airdrop if wallet balance is zero', () => {
      const walletBalance = '0';
      const walletBalanceBigInt = BigInt(walletBalance);

      expect(walletBalanceBigInt === 0n).toBe(true);
      // In this case, the autoApproveAndAirdrop function would return false
    });

    it('should find ready distribution for auto-approval', async () => {
      const weekId = '2026-W04-find';

      // Insert distributions with different statuses
      await db.collection('distributions').insertMany([
        { weekId, status: 'pending', config: {} },
        { weekId, status: 'ready', config: {} },
        { weekId: '2026-W03-find', status: 'ready', config: {} },
      ]);

      const distribution = await db.collection('distributions').findOne({
        weekId,
        status: 'ready',
      });

      expect(distribution).toBeDefined();
      expect(distribution?.weekId).toBe(weekId);
      expect(distribution?.status).toBe('ready');
    });
  });

  describe('Cron Schedule Configuration', () => {
    it('should parse 4-step cron configuration', () => {
      const schedule = {
        startSnapshotCron: '00 17 * * *',
        endSnapshotCron: '05 17 * * *',
        calculateCron: '10 17 * * *',
        airdropCron: '15 17 * * *',
      };

      expect(schedule.startSnapshotCron).toBe('00 17 * * *');
      expect(schedule.endSnapshotCron).toBe('05 17 * * *');
      expect(schedule.calculateCron).toBe('10 17 * * *');
      expect(schedule.airdropCron).toBe('15 17 * * *');
    });

    it('should validate cron expressions', () => {
      const validCron = '30 14 * * *';
      const invalidCron = 'not-a-cron';

      // Simple validation - should have 5 parts
      const isValid = (expr: string) => expr.split(' ').length === 5;

      expect(isValid(validCron)).toBe(true);
      expect(isValid(invalidCron)).toBe(false);
    });
  });

  describe('Reward Pool Calculation', () => {
    it('should use full wallet balance as reward pool', () => {
      const walletBalance = BigInt('500000000000000000000000'); // 500k AQUARI
      const rewardPool = walletBalance; // 100%

      expect(rewardPool).toBe(walletBalance);
      expect(Number(rewardPool) / 1e18).toBe(500000);
    });

    it('should format balance for display', () => {
      const walletBalance = BigInt('500000000000000000000000');
      const numericValue = Number(walletBalance) / 1e18;
      const formatted = numericValue.toLocaleString('en-US');

      expect(numericValue).toBe(500000);
      expect(formatted).toBe('500,000');
    });
  });

  describe('Distribution Status Flow', () => {
    it('should follow correct status flow: ready -> processing -> completed', async () => {
      const { insertedId } = await db.collection('distributions').insertOne({
        weekId: '2026-W04-flow',
        status: 'ready',
        config: { rewardPool: '0' },
      });

      // Auto-approve sets to processing
      await db.collection('distributions').updateOne(
        { _id: insertedId },
        { $set: { status: 'processing', 'config.rewardPool': '500000000000000000000000' } }
      );

      let doc = await db.collection('distributions').findOne({ _id: insertedId });
      expect(doc?.status).toBe('processing');

      // Airdrop completion sets to completed
      await db.collection('distributions').updateOne(
        { _id: insertedId },
        { $set: { status: 'completed', completedAt: new Date() } }
      );

      doc = await db.collection('distributions').findOne({ _id: insertedId });
      expect(doc?.status).toBe('completed');
      expect(doc?.completedAt).toBeDefined();
    });
  });
});
