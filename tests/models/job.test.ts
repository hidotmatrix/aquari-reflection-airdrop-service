import { createJob, Job, JobType, JobStatus, CreateJobInput } from '../../src/models/Job';

// ═══════════════════════════════════════════════════════════
// Job Model Tests
// ═══════════════════════════════════════════════════════════

describe('Job Model', () => {
  describe('createJob', () => {
    it('should create a job with correct structure', () => {
      const input: CreateJobInput = {
        type: 'snapshot',
        weekId: '2025-W01',
      };

      const job = createJob(input);

      expect(job.type).toBe('snapshot');
      expect(job.weekId).toBe('2025-W01');
      expect(job.status).toBe('pending');
      expect(job.logs).toEqual([]);
      expect(job.createdAt).toBeInstanceOf(Date);
      expect(job.updatedAt).toBeInstanceOf(Date);
    });

    it('should create snapshot job', () => {
      const job = createJob({ type: 'snapshot', weekId: '2025-W02' });
      expect(job.type).toBe('snapshot');
    });

    it('should create calculation job', () => {
      const job = createJob({ type: 'calculation', weekId: '2025-W03' });
      expect(job.type).toBe('calculation');
    });

    it('should create airdrop job', () => {
      const job = createJob({ type: 'airdrop', weekId: '2025-W04' });
      expect(job.type).toBe('airdrop');
    });

    it('should create full-flow job', () => {
      const job = createJob({ type: 'full-flow', weekId: '2025-W05' });
      expect(job.type).toBe('full-flow');
    });

    it('should set status to pending by default', () => {
      const job = createJob({ type: 'snapshot', weekId: '2025-W06' });
      expect(job.status).toBe('pending');
    });

    it('should initialize empty logs array', () => {
      const job = createJob({ type: 'snapshot', weekId: '2025-W07' });
      expect(job.logs).toEqual([]);
      expect(Array.isArray(job.logs)).toBe(true);
    });

    it('should not set optional fields', () => {
      const job = createJob({ type: 'snapshot', weekId: '2025-W08' });

      expect(job._id).toBeUndefined();
      expect(job.progress).toBeUndefined();
      expect(job.result).toBeUndefined();
      expect(job.error).toBeUndefined();
      expect(job.startedAt).toBeUndefined();
      expect(job.completedAt).toBeUndefined();
    });

    it('should set createdAt and updatedAt to current time', () => {
      const before = new Date();
      const job = createJob({ type: 'snapshot', weekId: '2025-W09' });
      const after = new Date();

      expect(job.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(job.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(job.updatedAt.getTime()).toEqual(job.createdAt.getTime());
    });
  });

  describe('JobType', () => {
    it('should support all job types', () => {
      const types: JobType[] = ['snapshot', 'calculation', 'airdrop', 'full-flow'];

      types.forEach(type => {
        const job = createJob({ type, weekId: '2025-W10' });
        expect(job.type).toBe(type);
      });
    });
  });

  describe('JobStatus', () => {
    it('should have correct status values', () => {
      const statuses: JobStatus[] = ['pending', 'running', 'completed', 'failed'];

      const job: Job = {
        type: 'snapshot',
        weekId: '2025-W11',
        status: 'pending',
        logs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      statuses.forEach(status => {
        job.status = status;
        expect(job.status).toBe(status);
      });
    });
  });

  describe('Job interface', () => {
    it('should allow setting progress', () => {
      const job: Job = {
        type: 'snapshot',
        weekId: '2025-W12',
        status: 'running',
        progress: {
          current: 50,
          total: 100,
          percentage: 50,
          stage: 'Fetching holders',
        },
        logs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(job.progress).toBeDefined();
      expect(job.progress!.current).toBe(50);
      expect(job.progress!.total).toBe(100);
      expect(job.progress!.percentage).toBe(50);
      expect(job.progress!.stage).toBe('Fetching holders');
    });

    it('should allow setting result', () => {
      const job: Job = {
        type: 'snapshot',
        weekId: '2025-W13',
        status: 'completed',
        result: {
          snapshotId: 'abc123',
          totalHolders: 1000,
        },
        logs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(job.result).toBeDefined();
      expect(job.result!.snapshotId).toBe('abc123');
      expect(job.result!.totalHolders).toBe(1000);
    });

    it('should allow setting error', () => {
      const job: Job = {
        type: 'snapshot',
        weekId: '2025-W14',
        status: 'failed',
        error: 'Network connection failed',
        logs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(job.error).toBe('Network connection failed');
    });

    it('should allow adding logs', () => {
      const job: Job = {
        type: 'snapshot',
        weekId: '2025-W15',
        status: 'running',
        logs: [
          { timestamp: new Date(), level: 'info', message: 'Starting job' },
          { timestamp: new Date(), level: 'warn', message: 'Rate limited', data: { attempt: 1 } },
          { timestamp: new Date(), level: 'error', message: 'Failed' },
          { timestamp: new Date(), level: 'success', message: 'Completed' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(job.logs.length).toBe(4);
      expect(job.logs[0]!.level).toBe('info');
      expect(job.logs[1]!.level).toBe('warn');
      expect(job.logs[1]!.data).toEqual({ attempt: 1 });
      expect(job.logs[2]!.level).toBe('error');
      expect(job.logs[3]!.level).toBe('success');
    });

    it('should allow setting dates', () => {
      const startDate = new Date('2025-01-15T10:00:00Z');
      const endDate = new Date('2025-01-15T10:05:00Z');

      const job: Job = {
        type: 'snapshot',
        weekId: '2025-W16',
        status: 'completed',
        logs: [],
        startedAt: startDate,
        completedAt: endDate,
        createdAt: new Date('2025-01-15T09:55:00Z'),
        updatedAt: endDate,
      };

      expect(job.startedAt).toEqual(startDate);
      expect(job.completedAt).toEqual(endDate);
    });
  });
});
