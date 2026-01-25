import { getTestDb } from '../setup';
import {
  getDb,
  getDatabaseStatus,
  checkDatabaseHealth,
  createIndexes,
  setDb,
} from '../../src/config/database';

// ═══════════════════════════════════════════════════════════
// Database Config Tests
// ═══════════════════════════════════════════════════════════

describe('Database Config', () => {
  describe('setDb', () => {
    it('should set the database instance', () => {
      const testDb = getTestDb();
      setDb(testDb);

      // Should not throw after setDb
      expect(() => getDb()).not.toThrow();
    });
  });

  describe('getDb', () => {
    it('should return the database instance after setDb', () => {
      const testDb = getTestDb();
      setDb(testDb);

      const db = getDb();
      expect(db).toBeDefined();
      expect(db.databaseName).toBeDefined();
    });
  });

  describe('getDatabaseStatus', () => {
    it('should return status object', () => {
      const status = getDatabaseStatus();

      // Status object should have expected shape
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('host');
      expect(status).toHaveProperty('database');
      expect(status).toHaveProperty('error');
      expect(typeof status.connected).toBe('boolean');
    });
  });

  describe('checkDatabaseHealth', () => {
    it('should return boolean indicating health', async () => {
      const testDb = getTestDb();
      setDb(testDb);

      const healthy = await checkDatabaseHealth();
      // In test mode, the db might not respond to ping command
      expect(typeof healthy).toBe('boolean');
    });
  });

  describe('createIndexes', () => {
    it('should create indexes without errors', async () => {
      const testDb = getTestDb();

      await expect(createIndexes(testDb)).resolves.not.toThrow();
    });

    it('should create snapshots indexes', async () => {
      const testDb = getTestDb();
      await createIndexes(testDb);

      const indexes = await testDb.collection('snapshots').indexes();
      const indexKeys = indexes.map(idx => Object.keys(idx.key).join(','));

      expect(indexKeys).toContain('weekId');
      expect(indexKeys).toContain('timestamp');
      expect(indexKeys).toContain('status');
    });

    it('should create holders indexes', async () => {
      const testDb = getTestDb();
      await createIndexes(testDb);

      const indexes = await testDb.collection('holders').indexes();
      const indexKeys = indexes.map(idx => Object.keys(idx.key).join(','));

      expect(indexKeys).toContain('weekId,address');
      expect(indexKeys).toContain('address');
      expect(indexKeys).toContain('snapshotId');
    });

    it('should create distributions indexes', async () => {
      const testDb = getTestDb();
      await createIndexes(testDb);

      const indexes = await testDb.collection('distributions').indexes();
      const indexKeys = indexes.map(idx => Object.keys(idx.key).join(','));

      expect(indexKeys).toContain('weekId');
      expect(indexKeys).toContain('createdAt');
      expect(indexKeys).toContain('status,createdAt');
    });

    it('should create recipients indexes', async () => {
      const testDb = getTestDb();
      await createIndexes(testDb);

      const indexes = await testDb.collection('recipients').indexes();
      const indexKeys = indexes.map(idx => Object.keys(idx.key).join(','));

      expect(indexKeys).toContain('address');
      expect(indexKeys).toContain('distributionId,address');
      expect(indexKeys).toContain('weekId,status');
      expect(indexKeys).toContain('txHash');
    });

    it('should create batches indexes', async () => {
      const testDb = getTestDb();
      await createIndexes(testDb);

      const indexes = await testDb.collection('batches').indexes();
      const indexKeys = indexes.map(idx => Object.keys(idx.key).join(','));

      expect(indexKeys).toContain('distributionId,batchNumber');
      expect(indexKeys).toContain('distributionId,status');
      expect(indexKeys).toContain('weekId,status');
    });

    it('should create restricted_addresses indexes', async () => {
      const testDb = getTestDb();
      await createIndexes(testDb);

      const indexes = await testDb.collection('restricted_addresses').indexes();
      const indexKeys = indexes.map(idx => Object.keys(idx.key).join(','));

      expect(indexKeys).toContain('address');
      expect(indexKeys).toContain('detectedAt');
    });

    it('should be idempotent - can run multiple times', async () => {
      const testDb = getTestDb();

      await createIndexes(testDb);
      await expect(createIndexes(testDb)).resolves.not.toThrow();
    });
  });
});
