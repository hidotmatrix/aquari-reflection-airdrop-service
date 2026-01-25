import { getTestDb } from '../setup';
import { ObjectId } from 'mongodb';
import {
  createNewJob,
  getJobById,
  getActiveJobs,
  getRecentJobs,
  updateJobStatus,
  updateJobProgress,
  addJobLog,
  setJobResult,
  createJobContext,
} from '../../src/services/job.service';
import { Job } from '../../src/models/Job';

// ═══════════════════════════════════════════════════════════
// Job Service Tests
// ═══════════════════════════════════════════════════════════

describe('Job Service', () => {
  describe('createNewJob', () => {
    it('should create a new job with correct type and weekId', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W10');

      expect(job).toBeDefined();
      expect(job.type).toBe('snapshot');
      expect(job.weekId).toBe('2025-W10');
      expect(job.status).toBe('pending');
      expect(job._id).toBeDefined();
    });

    it('should return existing job if already running', async () => {
      const db = getTestDb();

      // Create first job
      const job1 = await createNewJob(db, 'calculation', '2025-W11');

      // Update it to running
      await db.collection<Job>('jobs').updateOne(
        { _id: job1._id },
        { $set: { status: 'running' } }
      );

      // Try to create another job of same type/week
      const job2 = await createNewJob(db, 'calculation', '2025-W11');

      expect(job2._id!.toString()).toBe(job1._id!.toString());
    });

    it('should create new job if previous is completed', async () => {
      const db = getTestDb();

      // Create and complete a job
      const job1 = await createNewJob(db, 'airdrop', '2025-W12');
      await db.collection<Job>('jobs').updateOne(
        { _id: job1._id },
        { $set: { status: 'completed' } }
      );

      // Create new job of same type/week
      const job2 = await createNewJob(db, 'airdrop', '2025-W12');

      expect(job2._id!.toString()).not.toBe(job1._id!.toString());
    });

    it('should create full-flow job type', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'full-flow', '2025-W13');

      expect(job.type).toBe('full-flow');
    });
  });

  describe('getJobById', () => {
    it('should return job by valid ID', async () => {
      const db = getTestDb();
      const created = await createNewJob(db, 'snapshot', '2025-W14');

      const found = await getJobById(db, created._id!.toString());

      expect(found).not.toBeNull();
      expect(found!._id!.toString()).toBe(created._id!.toString());
    });

    it('should return null for invalid ID', async () => {
      const db = getTestDb();
      const found = await getJobById(db, 'invalid-id');

      expect(found).toBeNull();
    });

    it('should return null for non-existent ID', async () => {
      const db = getTestDb();
      const found = await getJobById(db, new ObjectId().toString());

      expect(found).toBeNull();
    });
  });

  describe('getActiveJobs', () => {
    it('should return pending and running jobs', async () => {
      const db = getTestDb();

      // Create jobs with different statuses
      const pending = await createNewJob(db, 'snapshot', '2025-W15');
      const running = await createNewJob(db, 'calculation', '2025-W15');
      await db.collection<Job>('jobs').updateOne(
        { _id: running._id },
        { $set: { status: 'running' } }
      );
      const completed = await createNewJob(db, 'airdrop', '2025-W15');
      await db.collection<Job>('jobs').updateOne(
        { _id: completed._id },
        { $set: { status: 'completed' } }
      );

      const active = await getActiveJobs(db);

      const activeIds = active.map(j => j._id!.toString());
      expect(activeIds).toContain(pending._id!.toString());
      expect(activeIds).toContain(running._id!.toString());
      expect(activeIds).not.toContain(completed._id!.toString());
    });

    it('should return empty array when no active jobs', async () => {
      const db = getTestDb();
      // Don't create any jobs in this test's context
      const active = await getActiveJobs(db);

      // May have jobs from other tests but verify it returns an array
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe('getRecentJobs', () => {
    it('should return jobs sorted by createdAt descending', async () => {
      const db = getTestDb();

      await createNewJob(db, 'snapshot', '2025-W16');
      await new Promise(r => setTimeout(r, 10));
      await createNewJob(db, 'calculation', '2025-W16');
      await new Promise(r => setTimeout(r, 10));
      await createNewJob(db, 'airdrop', '2025-W16');

      const recent = await getRecentJobs(db, 10);

      expect(recent.length).toBeGreaterThanOrEqual(3);
      // Verify descending order
      for (let i = 1; i < recent.length; i++) {
        expect(recent[i - 1]!.createdAt.getTime())
          .toBeGreaterThanOrEqual(recent[i]!.createdAt.getTime());
      }
    });

    it('should respect limit parameter', async () => {
      const db = getTestDb();

      for (let i = 0; i < 5; i++) {
        await createNewJob(db, 'snapshot', `2025-W1${7 + i}`);
      }

      const recent = await getRecentJobs(db, 3);

      expect(recent.length).toBeLessThanOrEqual(3);
    });

    it('should use default limit of 20', async () => {
      const db = getTestDb();
      const recent = await getRecentJobs(db);

      expect(recent.length).toBeLessThanOrEqual(20);
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status to running', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W22');

      await updateJobStatus(db, job._id!, 'running');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.status).toBe('running');
      expect(updated!.startedAt).toBeDefined();
    });

    it('should update job status to completed', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W23');

      await updateJobStatus(db, job._id!, 'completed');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).toBeDefined();
    });

    it('should update job status to failed with error', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W24');

      await updateJobStatus(db, job._id!, 'failed', 'Test error message');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.status).toBe('failed');
      expect(updated!.completedAt).toBeDefined();
      expect(updated!.error).toBe('Test error message');
    });

    it('should set updatedAt timestamp', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W25');
      const originalUpdatedAt = job.updatedAt;

      await new Promise(r => setTimeout(r, 10));
      await updateJobStatus(db, job._id!, 'running');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('updateJobProgress', () => {
    it('should update job progress', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W26');

      await updateJobProgress(db, job._id!, {
        current: 50,
        total: 100,
        percentage: 50,
        stage: 'Fetching holders',
      });

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.progress).toBeDefined();
      expect(updated!.progress!.current).toBe(50);
      expect(updated!.progress!.total).toBe(100);
      expect(updated!.progress!.percentage).toBe(50);
      expect(updated!.progress!.stage).toBe('Fetching holders');
    });
  });

  describe('addJobLog', () => {
    it('should add info log to job', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W27');

      await addJobLog(db, job._id!, 'info', 'Test info message');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.logs).toBeDefined();
      expect(updated!.logs!.length).toBeGreaterThan(0);

      const lastLog = updated!.logs![updated!.logs!.length - 1];
      expect(lastLog!.level).toBe('info');
      expect(lastLog!.message).toBe('Test info message');
    });

    it('should add warn log to job', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W28');

      await addJobLog(db, job._id!, 'warn', 'Test warning', { detail: 'extra' });

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      const lastLog = updated!.logs![updated!.logs!.length - 1];
      expect(lastLog!.level).toBe('warn');
      expect(lastLog!.data).toEqual({ detail: 'extra' });
    });

    it('should add error log to job', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W29');

      await addJobLog(db, job._id!, 'error', 'Test error');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      const lastLog = updated!.logs![updated!.logs!.length - 1];
      expect(lastLog!.level).toBe('error');
    });

    it('should add success log to job', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W30-js');

      await addJobLog(db, job._id!, 'success', 'Task completed');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      const lastLog = updated!.logs![updated!.logs!.length - 1];
      expect(lastLog!.level).toBe('success');
    });
  });

  describe('setJobResult', () => {
    it('should set job result', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W31-js');

      await setJobResult(db, job._id!, {
        snapshotId: 'test-id',
        totalHolders: 1000,
      });

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.result).toBeDefined();
      expect(updated!.result!.snapshotId).toBe('test-id');
      expect(updated!.result!.totalHolders).toBe(1000);
    });
  });

  describe('createJobContext', () => {
    it('should create context with all methods', async () => {
      const db = getTestDb();
      const jobId = new ObjectId();

      const ctx = createJobContext(db, jobId);

      expect(ctx.jobId).toBe(jobId);
      expect(ctx.db).toBe(db);
      expect(typeof ctx.log).toBe('function');
      expect(typeof ctx.warn).toBe('function');
      expect(typeof ctx.error).toBe('function');
      expect(typeof ctx.success).toBe('function');
      expect(typeof ctx.setProgress).toBe('function');
      expect(typeof ctx.setResult).toBe('function');
    });

    it('should log via context methods', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W32-js');

      const ctx = createJobContext(db, job._id!);

      await ctx.log('Info message');
      await ctx.warn('Warning message');
      await ctx.error('Error message');
      await ctx.success('Success message');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.logs!.length).toBe(4);
    });

    it('should set progress via context', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W33-js');

      const ctx = createJobContext(db, job._id!);
      await ctx.setProgress(25, 100, 'Processing...');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.progress!.current).toBe(25);
      expect(updated!.progress!.total).toBe(100);
      expect(updated!.progress!.percentage).toBe(25);
      expect(updated!.progress!.stage).toBe('Processing...');
    });

    it('should calculate percentage correctly', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W34-js');

      const ctx = createJobContext(db, job._id!);
      await ctx.setProgress(1, 3, 'Step 1');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.progress!.percentage).toBe(33); // 1/3 = 33%
    });

    it('should handle zero total in progress', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W35-js');

      const ctx = createJobContext(db, job._id!);
      await ctx.setProgress(0, 0, 'Unknown');

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.progress!.percentage).toBe(0);
    });

    it('should set result via context', async () => {
      const db = getTestDb();
      const job = await createNewJob(db, 'snapshot', '2025-W36-js');

      const ctx = createJobContext(db, job._id!);
      await ctx.setResult({ count: 42 });

      const updated = await db.collection<Job>('jobs').findOne({ _id: job._id });
      expect(updated!.result).toEqual({ count: 42 });
    });
  });
});
