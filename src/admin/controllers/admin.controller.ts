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
} from '../../models';
import { takeSnapshot } from '../../services/snapshot.service';
import { calculateRewards } from '../../services/calculation.service';

// ═══════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ═══════════════════════════════════════════════════════════

export function showLogin(req: Request, res: Response): void {
  if (req.session?.isAuthenticated) {
    res.redirect('/admin/dashboard');
    return;
  }
  res.render('login', { error: null });
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

  res.render('login', { error: 'Invalid username or password' });
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
    res.status(400).render('error', { message: 'Invalid snapshot ID' });
    return;
  }

  const snapshot = await db.collection<Snapshot>('snapshots').findOne({ _id: objectId });

  if (!snapshot) {
    res.status(404).render('error', { message: 'Snapshot not found' });
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
  const { id } = req.params;
  const { page, limit, skip } = getPagination(req, LIMITS.RECIPIENTS);

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    res.status(400).render('error', { message: 'Invalid distribution ID' });
    return;
  }

  const distribution = await db
    .collection<Distribution>('distributions')
    .findOne({ _id: objectId });

  if (!distribution) {
    res.status(404).render('error', { message: 'Distribution not found' });
    return;
  }

  const [batchStats, recipients, totalRecipients] = await Promise.all([
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
  ]);

  res.render('distribution-detail', {
    distribution,
    batchStats,
    recipients,
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
    res.status(400).render('error', { message: 'Invalid batch ID' });
    return;
  }

  const batch = await db.collection<Batch>('batches').findOne({ _id: objectId });

  if (!batch) {
    res.status(404).render('error', { message: 'Batch not found' });
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
        .project({ weekId: 1, balance: 1, balanceFormatted: 1, createdAt: 1 })
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
  });
}

// ═══════════════════════════════════════════════════════════
// TEST TRIGGERS (Manual execution for testing)
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

    const result = await takeSnapshot(db, snapshotWeekId);

    res.json({
      success: true,
      message: `Snapshot ${snapshotWeekId} created successfully`,
      snapshot: {
        id: result.snapshot._id,
        weekId: result.snapshot.weekId,
        totalHolders: result.snapshot.totalHolders,
        status: result.snapshot.status,
      },
      holdersInserted: result.holdersInserted,
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
    const startWeekId = `${weekId}-start`;
    const endWeekId = `${weekId}-end`;

    // Get snapshots
    const startSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: startWeekId });
    const endSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId: endWeekId });

    if (!startSnapshot) {
      res.status(400).json({ success: false, error: `Start snapshot not found. Take "${startWeekId}" snapshot first.` });
      return;
    }

    if (!endSnapshot) {
      res.status(400).json({ success: false, error: `End snapshot not found. Take "${endWeekId}" snapshot first.` });
      return;
    }

    const result = await calculateRewards(db, weekId, startSnapshot._id!, endSnapshot._id!);

    res.json({
      success: true,
      message: `Rewards calculated for week ${weekId}`,
      distribution: {
        id: result.distribution._id,
        weekId: result.distribution.weekId,
        status: result.distribution.status,
        stats: result.distribution.stats,
      },
      eligibleCount: result.eligibleCount,
      excludedCount: result.excludedCount,
      batchCount: result.batchCount,
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
    const results: Record<string, unknown> = { weekId };

    // Step 1: Take start snapshot
    const startWeekId = `${weekId}-start`;
    let startSnapshotId: ObjectId;
    const existingStart = await db.collection<Snapshot>('snapshots').findOne({ weekId: startWeekId });

    if (!existingStart || existingStart.status === 'failed') {
      const startResult = await takeSnapshot(db, startWeekId);
      startSnapshotId = startResult.snapshot._id!;
      results.startSnapshot = {
        id: startSnapshotId,
        holdersInserted: startResult.holdersInserted,
        status: 'created',
      };
    } else {
      startSnapshotId = existingStart._id;
      results.startSnapshot = { id: startSnapshotId, status: 'already_exists' };
    }

    // Step 2: Take end snapshot
    const endWeekId = `${weekId}-end`;
    let endSnapshotId: ObjectId;
    const existingEnd = await db.collection<Snapshot>('snapshots').findOne({ weekId: endWeekId });

    if (!existingEnd || existingEnd.status === 'failed') {
      const endResult = await takeSnapshot(db, endWeekId);
      endSnapshotId = endResult.snapshot._id!;
      results.endSnapshot = {
        id: endSnapshotId,
        holdersInserted: endResult.holdersInserted,
        status: 'created',
      };
    } else {
      endSnapshotId = existingEnd._id;
      results.endSnapshot = { id: endSnapshotId, status: 'already_exists' };
    }

    // Step 3: Calculate rewards
    const existingDistribution = await db.collection<Distribution>('distributions').findOne({ weekId });

    if (existingDistribution && existingDistribution.status === 'completed') {
      results.distribution = { id: existingDistribution._id, status: 'already_completed' };
    } else {
      const calcResult = await calculateRewards(db, weekId, startSnapshotId, endSnapshotId);
      results.distribution = {
        id: calcResult.distribution._id,
        status: calcResult.distribution.status,
        eligibleCount: calcResult.eligibleCount,
        batchCount: calcResult.batchCount,
      };
    }

    res.json({
      success: true,
      message: `Full flow completed for week ${weekId}`,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}
