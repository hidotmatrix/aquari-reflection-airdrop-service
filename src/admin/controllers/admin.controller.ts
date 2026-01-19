import { Request, Response } from 'express';
import { Db, ObjectId } from 'mongodb';
import { getConfig } from '../../config/env';
import { getPagination, LIMITS, buildPaginationMeta } from '../../utils/pagination';
import { isValidAddress } from '../../utils/format';
import { getCurrentWeekId } from '../../utils/week';
import {
  Snapshot,
  Holder,
  Distribution,
  Recipient,
  Batch,
  Job,
} from '../../models';
import { startJob } from '../../services/job.runner';
import { getJobById, getActiveJobs as getActiveJobsFromDb, getRecentJobs } from '../../services/job.service';

// ═══════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ═══════════════════════════════════════════════════════════

export function showLogin(req: Request, res: Response): void {
  if (req.session?.isAuthenticated) {
    res.redirect('/admin/dashboard');
    return;
  }
  res.render('login', { error: null, layout: false });
}

export function handleLogin(req: Request, res: Response): void {
  const { username, password } = req.body;
  const config = getConfig();

  if (
    username === config.ADMIN_USERNAME &&
    password === config.ADMIN_PASSWORD
  ) {
    req.session.isAuthenticated = true;
    req.session.username = username;

    const returnTo = req.session.returnTo || '/admin/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
    return;
  }

  res.render('login', { error: 'Invalid username or password', layout: false });
}

export function handleLogout(req: Request, res: Response): void {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

export async function dashboard(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const config = getConfig();

  const [
    latestDistribution,
    totalSnapshots,
    totalDistributions,
    pendingBatches,
    recentDistributions,
  ] = await Promise.all([
    db.collection<Distribution>('distributions').findOne({}, { sort: { createdAt: -1 } }),
    db.collection('snapshots').countDocuments(),
    db.collection('distributions').countDocuments(),
    db.collection('batches').countDocuments({
      status: { $in: ['pending', 'processing'] },
    }),
    db
      .collection<Distribution>('distributions')
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray(),
  ]);

  res.render('dashboard', {
    latestDistribution,
    totalSnapshots,
    totalDistributions,
    pendingBatches,
    recentDistributions,
    mockMode: config.MOCK_MODE,
  });
}

// ═══════════════════════════════════════════════════════════
// SNAPSHOTS
// ═══════════════════════════════════════════════════════════

export async function listSnapshots(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { page, limit, skip } = getPagination(req, LIMITS.SNAPSHOTS);

  const [snapshots, total] = await Promise.all([
    db
      .collection<Snapshot>('snapshots')
      .find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('snapshots').countDocuments(),
  ]);

  res.render('snapshots', {
    snapshots,
    pagination: buildPaginationMeta(total, { page, limit, skip }),
  });
}

export async function snapshotDetail(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { id } = req.params;
  const { page, limit, skip } = getPagination(req, LIMITS.HOLDERS);

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    res.status(400).render('error', { message: 'Invalid snapshot ID', layout: false });
    return;
  }

  const snapshot = await db.collection<Snapshot>('snapshots').findOne({ _id: objectId });

  if (!snapshot) {
    res.status(404).render('error', { message: 'Snapshot not found', layout: false });
    return;
  }

  const [holders, total] = await Promise.all([
    db
      .collection<Holder>('holders')
      .find({ snapshotId: snapshot._id })
      .sort({ balance: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('holders').countDocuments({ snapshotId: snapshot._id }),
  ]);

  res.render('snapshot-detail', {
    snapshot,
    holders,
    pagination: buildPaginationMeta(total, { page, limit, skip }),
  });
}

// ═══════════════════════════════════════════════════════════
// DISTRIBUTIONS
// ═══════════════════════════════════════════════════════════

export async function listDistributions(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { page, limit, skip } = getPagination(req, LIMITS.DISTRIBUTIONS);

  const [distributions, total] = await Promise.all([
    db
      .collection<Distribution>('distributions')
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('distributions').countDocuments(),
  ]);

  res.render('distributions', {
    distributions,
    pagination: buildPaginationMeta(total, { page, limit, skip }),
  });
}

export async function distributionDetail(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const config = getConfig();
  const { id } = req.params;
  const { page, limit, skip } = getPagination(req, LIMITS.RECIPIENTS);

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    res.status(400).render('error', { message: 'Invalid distribution ID', layout: false });
    return;
  }

  const distribution = await db
    .collection<Distribution>('distributions')
    .findOne({ _id: objectId });

  if (!distribution) {
    res.status(404).render('error', { message: 'Distribution not found', layout: false });
    return;
  }

  // Fetch snapshots for stats
  const [startSnapshot, endSnapshot] = await Promise.all([
    distribution.startSnapshotId
      ? db.collection<Snapshot>('snapshots').findOne({ _id: distribution.startSnapshotId })
      : null,
    distribution.endSnapshotId
      ? db.collection<Snapshot>('snapshots').findOne({ _id: distribution.endSnapshotId })
      : null,
  ]);

  const [batchStats, recipients, totalRecipients, batches] = await Promise.all([
    db
      .collection('batches')
      .aggregate([
        { $match: { distributionId: distribution._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection<Recipient>('recipients')
      .find({ distributionId: distribution._id })
      .sort({ reward: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('recipients').countDocuments({ distributionId: distribution._id }),
    db.collection('batches').find({ distributionId: distribution._id }).sort({ batchNumber: 1 }).toArray(),
  ]);

  // Calculate flow step
  let currentStep = 1;
  if (startSnapshot?.status === 'completed') currentStep = 2;
  if (endSnapshot?.status === 'completed') currentStep = 3;
  if (distribution.status === 'ready' || distribution.status === 'processing') currentStep = 4;
  if (distribution.status === 'completed') currentStep = 5;

  res.render('distribution-detail', {
    distribution,
    startSnapshot,
    endSnapshot,
    batchStats,
    batches,
    recipients,
    currentStep,
    aquariAddress: config.AQUARI_ADDRESS,
    pagination: buildPaginationMeta(totalRecipients, { page, limit, skip }),
  });
}

// ═══════════════════════════════════════════════════════════
// RECIPIENTS
// ═══════════════════════════════════════════════════════════

export async function listRecipients(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { page, limit, skip } = getPagination(req, LIMITS.RECIPIENTS);
  const status = req.query.status as string | undefined;
  const weekId = req.query.weekId as string | undefined;

  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (weekId) query.weekId = weekId;

  const [recipients, total, weeks] = await Promise.all([
    db
      .collection<Recipient>('recipients')
      .find(query)
      .sort({ reward: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('recipients').countDocuments(query),
    db.collection('distributions').distinct('weekId'),
  ]);

  res.render('recipients', {
    recipients,
    filters: { status, weekId },
    weeks,
    pagination: buildPaginationMeta(total, { page, limit, skip }),
  });
}

// ═══════════════════════════════════════════════════════════
// BATCHES
// ═══════════════════════════════════════════════════════════

export async function listBatches(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { page, limit, skip } = getPagination(req, LIMITS.BATCHES);
  const status = req.query.status as string | undefined;

  const query: Record<string, unknown> = {};
  if (status) query.status = status;

  const [batches, total] = await Promise.all([
    db
      .collection<Batch>('batches')
      .find(query, { projection: { recipients: 0 } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('batches').countDocuments(query),
  ]);

  res.render('batches', {
    batches,
    filters: { status },
    pagination: buildPaginationMeta(total, { page, limit, skip }),
  });
}

export async function batchDetail(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { id } = req.params;
  const { page, limit, skip } = getPagination(req, LIMITS.RECIPIENTS);

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    res.status(400).render('error', { message: 'Invalid batch ID', layout: false });
    return;
  }

  const batch = await db.collection<Batch>('batches').findOne({ _id: objectId });

  if (!batch) {
    res.status(404).render('error', { message: 'Batch not found', layout: false });
    return;
  }

  const totalRecipients = batch.recipients?.length ?? 0;
  const paginatedRecipients = batch.recipients?.slice(skip, skip + limit) ?? [];

  res.render('batch-detail', {
    batch: {
      ...batch,
      recipients: paginatedRecipients,
    },
    pagination: buildPaginationMeta(totalRecipients, { page, limit, skip }),
  });
}

// ═══════════════════════════════════════════════════════════
// SEARCH BY ADDRESS
// ═══════════════════════════════════════════════════════════

export async function searchByAddress(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const config = getConfig();
  const address = ((req.query.address as string) ?? '').toLowerCase().trim();
  const tab = (req.query.tab as string) ?? 'airdrops';
  const { page, limit, skip } = getPagination(req, LIMITS.SEARCH_HISTORY);

  if (!address) {
    res.render('search', {
      address: '',
      results: null,
      pagination: null,
      tab,
      error: null,
      aquariAddress: config.AQUARI_ADDRESS,
    });
    return;
  }

  if (!isValidAddress(address)) {
    res.render('search', {
      address,
      results: null,
      pagination: null,
      tab,
      error: 'Invalid address format',
      aquariAddress: config.AQUARI_ADDRESS,
    });
    return;
  }

  let results: unknown[] = [];
  let total = 0;

  if (tab === 'balances') {
    [results, total] = await Promise.all([
      db
        .collection<Holder>('holders')
        .find({ address })
        .sort({ weekId: -1 })
        .skip(skip)
        .limit(limit)
        .project({ weekId: 1, balance: 1, balanceFormatted: 1, snapshotAt: 1, createdAt: 1 })
        .toArray(),
      db.collection('holders').countDocuments({ address }),
    ]);
  } else {
    [results, total] = await Promise.all([
      db
        .collection<Recipient>('recipients')
        .find({ address })
        .sort({ weekId: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('recipients').countDocuments({ address }),
    ]);
  }

  res.render('search', {
    address,
    results,
    tab,
    pagination: buildPaginationMeta(total, { page, limit, skip }),
    error: null,
    aquariAddress: config.AQUARI_ADDRESS,
  });
}

// ═══════════════════════════════════════════════════════════
// DEV TOOLS (Clear data for testing)
// ═══════════════════════════════════════════════════════════

export async function clearData(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const config = getConfig();
  const { collection, weekId } = req.body;

  // Only allow in development mode
  if (config.NODE_ENV === 'production') {
    res.status(403).json({ success: false, error: 'Not allowed in production' });
    return;
  }

  try {
    const results: Record<string, number> = {};

    if (collection === 'all' || !collection) {
      // Clear all collections
      const query = weekId ? { weekId: { $regex: weekId } } : {};

      results.snapshots = (await db.collection('snapshots').deleteMany(query)).deletedCount;
      results.holders = (await db.collection('holders').deleteMany(query)).deletedCount;
      results.distributions = (await db.collection('distributions').deleteMany(query)).deletedCount;
      results.recipients = (await db.collection('recipients').deleteMany(query)).deletedCount;
      results.batches = (await db.collection('batches').deleteMany(query)).deletedCount;
      results.jobs = (await db.collection('jobs').deleteMany(query)).deletedCount;
    } else {
      // Clear specific collection
      const query = weekId ? { weekId: { $regex: weekId } } : {};
      results[collection] = (await db.collection(collection).deleteMany(query)).deletedCount;
    }

    res.json({
      success: true,
      message: weekId ? `Cleared data for week ${weekId}` : 'Cleared all data',
      deleted: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

// ═══════════════════════════════════════════════════════════
// JOB TRIGGERS (Start background jobs)
// ═══════════════════════════════════════════════════════════

export async function triggerSnapshot(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { type } = req.body; // 'start' or 'end'

  if (!type || !['start', 'end'].includes(type)) {
    res.status(400).json({ success: false, error: 'Invalid type. Use "start" or "end"' });
    return;
  }

  try {
    const weekId = getCurrentWeekId();
    const snapshotWeekId = `${weekId}-${type}`;

    // Start the job
    const job = await startJob(db, 'snapshot', snapshotWeekId);

    res.json({
      success: true,
      message: `Snapshot job started for ${snapshotWeekId}`,
      job: {
        id: job._id,
        type: job.type,
        weekId: job.weekId,
        status: job.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

export async function triggerCalculation(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;

  try {
    const weekId = getCurrentWeekId();

    // Start the job
    const job = await startJob(db, 'calculation', weekId);

    res.json({
      success: true,
      message: `Calculation job started for ${weekId}`,
      job: {
        id: job._id,
        type: job.type,
        weekId: job.weekId,
        status: job.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

export async function triggerFullFlow(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;

  try {
    const weekId = getCurrentWeekId();

    // Start full flow job
    const job = await startJob(db, 'full-flow', weekId);

    res.json({
      success: true,
      message: `Full flow job started for ${weekId}`,
      job: {
        id: job._id,
        type: job.type,
        weekId: job.weekId,
        status: job.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

// ═══════════════════════════════════════════════════════════
// JOB STATUS (Real-time progress and logs)
// ═══════════════════════════════════════════════════════════

export async function getJobStatusEndpoint(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { jobId, weekId } = req.query;

  try {
    // Get specific job by ID
    let job: Job | null = null;
    if (jobId) {
      job = await getJobById(db, jobId as string);
    }

    // Get active jobs
    const activeJobs = await getActiveJobsFromDb(db);

    // Get recent jobs for history
    const recentJobs = await getRecentJobs(db, 10);

    // Get snapshot status if weekId provided
    let snapshot: Snapshot | null = null;
    if (weekId) {
      snapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: weekId as string });
    }

    res.json({
      success: true,
      job: job ? {
        id: job._id,
        type: job.type,
        weekId: job.weekId,
        status: job.status,
        progress: job.progress,
        logs: job.logs.slice(-50), // Last 50 logs
        result: job.result,
        error: job.error,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      } : null,
      activeJobs: activeJobs.map(j => ({
        id: j._id,
        type: j.type,
        weekId: j.weekId,
        status: j.status,
        progress: j.progress,
      })),
      recentJobs: recentJobs.map(j => ({
        id: j._id,
        type: j.type,
        weekId: j.weekId,
        status: j.status,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
      })),
      snapshot: snapshot ? {
        id: snapshot._id,
        weekId: snapshot.weekId,
        status: snapshot.status,
        totalHolders: snapshot.totalHolders,
        progress: snapshot.progress,
        error: snapshot.error,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

export async function getJobLogs(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { jobId } = req.params;

  if (!jobId) {
    res.status(400).json({ success: false, error: 'Job ID required' });
    return;
  }

  try {
    const job = await getJobById(db, jobId);

    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    res.json({
      success: true,
      job: {
        id: job._id,
        type: job.type,
        weekId: job.weekId,
        status: job.status,
        progress: job.progress,
      },
      logs: job.logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}
