import { ObjectId } from 'mongodb';
import {
  createBatch,
  createBatches,
  BatchRecipient,
} from '../../src/models/Batch';

// ═══════════════════════════════════════════════════════════
// Batch Model Tests
// ═══════════════════════════════════════════════════════════

describe('Batch Model', () => {
  describe('createBatch', () => {
    const distributionId = new ObjectId();
    const weekId = '2025-W04';
    const recipients: BatchRecipient[] = [
      { address: '0x1111111111111111111111111111111111111111', amount: '1000' },
      { address: '0x2222222222222222222222222222222222222222', amount: '2000' },
    ];

    it('should create batch with correct structure', () => {
      const batch = createBatch({
        distributionId,
        weekId,
        batchNumber: 1,
        recipients,
      });

      expect(batch.distributionId).toBe(distributionId);
      expect(batch.weekId).toBe(weekId);
      expect(batch.batchNumber).toBe(1);
      expect(batch.recipients).toEqual(recipients);
    });

    it('should set default status to pending', () => {
      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients });
      expect(batch.status).toBe('pending');
    });

    it('should set retryCount to 0', () => {
      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients });
      expect(batch.retryCount).toBe(0);
    });

    it('should set default maxRetries to 3', () => {
      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients });
      expect(batch.maxRetries).toBe(3);
    });

    it('should allow custom maxRetries', () => {
      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients, maxRetries: 5 });
      expect(batch.maxRetries).toBe(5);
    });

    it('should calculate totalAmount correctly', () => {
      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients });
      expect(batch.totalAmount).toBe('3000'); // 1000 + 2000
    });

    it('should calculate recipientCount correctly', () => {
      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients });
      expect(batch.recipientCount).toBe(2);
    });

    it('should set createdAt and updatedAt timestamps', () => {
      const before = new Date();
      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients });
      const after = new Date();

      expect(batch.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(batch.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(batch.updatedAt.getTime()).toEqual(batch.createdAt.getTime());
    });

    it('should handle empty recipients array', () => {
      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients: [] });

      expect(batch.recipients).toEqual([]);
      expect(batch.recipientCount).toBe(0);
      expect(batch.totalAmount).toBe('0');
    });

    it('should handle large amounts correctly', () => {
      const largeRecipients: BatchRecipient[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '999999999000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '1000000000000000000000' },
      ];

      const batch = createBatch({ distributionId, weekId, batchNumber: 1, recipients: largeRecipients });
      // 999999999000000000000000000 + 1000000000000000000000 = 1000000999000000000000000000
      expect(batch.totalAmount).toBe('1000000999000000000000000000');
    });

    it('should preserve batch number', () => {
      const batch1 = createBatch({ distributionId, weekId, batchNumber: 1, recipients });
      const batch2 = createBatch({ distributionId, weekId, batchNumber: 5, recipients });
      const batch3 = createBatch({ distributionId, weekId, batchNumber: 100, recipients });

      expect(batch1.batchNumber).toBe(1);
      expect(batch2.batchNumber).toBe(5);
      expect(batch3.batchNumber).toBe(100);
    });
  });

  describe('createBatches', () => {
    const distributionId = new ObjectId();
    const weekId = '2025-W04';

    it('should split recipients into batches of specified size', () => {
      const recipients: BatchRecipient[] = [];
      for (let i = 0; i < 250; i++) {
        recipients.push({
          address: `0x${i.toString().padStart(40, '0')}`,
          amount: '1000',
        });
      }

      const batches = createBatches(distributionId, weekId, recipients, 100);

      expect(batches.length).toBe(3);
      expect(batches[0]!.recipients.length).toBe(100);
      expect(batches[1]!.recipients.length).toBe(100);
      expect(batches[2]!.recipients.length).toBe(50);
    });

    it('should assign sequential batch numbers starting from 1', () => {
      const recipients: BatchRecipient[] = [];
      for (let i = 0; i < 150; i++) {
        recipients.push({
          address: `0x${i.toString().padStart(40, '0')}`,
          amount: '1000',
        });
      }

      const batches = createBatches(distributionId, weekId, recipients, 50);

      expect(batches[0]!.batchNumber).toBe(1);
      expect(batches[1]!.batchNumber).toBe(2);
      expect(batches[2]!.batchNumber).toBe(3);
    });

    it('should return empty array for empty recipients', () => {
      const batches = createBatches(distributionId, weekId, [], 100);
      expect(batches).toEqual([]);
    });

    it('should create single batch when recipients < batchSize', () => {
      const recipients: BatchRecipient[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000' },
      ];

      const batches = createBatches(distributionId, weekId, recipients, 100);

      expect(batches.length).toBe(1);
      expect(batches[0]!.recipients.length).toBe(2);
    });

    it('should create exact batches when recipients === batchSize', () => {
      const recipients: BatchRecipient[] = [];
      for (let i = 0; i < 100; i++) {
        recipients.push({
          address: `0x${i.toString().padStart(40, '0')}`,
          amount: '1000',
        });
      }

      const batches = createBatches(distributionId, weekId, recipients, 100);

      expect(batches.length).toBe(1);
      expect(batches[0]!.recipients.length).toBe(100);
    });

    it('should set same distributionId for all batches', () => {
      const recipients: BatchRecipient[] = [];
      for (let i = 0; i < 250; i++) {
        recipients.push({
          address: `0x${i.toString().padStart(40, '0')}`,
          amount: '1000',
        });
      }

      const batches = createBatches(distributionId, weekId, recipients, 100);

      batches.forEach(batch => {
        expect(batch.distributionId).toBe(distributionId);
      });
    });

    it('should set same weekId for all batches', () => {
      const recipients: BatchRecipient[] = [];
      for (let i = 0; i < 250; i++) {
        recipients.push({
          address: `0x${i.toString().padStart(40, '0')}`,
          amount: '1000',
        });
      }

      const batches = createBatches(distributionId, weekId, recipients, 100);

      batches.forEach(batch => {
        expect(batch.weekId).toBe(weekId);
      });
    });

    it('should calculate totalAmount correctly for each batch', () => {
      const recipients: BatchRecipient[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000' },
        { address: '0x3333333333333333333333333333333333333333', amount: '3000' },
      ];

      const batches = createBatches(distributionId, weekId, recipients, 2);

      expect(batches[0]!.totalAmount).toBe('3000'); // 1000 + 2000
      expect(batches[1]!.totalAmount).toBe('3000'); // 3000
    });

    it('should handle batch size of 1', () => {
      const recipients: BatchRecipient[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000' },
        { address: '0x3333333333333333333333333333333333333333', amount: '3000' },
      ];

      const batches = createBatches(distributionId, weekId, recipients, 1);

      expect(batches.length).toBe(3);
      expect(batches[0]!.recipients.length).toBe(1);
      expect(batches[1]!.recipients.length).toBe(1);
      expect(batches[2]!.recipients.length).toBe(1);
    });
  });
});
