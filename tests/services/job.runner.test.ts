import { getTestDb } from '../setup';
import { ObjectId } from 'mongodb';
import { createNewJob } from '../../src/services/job.service';
import { Job } from '../../src/models/Job';

// ═══════════════════════════════════════════════════════════
// Job Runner Tests
// Note: We test job creation via createNewJob to avoid background
// job execution which causes issues with test cleanup
// ═══════════════════════════════════════════════════════════

describe('Job Runner', () => {
  describe('createNewJob (job creation logic)', () => {
    it('should create and return a new job', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W80');

      expect(job).toBeDefined();
      expect(job.type).toBe('snapshot');
      expect(job.weekId).toBe('2025-W80');
      expect(job._id).toBeDefined();
    });

    it('should return existing running job instead of creating new one', async () => {
      const db = getTestDb();

      // Create a running job first
      const existingJob: Job = {
        type: 'calculation',
        weekId: '2025-W81-jr',
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
        logs: [],
      };
      const insertResult = await db.collection<Job>('jobs').insertOne(existingJob);
      existingJob._id = insertResult.insertedId;

      // Try to create same job
      const job = await createNewJob(db, 'calculation', '2025-W81-jr');

      expect(job._id!.toString()).toBe(existingJob._id!.toString());
    });

    it('should return existing pending job', async () => {
      const db = getTestDb();

      // Create a pending job
      const existingJob: Job = {
        type: 'airdrop',
        weekId: '2025-W82-jr',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        logs: [],
      };
      const insertResult = await db.collection<Job>('jobs').insertOne(existingJob);

      // Try to create same job
      const job = await createNewJob(db, 'airdrop', '2025-W82-jr');

      expect(job._id!.toString()).toBe(insertResult.insertedId.toString());
    });

    it('should create new job if previous is completed', async () => {
      const db = getTestDb();

      // Create a completed job
      await db.collection<Job>('jobs').insertOne({
        type: 'snapshot',
        weekId: '2025-W83-jr',
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
        logs: [],
      });

      // Should create a new job
      const job = await createNewJob(db, 'snapshot', '2025-W83-jr');

      expect(job.status).toBe('pending');
    });

    it('should create new job if previous is failed', async () => {
      const db = getTestDb();

      // Create a failed job
      await db.collection<Job>('jobs').insertOne({
        type: 'snapshot',
        weekId: '2025-W84-jr',
        status: 'failed',
        createdAt: new Date(),
        updatedAt: new Date(),
        logs: [],
      });

      // Should create a new job
      const job = await createNewJob(db, 'snapshot', '2025-W84-jr');

      expect(job.status).toBe('pending');
    });

    it('should support full-flow job type', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'full-flow', '2025-W85-jr');

      expect(job.type).toBe('full-flow');
    });

    it('should create different jobs for different weeks', async () => {
      const db = getTestDb();

      const job1 = await createNewJob(db, 'snapshot', '2025-W87-jr');
      const job2 = await createNewJob(db, 'snapshot', '2025-W88-jr');

      expect(job1._id!.toString()).not.toBe(job2._id!.toString());
    });

    it('should create different jobs for different types', async () => {
      const db = getTestDb();

      const snapshotJob = await createNewJob(db, 'snapshot', '2025-W89-jr');
      const calcJob = await createNewJob(db, 'calculation', '2025-W89-jr');
      const airdropJob = await createNewJob(db, 'airdrop', '2025-W89-jr');

      expect(snapshotJob._id!.toString()).not.toBe(calcJob._id!.toString());
      expect(calcJob._id!.toString()).not.toBe(airdropJob._id!.toString());
    });
  });
});
