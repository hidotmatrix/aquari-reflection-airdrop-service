import { Request, Response } from 'express';
import { Db, ObjectId } from 'mongodb';
import { getConfig, getActiveNetwork, getModeName, isForkMode, getTokenAddress, getTokenSymbol, getTokenDecimals } from '../../config/env';
import { getPagination, LIMITS, buildPaginationMeta } from '../../utils/pagination';
import { isValidAddress } from '../../utils/format';
import { getCurrentWeekId } from '../../utils/week';
import { resetLoginRateLimit } from '../middleware/rate-limiter';
import { explorerHelpers } from '../../utils/explorer';
import { getGasPrices, isGasAcceptable, estimateAirdropCost } from '../../utils/gas-oracle';
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
import { getSchedulerState } from '../../jobs/scheduler';
import {
  getJobLogById,
  getActiveJobLogs,
  getRecentJobLogs,
  JobLog,
} from '../../services/job-log.service';
import {
  getWalletEthBalance,
  getWalletTokenBalance,
  getWalletAddress,
} from '../../services/blockchain.service';
import { verifyPassword } from '../../utils/password';

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

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body;
  const config = getConfig();

  // Verify username matches
  if (username !== config.ADMIN_USERNAME) {
    res.render('login', { error: 'Invalid username or password', layout: false });
    return;
  }

  // Verify password using bcrypt (supports legacy plain-text during migration)
  const passwordValid = await verifyPassword(password, config.ADMIN_PASSWORD);

  if (passwordValid) {
    req.session.isAuthenticated = true;
    req.session.username = username;

    // Reset rate limit on successful login
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    resetLoginRateLimit(ip, username);

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
    availableWeeks,
    readyDistributions,
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
    // Get unique weeks from snapshots for week selector
    db.collection<Snapshot>('snapshots').distinct('weekId'),
    // Get distributions ready for approval
    db.collection<Distribution>('distributions')
      .find({ status: 'ready' })
      .sort({ createdAt: -1 })
      .toArray(),
  ]);

  // Parse available weeks (filter to valid week format patterns)
  const uniqueWeeks = [...new Set(
    availableWeeks.filter((w: string) => /^\d{4}-W\d{2}$/.test(w))
  )].sort().reverse();

  // Format MIN_BALANCE for display (convert from wei to tokens)
  const minBalanceTokens = BigInt(config.MIN_BALANCE) / BigInt(10 ** 18);

  // Get network and scheduler info
  const network = getActiveNetwork();
  const schedulerState = getSchedulerState();

  // Get wallet balances for display
  const tokenSymbol = getTokenSymbol();
  const tokenDecimals = getTokenDecimals();
  const divisor = Math.pow(10, tokenDecimals);

  let walletInfo = {
    address: getWalletAddress(),
    ethBalance: '0',
    ethBalanceNum: 0,
    tokenBalance: '0',
    tokenBalanceNum: 0,
    tokenSymbol,
    needsEth: false,
    needsTokens: false,
    needsFunding: false,
  };

  try {
    const [ethBalance, tokenBalance] = await Promise.all([
      getWalletEthBalance(),
      getWalletTokenBalance(),
    ]);

    const ethBalanceNum = Number(ethBalance) / 1e18;
    const tokenBalanceNum = Number(tokenBalance) / divisor;

    // Thresholds for warnings
    const MIN_ETH = 0.01; // Minimum ETH for gas
    const MIN_TOKENS = 1000; // Minimum tokens to be useful

    walletInfo = {
      address: getWalletAddress(),
      ethBalance: ethBalanceNum.toFixed(6),
      ethBalanceNum,
      tokenBalance: tokenBalanceNum.toLocaleString(),
      tokenBalanceNum,
      tokenSymbol,
      needsEth: ethBalanceNum < MIN_ETH,
      needsTokens: tokenBalanceNum < MIN_TOKENS,
      needsFunding: ethBalanceNum < MIN_ETH || tokenBalanceNum < MIN_TOKENS,
    };
  } catch {
    // Mock mode or error - use defaults
  }

  res.render('dashboard', {
    latestDistribution,
    totalSnapshots,
    totalDistributions,
    pendingBatches,
    recentDistributions,
    readyDistributions,
    availableWeeks: uniqueWeeks,
    mockSnapshots: config.MOCK_SNAPSHOTS,
    mockTransactions: config.MOCK_TRANSACTIONS,
    minBalance: minBalanceTokens.toString(),
    rewardToken: config.REWARD_TOKEN,
    mode: config.MODE,
    modeName: getModeName(),
    isForkMode: isForkMode(),
    network: {
      name: network.chainName,
      chainId: network.chainId,
      tokenAddress: network.tokenAddress,
    },
    scheduler: {
      isRunning: schedulerState.isRunning,
      currentCycle: schedulerState.currentCycle,
      nextAction: schedulerState.nextAction,
      nextActionTime: schedulerState.nextActionTime,
    },
    schedule: config.SCHEDULE,
    wallet: walletInfo,
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
  const [previousSnapshot, currentSnapshot] = await Promise.all([
    distribution.previousSnapshotId
      ? db.collection<Snapshot>('snapshots').findOne({ _id: distribution.previousSnapshotId })
      : null,
    distribution.currentSnapshotId
      ? db.collection<Snapshot>('snapshots').findOne({ _id: distribution.currentSnapshotId })
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

  // Calculate flow step (3-step flow: 1=snapshot, 2=calculate, 3=airdrop)
  let currentStep = 1;
  if (previousSnapshot?.status === 'completed' && currentSnapshot?.status === 'completed') currentStep = 2;
  if (distribution.status === 'ready' || distribution.status === 'processing') currentStep = 3;
  if (distribution.status === 'completed') currentStep = 4;

  res.render('distribution-detail', {
    distribution,
    previousSnapshot,
    currentSnapshot,
    batchStats,
    batches,
    recipients,
    currentStep,
    aquariAddress: getTokenAddress(),
    mockTransactions: config.MOCK_TRANSACTIONS,
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
  const config = getConfig();
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

  // Get the distribution to fetch the reward token
  const distribution = batch.distributionId
    ? await db.collection<Distribution>('distributions').findOne({ _id: batch.distributionId })
    : null;

  const rewardToken = distribution?.config?.rewardToken || config.REWARD_TOKEN;

  const totalRecipients = batch.recipients?.length ?? 0;
  const paginatedRecipients = batch.recipients?.slice(skip, skip + limit) ?? [];

  res.render('batch-detail', {
    batch: {
      ...batch,
      recipients: paginatedRecipients,
    },
    rewardToken,
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
      aquariAddress: getTokenAddress(),
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
      aquariAddress: getTokenAddress(),
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
    aquariAddress: getTokenAddress(),
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

export async function deleteDatabase(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const config = getConfig();

  // Only allow in development/fork mode
  if (config.NODE_ENV === 'production' && config.MODE !== 'fork') {
    res.status(403).json({ success: false, error: 'Not allowed in production mode' });
    return;
  }

  try {
    const collections = ['snapshots', 'holders', 'distributions', 'recipients', 'batches', 'jobs'];
    const results: Record<string, string> = {};

    for (const collName of collections) {
      try {
        await db.collection(collName).drop();
        results[collName] = 'dropped';
      } catch (err) {
        // Collection may not exist
        results[collName] = 'not found or already dropped';
      }
    }

    res.json({
      success: true,
      message: 'Database collections dropped successfully',
      dropped: results,
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

  try {
    const weekId = getCurrentWeekId();

    // Start the snapshot job for current week
    const job = await startJob(db, 'snapshot', weekId);

    res.json({
      success: true,
      message: `Snapshot job started for ${weekId}`,
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
  const { weekId: requestedWeekId } = req.body;

  try {
    // Use requested week or current week
    const weekId = requestedWeekId || getCurrentWeekId();

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

export async function triggerAirdrop(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { weekId, distributionId } = req.body;

  if (!weekId && !distributionId) {
    res.status(400).json({ success: false, error: 'weekId or distributionId required' });
    return;
  }

  try {
    // Find the distribution
    let distribution: Distribution | null = null;

    if (distributionId) {
      distribution = await db.collection<Distribution>('distributions').findOne({
        _id: new ObjectId(distributionId),
      });
    } else if (weekId) {
      distribution = await db.collection<Distribution>('distributions').findOne({ weekId });
    }

    if (!distribution) {
      res.status(404).json({ success: false, error: 'Distribution not found' });
      return;
    }

    if (distribution.status !== 'ready') {
      res.status(400).json({
        success: false,
        error: `Distribution is not ready for airdrop (status: ${distribution.status})`,
      });
      return;
    }

    // Start airdrop job
    const job = await startJob(db, 'airdrop', distribution.weekId);

    res.json({
      success: true,
      message: `Airdrop job started for ${distribution.weekId}`,
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

export async function approveAndExecuteAirdrop(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const config = getConfig();
  const { distributionId, rewardPool, rewardToken } = req.body;

  if (!distributionId) {
    res.status(400).json({ success: false, error: 'distributionId required' });
    return;
  }

  try {
    const distribution = await db.collection<Distribution>('distributions').findOne({
      _id: new ObjectId(distributionId),
    });

    if (!distribution) {
      res.status(404).json({ success: false, error: 'Distribution not found' });
      return;
    }

    if (distribution.status !== 'ready') {
      res.status(400).json({
        success: false,
        error: `Distribution must be in "ready" status to approve (current: ${distribution.status})`,
      });
      return;
    }

    // Build update with new reward config if provided
    const updateConfig: Record<string, unknown> = {
      status: 'processing',
      updatedAt: new Date(),
    };

    if (rewardPool) {
      updateConfig['config.rewardPool'] = rewardPool;
    }
    if (rewardToken) {
      updateConfig['config.rewardToken'] = rewardToken;
    }

    // Update status to processing and optionally update reward config
    await db.collection<Distribution>('distributions').updateOne(
      { _id: distribution._id },
      { $set: updateConfig }
    );

    // If reward pool changed, we need to recalculate rewards for recipients
    if (rewardPool && rewardPool !== distribution.config?.rewardPool) {
      const newRewardPoolBigInt = BigInt(rewardPool);
      const totalEligibleBalance = BigInt(distribution.stats?.totalEligibleBalance || '1');

      // Update all recipients with new reward amounts
      const recipients = await db.collection<Recipient>('recipients')
        .find({ distributionId: distribution._id })
        .toArray();

      for (const recipient of recipients) {
        const minBalance = BigInt(recipient.balances?.min || '0');
        const newReward = (minBalance * newRewardPoolBigInt) / totalEligibleBalance;
        const newRewardFormatted = `${(Number(newReward) / 1e18).toFixed(8)} ${rewardToken || distribution.config?.rewardToken || 'ETH'}`;

        await db.collection<Recipient>('recipients').updateOne(
          { _id: recipient._id },
          {
            $set: {
              reward: newReward.toString(),
              rewardFormatted: newRewardFormatted,
              updatedAt: new Date(),
            },
          }
        );
      }

      // Update batch totals
      const batches = await db.collection<Batch>('batches')
        .find({ distributionId: distribution._id })
        .toArray();

      for (const batch of batches) {
        let batchTotal = 0n;
        const updatedRecipients: Array<{ address: string; amount: string }> = [];

        for (const batchRecipient of batch.recipients || []) {
          const fullRecipient = await db.collection<Recipient>('recipients').findOne({
            distributionId: distribution._id,
            address: batchRecipient.address,
          });
          const amount = fullRecipient?.reward || '0';
          batchTotal += BigInt(amount);
          updatedRecipients.push({ address: batchRecipient.address, amount });
        }

        await db.collection<Batch>('batches').updateOne(
          { _id: batch._id },
          {
            $set: {
              recipients: updatedRecipients,
              totalAmount: batchTotal.toString(),
              updatedAt: new Date(),
            },
          }
        );
      }
    }

    // Start airdrop job
    const job = await startJob(db, 'airdrop', distribution.weekId);

    res.json({
      success: true,
      message: `Airdrop approved and started for ${distribution.weekId}`,
      mode: config.MOCK_TRANSACTIONS ? 'SIMULATED' : 'PRODUCTION',
      rewardPool: rewardPool || distribution.config?.rewardPool,
      rewardToken: rewardToken || distribution.config?.rewardToken,
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
    // Get specific job by ID - try jobs collection first (has real-time progress)
    let job: Job | null = null;
    if (jobId) {
      job = await getJobById(db, jobId as string);
    }

    // Get active jobs from jobs collection
    const activeJobs = await getActiveJobsFromDb(db);

    // Get recent jobs from jobs collection
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
        logs: job.logs?.slice(-50) || [],
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
    // Try jobs collection first (has real-time progress)
    const job = await getJobById(db, jobId);

    if (job) {
      res.json({
        success: true,
        job: {
          id: job._id,
          type: job.type,
          weekId: job.weekId,
          status: job.status,
          progress: job.progress,
        },
        logs: job.logs || [],
      });
      return;
    }

    // Fall back to job_logs collection (persistent storage)
    const jobLog = await getJobLogById(jobId);

    if (jobLog) {
      res.json({
        success: true,
        job: {
          id: jobLog._id || jobLog.jobId,
          type: jobLog.type,
          weekId: jobLog.weekId,
          status: jobLog.status,
          progress: jobLog.progress,
        },
        logs: jobLog.logs,
      });
      return;
    }

    res.status(404).json({ success: false, error: 'Job not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

// ═══════════════════════════════════════════════════════════
// WORKFLOW CONTROL
// ═══════════════════════════════════════════════════════════

export async function startWorkflow(_req: Request, res: Response): Promise<void> {
  // System is now fully cron-based - no manual workflow start
  res.status(400).json({
    success: false,
    error: 'System is cron-based. Configure cron times in .env to control scheduling.',
    scheduler: getSchedulerState(),
  });
}

// ═══════════════════════════════════════════════════════════
// RETRY FAILED AIRDROP
// ═══════════════════════════════════════════════════════════

export async function retryFailedAirdrop(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const config = getConfig();
  const { distributionId, resetRetryCount } = req.body;

  if (!distributionId) {
    res.status(400).json({ success: false, error: 'distributionId required' });
    return;
  }

  try {
    const distribution = await db.collection<Distribution>('distributions').findOne({
      _id: new ObjectId(distributionId),
    });

    if (!distribution) {
      res.status(404).json({ success: false, error: 'Distribution not found' });
      return;
    }

    // Allow retry for failed or processing distributions
    if (!['failed', 'processing'].includes(distribution.status)) {
      res.status(400).json({
        success: false,
        error: `Distribution must be in "failed" or "processing" status to retry (current: ${distribution.status})`,
      });
      return;
    }

    // Count existing batch stats
    const batchStats = await db.collection<Batch>('batches').aggregate([
      { $match: { distributionId: distribution._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray();

    const completedBatches = batchStats.find(s => s._id === 'completed')?.count || 0;
    const failedBatches = batchStats.find(s => s._id === 'failed')?.count || 0;
    const pendingBatches = batchStats.find(s => s._id === 'pending')?.count || 0;

    if (failedBatches === 0 && pendingBatches === 0) {
      res.status(400).json({
        success: false,
        error: 'No failed or pending batches to retry. All batches are completed.',
      });
      return;
    }

    // Optionally reset retry counts for failed batches
    if (resetRetryCount) {
      await db.collection<Batch>('batches').updateMany(
        { distributionId: distribution._id, status: 'failed' },
        { $set: { retryCount: 0, status: 'pending', updatedAt: new Date() }, $unset: { lastError: '' } }
      );

      await db.collection<Recipient>('recipients').updateMany(
        { distributionId: distribution._id, status: 'failed' },
        { $set: { retryCount: 0, status: 'pending', updatedAt: new Date() }, $unset: { error: '' } }
      );
    }

    // Update distribution to processing
    await db.collection<Distribution>('distributions').updateOne(
      { _id: distribution._id },
      { $set: { status: 'processing', updatedAt: new Date() } }
    );

    // Start airdrop job
    const job = await startJob(db, 'airdrop', distribution.weekId);

    res.json({
      success: true,
      message: `Retry started for ${distribution.weekId}`,
      mode: config.MOCK_TRANSACTIONS ? 'SIMULATED' : 'PRODUCTION',
      stats: {
        completedBatches,
        failedBatches: resetRetryCount ? 0 : failedBatches,
        pendingBatches: resetRetryCount ? failedBatches + pendingBatches : pendingBatches,
        totalBatches: completedBatches + failedBatches + pendingBatches,
      },
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
// BATCH RETRY (Single batch)
// ═══════════════════════════════════════════════════════════

export async function retryBatch(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const config = getConfig();
  const { id } = req.params;

  try {
    const batch = await db.collection<Batch>('batches').findOne({
      _id: new ObjectId(id),
    });

    if (!batch) {
      res.status(404).json({ success: false, error: 'Batch not found' });
      return;
    }

    if (batch.status !== 'failed') {
      res.status(400).json({
        success: false,
        error: `Batch must be in "failed" status to retry (current: ${batch.status})`,
      });
      return;
    }

    // Reset batch status to pending
    await db.collection<Batch>('batches').updateOne(
      { _id: batch._id },
      {
        $set: {
          status: 'pending',
          retryCount: 0,
          updatedAt: new Date(),
        },
        $unset: { lastError: '' },
      }
    );

    // Reset associated recipients
    const recipientAddresses = batch.recipients?.map(r => r.address) || [];
    await db.collection<Recipient>('recipients').updateMany(
      {
        distributionId: batch.distributionId,
        address: { $in: recipientAddresses },
      },
      {
        $set: {
          status: 'pending',
          retryCount: 0,
          updatedAt: new Date(),
        },
        $unset: { error: '' },
      }
    );

    // Get the distribution
    const distribution = await db.collection<Distribution>('distributions').findOne({
      _id: batch.distributionId,
    });

    if (!distribution) {
      res.status(404).json({ success: false, error: 'Distribution not found' });
      return;
    }

    // Ensure distribution is in processing state
    if (distribution.status !== 'processing') {
      await db.collection<Distribution>('distributions').updateOne(
        { _id: distribution._id },
        { $set: { status: 'processing', updatedAt: new Date() } }
      );
    }

    // Start airdrop job to process this batch
    const job = await startJob(db, 'airdrop', distribution.weekId);

    res.json({
      success: true,
      message: `Batch #${batch.batchNumber} queued for retry`,
      mode: config.MOCK_TRANSACTIONS ? 'SIMULATED' : 'PRODUCTION',
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
// BLOCKCHAIN INFO (for pre-checks)
// ═══════════════════════════════════════════════════════════

export async function getBlockchainStatus(req: Request, res: Response): Promise<void> {
  try {
    const [ethBalance, tokenBalance, gasPrices, gasStatus] = await Promise.all([
      getWalletEthBalance(),
      getWalletTokenBalance(),
      getGasPrices(),
      isGasAcceptable(),
    ]);

    res.json({
      success: true,
      wallet: {
        address: getWalletAddress(),
        ethBalance,
        ethBalanceFormatted: formatEthBalance(ethBalance),
        tokenBalance,
        tokenBalanceFormatted: formatTokenBalance(tokenBalance),
      },
      gas: {
        current: gasPrices.current.toString(),
        currentGwei: formatGwei(gasPrices.current),
        maxAllowed: gasPrices.maxAllowed.toString(),
        maxAllowedGwei: formatGwei(gasPrices.maxAllowed),
        isAcceptable: gasStatus.acceptable,
        reason: gasStatus.reason,
      },
      explorer: explorerHelpers.baseUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

// Helper functions
function formatGwei(wei: bigint): string {
  return (Number(wei) / 1e9).toFixed(2);
}

function formatEthBalance(wei: string): string {
  try {
    const balance = BigInt(wei);
    return (Number(balance) / 1e18).toFixed(4) + ' ETH';
  } catch {
    return '0 ETH';
  }
}

function formatTokenBalance(wei: string): string {
  try {
    const balance = BigInt(wei);
    return (Number(balance) / 1e18).toLocaleString() + ' AQUARI';
  } catch {
    return '0 AQUARI';
  }
}

// ═══════════════════════════════════════════════════════════
// WEEK STATUS & STEP CONTROL
// ═══════════════════════════════════════════════════════════

interface StepStatus {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  completedAt?: Date;
  error?: string;
  holders?: number;     // For snapshot step
  eligible?: number;    // For calculate step
  batches?: number;     // For airdrop step
  reason?: string;      // For skipped status
  progress?: string;    // For running status
}

interface WeekStatus {
  totalSnapshots: number;
  snapshot: StepStatus;
  calculate: StepStatus;
  airdrop: StepStatus;
  previousSnapshot?: {
    weekId: string;
    holders: number;
    completedAt: Date;
  } | null;
  currentSnapshot?: {
    weekId: string;
    holders: number;
    completedAt: Date;
  } | null;
}

/**
 * List all weeks that have data in the database
 */
export async function listWeeks(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;

  try {
    // Get unique weekIds from distributions and snapshots
    const [distWeeks, snapshotWeeks] = await Promise.all([
      db.collection('distributions').distinct('weekId'),
      db.collection('snapshots').distinct('weekId'),
    ]);

    // Combine and dedupe (snapshots now use plain weekId, no -start/-end suffix)
    const allWeeks = [...new Set([...distWeeks, ...snapshotWeeks])];

    // Sort descending (TEST-002 > TEST-001, 2026-W04 > 2026-W03)
    allWeeks.sort((a, b) => b.localeCompare(a));

    res.json({ success: true, weeks: allWeeks });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

/**
 * Get the status of all 3 steps for a specific week
 */
export async function getWeekStatus(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const weekId = req.params.weekId;

  if (!weekId) {
    res.status(400).json({ success: false, error: 'weekId required' });
    return;
  }

  try {
    // Get total snapshot count (for baseline detection)
    const totalSnapshots = await db.collection<Snapshot>('snapshots').countDocuments({ status: 'completed' });

    // Check for snapshot (single snapshot per cycle now)
    const snapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId });

    // Get the oldest snapshot for baseline detection
    const oldestSnapshots = await db.collection<Snapshot>('snapshots')
      .find({ status: 'completed' })
      .sort({ createdAt: 1 })
      .limit(1)
      .toArray();

    const oldestSnapshot = oldestSnapshots[0] || null;

    // Check for distribution (calculate step)
    const distribution = await db.collection<Distribution>('distributions').findOne({ weekId });

    // Get batch count if distribution exists
    let batchCount = 0;
    if (distribution) {
      batchCount = await db.collection('batches').countDocuments({ distributionId: distribution._id });
    }

    // Check for running jobs
    const runningJobs = await db.collection<Job>('jobs').find({
      weekId,
      status: 'running'
    }).toArray();

    // Check which specific jobs are running
    const isSnapshotRunning = runningJobs.some(j => j.type === 'snapshot')
      && (!snapshot || snapshot.status !== 'completed');
    const isCalculateRunning = runningJobs.some(j => j.type === 'calculation')
      && (!distribution || !['ready', 'processing', 'completed'].includes(distribution.status));
    const isAirdropRunning = runningJobs.some(j => j.type === 'airdrop')
      && (!distribution || distribution.status !== 'completed');

    // Build snapshot step status with holder count
    const snapshotStatus = getStepStatusFromSnapshot(snapshot, isSnapshotRunning);
    if (snapshot && snapshot.totalHolders) {
      snapshotStatus.holders = snapshot.totalHolders;
    }

    // Build calculate step status with eligible count
    const calculateStatus = getCalculateStatus(distribution, isCalculateRunning);
    if (distribution && distribution.stats?.eligibleHolders) {
      calculateStatus.eligible = distribution.stats.eligibleHolders;
    }

    // Check if this week's snapshot IS the oldest one (making it the baseline)
    // A baseline cycle has a snapshot but no distribution because there was nothing to compare to
    const isBaselineCycle = oldestSnapshot && snapshot &&
      oldestSnapshot.weekId === snapshot.weekId && !distribution;

    // Mark as skipped if this was a baseline cycle
    if (isBaselineCycle) {
      calculateStatus.status = 'skipped';
      calculateStatus.reason = 'Baseline snapshot (no previous to compare)';
    }

    // Build airdrop step status with batch count
    const airdropStatus = getAirdropStatus(distribution, isAirdropRunning);
    if (batchCount > 0) {
      airdropStatus.batches = batchCount;
    }
    // Mark as skipped if this was a baseline cycle
    if (isBaselineCycle) {
      airdropStatus.status = 'skipped';
      airdropStatus.reason = 'Baseline cycle (no airdrop)';
    }

    // Get the snapshots that were actually used for THIS week's distribution
    let weekPreviousSnapshot = null;
    let weekCurrentSnapshot = null;

    if (distribution && distribution.previousSnapshotId && distribution.currentSnapshotId) {
      // Get the actual snapshots used in this distribution's calculation
      const [prevSnap, currSnap] = await Promise.all([
        db.collection<Snapshot>('snapshots').findOne({ _id: distribution.previousSnapshotId }),
        db.collection<Snapshot>('snapshots').findOne({ _id: distribution.currentSnapshotId }),
      ]);

      if (prevSnap) {
        weekPreviousSnapshot = {
          weekId: prevSnap.weekId,
          holders: prevSnap.totalHolders || 0,
          completedAt: prevSnap.completedAt || prevSnap.createdAt,
        };
      }
      if (currSnap) {
        weekCurrentSnapshot = {
          weekId: currSnap.weekId,
          holders: currSnap.totalHolders || 0,
          completedAt: currSnap.completedAt || currSnap.createdAt,
        };
      }
    }

    // Build full status response
    const status: WeekStatus = {
      totalSnapshots,
      snapshot: snapshotStatus,
      calculate: calculateStatus,
      airdrop: airdropStatus,
      // Include previous/current snapshot info for THIS week's calculation
      previousSnapshot: weekPreviousSnapshot,
      currentSnapshot: weekCurrentSnapshot,
    };

    res.json({ success: true, weekId, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

function getStepStatusFromSnapshot(snapshot: Snapshot | null, isRunning: boolean): StepStatus {
  if (isRunning) {
    return { status: 'running' };
  }
  if (!snapshot) {
    return { status: 'pending' };
  }
  if (snapshot.status === 'completed') {
    return { status: 'completed', completedAt: snapshot.completedAt || snapshot.createdAt };
  }
  if (snapshot.status === 'failed') {
    return { status: 'failed', error: 'Snapshot failed' };
  }
  return { status: 'pending' };
}

function getCalculateStatus(distribution: Distribution | null, isRunning: boolean): StepStatus {
  if (isRunning) {
    return { status: 'running' };
  }
  if (!distribution) {
    return { status: 'pending' };
  }
  // Distribution exists means calculation was done
  if (['ready', 'processing', 'completed'].includes(distribution.status)) {
    return { status: 'completed', completedAt: distribution.createdAt };
  }
  if (distribution.status === 'failed') {
    return { status: 'failed', error: 'Calculation failed' };
  }
  return { status: 'pending' };
}

function getAirdropStatus(distribution: Distribution | null, isRunning: boolean): StepStatus {
  if (isRunning) {
    return { status: 'running' };
  }
  if (!distribution) {
    return { status: 'pending' };
  }
  if (distribution.status === 'completed') {
    return { status: 'completed', completedAt: distribution.completedAt || distribution.updatedAt };
  }
  if (distribution.status === 'failed') {
    return { status: 'failed', error: 'Airdrop failed' };
  }
  if (distribution.status === 'ready') {
    return { status: 'pending' };
  }
  if (distribution.status === 'processing') {
    return { status: 'running' };
  }
  return { status: 'pending' };
}

/**
 * Manually trigger a specific step for a week
 */
export async function triggerWeekStep(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const weekId = req.params.weekId;
  const step = req.params.step;

  if (!weekId || !step) {
    res.status(400).json({ success: false, error: 'weekId and step required' });
    return;
  }

  try {
    let job;

    switch (step) {
      case 'snapshot':
        job = await startJob(db, 'snapshot', weekId);
        break;
      case 'calculate':
        job = await startJob(db, 'calculation', weekId);
        break;
      case 'airdrop':
        // For airdrop, we need to set up the distribution properly
        const distribution = await db.collection<Distribution>('distributions').findOne({
          weekId,
          status: 'ready'
        });

        if (!distribution) {
          res.status(400).json({
            success: false,
            error: 'No ready distribution found. Run calculation first.'
          });
          return;
        }

        // Read wallet balance and set as reward pool
        const walletBalance = await getWalletTokenBalance();
        if (BigInt(walletBalance) === 0n) {
          res.status(400).json({
            success: false,
            error: 'Wallet balance is 0. Fund the wallet first.'
          });
          return;
        }

        // Update distribution with wallet balance
        await db.collection<Distribution>('distributions').updateOne(
          { _id: distribution._id },
          {
            $set: {
              'config.rewardPool': walletBalance,
              'config.autoApproved': false,
              'config.manuallyTriggered': true,
              'config.walletBalanceUsed': walletBalance,
              status: 'processing',
              updatedAt: new Date()
            }
          }
        );

        job = await startJob(db, 'airdrop', weekId);
        break;
      default:
        res.status(400).json({ success: false, error: `Invalid step: ${step}. Use "snapshot", "calculate", or "airdrop"` });
        return;
    }

    res.json({
      success: true,
      message: `Triggered ${step} for ${weekId}`,
      job: {
        id: job._id,
        type: job.type,
        weekId: job.weekId,
        status: job.status,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}

/**
 * Retry a failed step for a week
 */
export async function retryWeekStep(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const weekId = req.params.weekId;
  const step = req.params.step;

  if (!weekId || !step) {
    res.status(400).json({ success: false, error: 'weekId and step required' });
    return;
  }

  try {
    let job;

    switch (step) {
      case 'snapshot':
        // Delete failed snapshot and retry
        const existingSnapshot = await db.collection<Snapshot>('snapshots').findOne({ weekId });
        if (existingSnapshot) {
          await db.collection('holders').deleteMany({ snapshotId: existingSnapshot._id });
          await db.collection('snapshots').deleteOne({ _id: existingSnapshot._id });
        }
        job = await startJob(db, 'snapshot', weekId);
        break;

      case 'calculate':
        // Delete distribution and related data, then recalculate
        const existingDist = await db.collection<Distribution>('distributions').findOne({ weekId });
        if (existingDist) {
          await db.collection('recipients').deleteMany({ distributionId: existingDist._id });
          await db.collection('batches').deleteMany({ distributionId: existingDist._id });
          await db.collection('distributions').deleteOne({ _id: existingDist._id });
        }
        job = await startJob(db, 'calculation', weekId);
        break;

      case 'airdrop':
        const distribution = await db.collection<Distribution>('distributions').findOne({ weekId });
        if (!distribution) {
          res.status(400).json({ success: false, error: 'No distribution found' });
          return;
        }

        // Reset failed batches
        await db.collection<Batch>('batches').updateMany(
          { distributionId: distribution._id, status: 'failed' },
          { $set: { status: 'pending', retryCount: 0, updatedAt: new Date() }, $unset: { lastError: '' } }
        );

        await db.collection<Recipient>('recipients').updateMany(
          { distributionId: distribution._id, status: 'failed' },
          { $set: { status: 'pending', retryCount: 0, updatedAt: new Date() }, $unset: { error: '' } }
        );

        // Update distribution status
        await db.collection<Distribution>('distributions').updateOne(
          { _id: distribution._id },
          { $set: { status: 'processing', updatedAt: new Date() } }
        );

        job = await startJob(db, 'airdrop', weekId);
        break;

      default:
        res.status(400).json({ success: false, error: `Invalid step: ${step}. Use "snapshot", "calculate", or "airdrop"` });
        return;
    }

    res.json({
      success: true,
      message: `Retrying ${step} for ${weekId}`,
      job: {
        id: job._id,
        type: job.type,
        weekId: job.weekId,
        status: job.status,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
}
