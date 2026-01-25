import { getTestDb } from '../setup';
import { ObjectId } from 'mongodb';
import {
  initializeJobLogService,
  createJobLog,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  updateJobProgress,
  addJobLogEntry,
  incrementRetryCount,
  getJobLogByJobId,
  getJobLogById,
  getRecentJobLogs,
  getActiveJobLogs,
  getJobLogsByWeek,
  getLatestJobLog,
  getJobLogsByStatus,
  createJobLogIndexes,
  cleanupOldJobLogs,
  JobLog,
} from '../../src/services/job-log.service';

// ═══════════════════════════════════════════════════════════
// Job Log Service Tests
// ═══════════════════════════════════════════════════════════

describe('Job Log Service', () => {
  beforeEach(() => {
    const db = getTestDb();
    initializeJobLogService(db);
  });

  describe('createJobLog', () => {
    it('should create a job log with correct structure', async () => {
      const jobId = new ObjectId().toString();
      const jobLog = await createJobLog(jobId, 'snapshot', '2025-W40');

      expect(jobLog).toBeDefined();
      expect(jobLog.jobId).toBe(jobId);
      expect(jobLog.type).toBe('snapshot');
      expect(jobLog.weekId).toBe('2025-W40');
      expect(jobLog.status).toBe('queued');
      expect(jobLog.retryCount).toBe(0);
      expect(jobLog.logs.length).toBe(1);
      expect(jobLog.logs[0]!.level).toBe('info');
    });

    it('should create calculate type job log', async () => {
      const jobId = new ObjectId().toString();
      const jobLog = await createJobLog(jobId, 'calculate', '2025-W41');

      expect(jobLog.type).toBe('calculate');
    });

    it('should create airdrop type job log', async () => {
      const jobId = new ObjectId().toString();
      const jobLog = await createJobLog(jobId, 'airdrop', '2025-W42');

      expect(jobLog.type).toBe('airdrop');
    });

    it('should set queuedAt and createdAt timestamps', async () => {
      const before = new Date();
      const jobId = new ObjectId().toString();
      const jobLog = await createJobLog(jobId, 'snapshot', '2025-W43');
      const after = new Date();

      expect(jobLog.queuedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(jobLog.queuedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(jobLog.createdAt.getTime()).toEqual(jobLog.queuedAt.getTime());
    });
  });

  describe('markJobRunning', () => {
    it('should update status to running', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W44');

      await markJobRunning(jobId);

      const jobLog = await getJobLogByJobId(jobId);
      expect(jobLog!.status).toBe('running');
      expect(jobLog!.startedAt).toBeDefined();
    });

    it('should add log entry when starting', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W45');

      await markJobRunning(jobId);

      const jobLog = await getJobLogByJobId(jobId);
      expect(jobLog!.logs.length).toBe(2);
      expect(jobLog!.logs[1]!.message).toBe('Job started');
    });
  });

  describe('markJobCompleted', () => {
    it('should update status to completed', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W46');
      await markJobRunning(jobId);

      await markJobCompleted(jobId);

      const jobLog = await getJobLogByJobId(jobId);
      expect(jobLog!.status).toBe('completed');
      expect(jobLog!.completedAt).toBeDefined();
      expect(jobLog!.progress!.percentage).toBe(100);
    });

    it('should store result when provided', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W47');

      await markJobCompleted(jobId, { totalHolders: 500 });

      const jobLog = await getJobLogByJobId(jobId);
      expect(jobLog!.result).toEqual({ totalHolders: 500 });
    });

    it('should add success log entry', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W48');

      await markJobCompleted(jobId);

      const jobLog = await getJobLogByJobId(jobId);
      const lastLog = jobLog!.logs[jobLog!.logs.length - 1];
      expect(lastLog!.level).toBe('success');
      expect(lastLog!.message).toBe('Job completed successfully');
    });
  });

  describe('markJobFailed', () => {
    it('should update status to failed', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W49');

      await markJobFailed(jobId, 'Connection timeout');

      const jobLog = await getJobLogByJobId(jobId);
      expect(jobLog!.status).toBe('failed');
      expect(jobLog!.error).toBe('Connection timeout');
      expect(jobLog!.completedAt).toBeDefined();
    });

    it('should add error log entry', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W50-jl');

      await markJobFailed(jobId, 'API error');

      const jobLog = await getJobLogByJobId(jobId);
      const lastLog = jobLog!.logs[jobLog!.logs.length - 1];
      expect(lastLog!.level).toBe('error');
      expect(lastLog!.message).toContain('API error');
    });
  });

  describe('updateJobProgress', () => {
    it('should update progress without log message', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W51-jl');

      await updateJobProgress(jobId, {
        percentage: 50,
        current: 250,
        total: 500,
        stage: 'Fetching holders',
      });

      const jobLog = await getJobLogByJobId(jobId);
      expect(jobLog!.progress!.percentage).toBe(50);
      expect(jobLog!.progress!.current).toBe(250);
      expect(jobLog!.progress!.total).toBe(500);
      expect(jobLog!.progress!.stage).toBe('Fetching holders');
    });

    it('should update progress with log message', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W52-jl');

      await updateJobProgress(
        jobId,
        { percentage: 75, stage: 'Processing' },
        'Progress update'
      );

      const jobLog = await getJobLogByJobId(jobId);
      expect(jobLog!.progress!.percentage).toBe(75);
      expect(jobLog!.logs.length).toBe(2);
      expect(jobLog!.logs[1]!.message).toBe('Progress update');
    });
  });

  describe('addJobLogEntry', () => {
    it('should add info log entry', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W53-jl');

      await addJobLogEntry(jobId, 'info', 'Processing batch 1');

      const jobLog = await getJobLogByJobId(jobId);
      expect(jobLog!.logs.length).toBe(2);
      expect(jobLog!.logs[1]!.level).toBe('info');
      expect(jobLog!.logs[1]!.message).toBe('Processing batch 1');
    });

    it('should add warn log entry', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W54-jl');

      await addJobLogEntry(jobId, 'warn', 'Rate limited');

      const jobLog = await getJobLogByJobId(jobId);
      const lastLog = jobLog!.logs[jobLog!.logs.length - 1];
      expect(lastLog!.level).toBe('warn');
    });

    it('should add error log entry', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W55-jl');

      await addJobLogEntry(jobId, 'error', 'Failed to process');

      const jobLog = await getJobLogByJobId(jobId);
      const lastLog = jobLog!.logs[jobLog!.logs.length - 1];
      expect(lastLog!.level).toBe('error');
    });

    it('should add success log entry', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W56-jl');

      await addJobLogEntry(jobId, 'success', 'Batch completed');

      const jobLog = await getJobLogByJobId(jobId);
      const lastLog = jobLog!.logs[jobLog!.logs.length - 1];
      expect(lastLog!.level).toBe('success');
    });
  });

  describe('incrementRetryCount', () => {
    it('should increment retry count', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W57-jl');

      expect((await getJobLogByJobId(jobId))!.retryCount).toBe(0);

      await incrementRetryCount(jobId);
      expect((await getJobLogByJobId(jobId))!.retryCount).toBe(1);

      await incrementRetryCount(jobId);
      expect((await getJobLogByJobId(jobId))!.retryCount).toBe(2);
    });
  });

  describe('getJobLogByJobId', () => {
    it('should return job log by jobId', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W58-jl');

      const jobLog = await getJobLogByJobId(jobId);

      expect(jobLog).not.toBeNull();
      expect(jobLog!.jobId).toBe(jobId);
    });

    it('should return null for non-existent jobId', async () => {
      const jobLog = await getJobLogByJobId('non-existent');
      expect(jobLog).toBeNull();
    });
  });

  describe('getJobLogById', () => {
    it('should return job log by MongoDB _id', async () => {
      const jobId = new ObjectId().toString();
      const created = await createJobLog(jobId, 'snapshot', '2025-W59-jl');

      const jobLog = await getJobLogById(created._id!.toString());

      expect(jobLog).not.toBeNull();
      expect(jobLog!._id!.toString()).toBe(created._id!.toString());
    });

    it('should fallback to jobId if not valid ObjectId', async () => {
      const jobId = 'not-an-objectid-string';
      await createJobLog(jobId, 'snapshot', '2025-W60-jl');

      // Using an invalid ObjectId should fallback to looking up by jobId
      const jobLog = await getJobLogById(jobId);

      expect(jobLog).not.toBeNull();
      expect(jobLog!.jobId).toBe(jobId);
    });

    it('should return null for non-existent id', async () => {
      const jobLog = await getJobLogById(new ObjectId().toString());
      expect(jobLog).toBeNull();
    });
  });

  describe('getRecentJobLogs', () => {
    it('should return job logs sorted by createdAt descending', async () => {
      for (let i = 0; i < 3; i++) {
        await createJobLog(new ObjectId().toString(), 'snapshot', `2025-W6${i}-jl`);
        await new Promise(r => setTimeout(r, 10));
      }

      const recent = await getRecentJobLogs(10);

      expect(recent.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < recent.length; i++) {
        expect(recent[i - 1]!.createdAt.getTime())
          .toBeGreaterThanOrEqual(recent[i]!.createdAt.getTime());
      }
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await createJobLog(new ObjectId().toString(), 'snapshot', `2025-W6${3 + i}-jl`);
      }

      const recent = await getRecentJobLogs(3);
      expect(recent.length).toBeLessThanOrEqual(3);
    });

    it('should use default limit of 20', async () => {
      const recent = await getRecentJobLogs();
      expect(recent.length).toBeLessThanOrEqual(20);
    });
  });

  describe('getActiveJobLogs', () => {
    it('should return queued and running job logs', async () => {
      const queuedId = new ObjectId().toString();
      const runningId = new ObjectId().toString();
      const completedId = new ObjectId().toString();

      await createJobLog(queuedId, 'snapshot', '2025-W70-jl');
      await createJobLog(runningId, 'snapshot', '2025-W71-jl');
      await markJobRunning(runningId);
      await createJobLog(completedId, 'snapshot', '2025-W72-jl');
      await markJobCompleted(completedId);

      const active = await getActiveJobLogs();
      const activeJobIds = active.map(j => j.jobId);

      expect(activeJobIds).toContain(queuedId);
      expect(activeJobIds).toContain(runningId);
      expect(activeJobIds).not.toContain(completedId);
    });
  });

  describe('getJobLogsByWeek', () => {
    it('should return job logs for specific weekId', async () => {
      const weekId = '2025-W73-jl';
      await createJobLog(new ObjectId().toString(), 'snapshot', weekId);
      await createJobLog(new ObjectId().toString(), 'calculate', weekId);
      await createJobLog(new ObjectId().toString(), 'airdrop', '2025-W74-jl'); // Different week

      const logs = await getJobLogsByWeek(weekId);

      expect(logs.length).toBe(2);
      logs.forEach(log => {
        expect(log.weekId).toBe(weekId);
      });
    });

    it('should return empty array for non-existent weekId', async () => {
      const logs = await getJobLogsByWeek('2099-W99-jl');
      expect(logs).toEqual([]);
    });
  });

  describe('getLatestJobLog', () => {
    it('should return latest job log for type and weekId', async () => {
      const weekId = '2025-W75-jl';

      await createJobLog(new ObjectId().toString(), 'snapshot', weekId);
      await new Promise(r => setTimeout(r, 10));
      const latest = await createJobLog(new ObjectId().toString(), 'snapshot', weekId);

      const found = await getLatestJobLog('snapshot', weekId);

      expect(found).not.toBeNull();
      expect(found!._id!.toString()).toBe(latest._id!.toString());
    });

    it('should return null if no matching job log', async () => {
      const found = await getLatestJobLog('airdrop', '2099-W99-jl');
      expect(found).toBeNull();
    });
  });

  describe('getJobLogsByStatus', () => {
    it('should return job logs by status', async () => {
      const completedId = new ObjectId().toString();
      const failedId = new ObjectId().toString();

      await createJobLog(completedId, 'snapshot', '2025-W76-jl');
      await markJobCompleted(completedId);
      await createJobLog(failedId, 'snapshot', '2025-W77-jl');
      await markJobFailed(failedId, 'Error');

      const completed = await getJobLogsByStatus('completed');
      const failed = await getJobLogsByStatus('failed');

      expect(completed.some(j => j.jobId === completedId)).toBe(true);
      expect(failed.some(j => j.jobId === failedId)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const logs = await getJobLogsByStatus('completed', 5);
      expect(logs.length).toBeLessThanOrEqual(5);
    });

    it('should use default limit of 50', async () => {
      const logs = await getJobLogsByStatus('queued');
      expect(logs.length).toBeLessThanOrEqual(50);
    });
  });

  describe('createJobLogIndexes', () => {
    it('should create indexes without error', async () => {
      await expect(createJobLogIndexes()).resolves.not.toThrow();
    });
  });

  describe('cleanupOldJobLogs', () => {
    it('should delete old completed job logs', async () => {
      const db = getTestDb();

      // Create an old completed job log
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

      await db.collection('job_logs').insertOne({
        jobId: 'old-job',
        type: 'snapshot',
        weekId: '2024-W01',
        status: 'completed',
        logs: [],
        retryCount: 0,
        queuedAt: oldDate,
        completedAt: oldDate,
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      const deleted = await cleanupOldJobLogs(30);

      expect(deleted).toBeGreaterThanOrEqual(1);
    });

    it('should not delete recent job logs', async () => {
      const jobId = new ObjectId().toString();
      await createJobLog(jobId, 'snapshot', '2025-W78-jl');
      await markJobCompleted(jobId);

      const deleted = await cleanupOldJobLogs(30);

      const stillExists = await getJobLogByJobId(jobId);
      expect(stillExists).not.toBeNull();
    });

    it('should not delete failed or queued job logs regardless of age', async () => {
      const db = getTestDb();

      // Create old but non-completed job logs
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);

      await db.collection('job_logs').insertOne({
        jobId: 'old-failed-job',
        type: 'snapshot',
        weekId: '2024-W02',
        status: 'failed',
        logs: [],
        retryCount: 0,
        queuedAt: oldDate,
        completedAt: oldDate,
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      await cleanupOldJobLogs(30);

      const stillExists = await getJobLogByJobId('old-failed-job');
      expect(stillExists).not.toBeNull();
    });
  });
});
