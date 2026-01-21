import { Request, Response } from 'express';
import { Db } from 'mongodb';
import { Distribution, Batch, Snapshot, Holder } from '../../models';
import { formatGwei, formatEth } from '../../utils/gas-oracle';
import {
  exportDistributionRecipients,
  exportDistributionBatches,
  exportSnapshotHolders,
  exportAnalyticsSummary,
  exportGasAnalytics,
} from '../../utils/csv-export';

// ═══════════════════════════════════════════════════════════
// Analytics Controller
// Historical data, charts, and statistics
// ═══════════════════════════════════════════════════════════

/**
 * Analytics dashboard page
 */
export async function analyticsPage(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;

  // Get distribution stats
  const [
    totalDistributions,
    completedDistributions,
    totalRecipients,
    totalBatches,
    distributions,
    gasStats,
    holderGrowth,
  ] = await Promise.all([
    db.collection('distributions').countDocuments(),
    db.collection('distributions').countDocuments({ status: 'completed' }),
    db.collection('recipients').countDocuments(),
    db.collection('batches').countDocuments(),
    // Get all distributions for charts
    db.collection<Distribution>('distributions')
      .find({})
      .sort({ createdAt: 1 })
      .toArray(),
    // Get gas statistics from completed batches
    db.collection<Batch>('batches').aggregate([
      { $match: { status: 'completed', 'execution.gasUsed': { $exists: true } } },
      {
        $group: {
          _id: null,
          totalGasUsed: { $sum: { $toLong: '$execution.gasUsed' } },
          avgGasPerBatch: { $avg: { $toLong: '$execution.gasUsed' } },
          totalRecipients: { $sum: '$recipientCount' },
          batchCount: { $sum: 1 },
        },
      },
    ]).toArray(),
    // Get holder count growth over time
    db.collection<Snapshot>('snapshots').aggregate([
      { $match: { status: 'completed' } },
      { $sort: { timestamp: 1 } },
      {
        $project: {
          weekId: 1,
          totalHolders: 1,
          timestamp: 1,
        },
      },
    ]).toArray(),
  ]);

  // Calculate totals
  const stats = gasStats[0] || {
    totalGasUsed: 0,
    avgGasPerBatch: 0,
    totalRecipients: 0,
    batchCount: 0,
  };

  // Calculate total distributed
  let totalDistributed = 0n;
  distributions.forEach(d => {
    if (d.stats?.totalDistributed) {
      totalDistributed += BigInt(d.stats.totalDistributed);
    }
  });

  // Prepare chart data
  const chartData = {
    // Distribution stats over time
    distributions: distributions.map(d => ({
      weekId: d.weekId,
      eligibleHolders: d.stats?.eligibleHolders || 0,
      distributed: d.stats?.totalDistributed ? formatTokens(d.stats.totalDistributed) : 0,
      status: d.status,
    })),
    // Holder growth over time
    holderGrowth: holderGrowth.map(s => ({
      weekId: s.weekId,
      totalHolders: s.totalHolders,
      date: s.timestamp,
    })),
  };

  // Calculate average gas per recipient
  const avgGasPerRecipient = stats.totalRecipients > 0
    ? Math.round(Number(stats.totalGasUsed) / stats.totalRecipients)
    : 0;

  res.render('analytics', {
    totalDistributions,
    completedDistributions,
    totalRecipients,
    totalBatches,
    totalDistributed: formatTokens(totalDistributed.toString()),
    totalGasUsed: stats.totalGasUsed.toString(),
    avgGasPerBatch: Math.round(Number(stats.avgGasPerBatch)),
    avgGasPerRecipient,
    chartData: JSON.stringify(chartData),
  });
}

/**
 * Gas analytics API endpoint
 */
export async function gasAnalytics(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;

  const batches = await db.collection<Batch>('batches')
    .find({ status: 'completed', 'execution.gasUsed': { $exists: true } })
    .sort({ 'execution.confirmedAt': -1 })
    .limit(100)
    .toArray();

  const analytics = batches.map(b => {
    const gasUsed = BigInt(b.execution?.gasUsed || '0');
    const gasPrice = BigInt(b.execution?.gasPrice || '0');
    const recipientCount = b.recipientCount || 1;
    const cost = gasUsed * gasPrice;

    return {
      weekId: b.weekId,
      batchNumber: b.batchNumber,
      recipients: recipientCount,
      gasUsed: gasUsed.toString(),
      gasPrice: formatGwei(gasPrice),
      gasPerRecipient: Math.round(Number(gasUsed) / recipientCount),
      costWei: cost.toString(),
      costEth: formatEth(cost),
      txHash: b.execution?.txHash,
      blockNumber: b.execution?.blockNumber,
      confirmedAt: b.execution?.confirmedAt,
    };
  });

  // Calculate summary stats
  const totalGas = batches.reduce((sum, b) => sum + BigInt(b.execution?.gasUsed || '0'), 0n);
  const totalRecipients = batches.reduce((sum, b) => sum + (b.recipientCount || 0), 0);
  const totalCost = batches.reduce((sum, b) => {
    const gasUsed = BigInt(b.execution?.gasUsed || '0');
    const gasPrice = BigInt(b.execution?.gasPrice || '0');
    return sum + (gasUsed * gasPrice);
  }, 0n);

  res.json({
    success: true,
    summary: {
      totalBatches: batches.length,
      totalGasUsed: totalGas.toString(),
      totalRecipients,
      totalCostEth: formatEth(totalCost),
      avgGasPerRecipient: totalRecipients > 0 ? Math.round(Number(totalGas) / totalRecipients) : 0,
    },
    data: analytics,
  });
}

/**
 * Distribution analytics API endpoint
 */
export async function distributionAnalytics(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;

  const distributions = await db.collection<Distribution>('distributions')
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  const analytics = distributions.map(d => ({
    weekId: d.weekId,
    status: d.status,
    totalHolders: d.stats?.totalHolders || 0,
    eligibleHolders: d.stats?.eligibleHolders || 0,
    excludedHolders: d.stats?.excludedHolders || 0,
    configExcluded: d.stats?.configExcluded || 0,
    botRestricted: d.stats?.botRestricted || 0,
    totalEligibleBalance: formatTokens(d.stats?.totalEligibleBalance),
    rewardPool: formatTokens(d.config?.rewardPool),
    rewardToken: d.config?.rewardToken || 'AQUARI',
    totalDistributed: formatTokens(d.stats?.totalDistributed),
    createdAt: d.createdAt,
    completedAt: d.completedAt,
  }));

  res.json({
    success: true,
    data: analytics,
  });
}

/**
 * Holder growth analytics API endpoint
 */
export async function holderGrowthAnalytics(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;

  const snapshots = await db.collection<Snapshot>('snapshots')
    .find({ status: 'completed' })
    .sort({ timestamp: 1 })
    .toArray();

  // Group by week (remove -start/-end suffix)
  const weeklyData = new Map<string, { start: number; end: number; change: number }>();

  snapshots.forEach(s => {
    const baseWeek = s.weekId.replace(/-start$/, '').replace(/-end$/, '');
    const isStart = s.weekId.endsWith('-start');

    if (!weeklyData.has(baseWeek)) {
      weeklyData.set(baseWeek, { start: 0, end: 0, change: 0 });
    }

    const data = weeklyData.get(baseWeek)!;
    if (isStart) {
      data.start = s.totalHolders;
    } else {
      data.end = s.totalHolders;
    }
    data.change = data.end - data.start;
  });

  const analytics = Array.from(weeklyData.entries()).map(([weekId, data]) => ({
    weekId,
    startHolders: data.start,
    endHolders: data.end,
    change: data.change,
    changePercent: data.start > 0 ? ((data.change / data.start) * 100).toFixed(2) : '0',
  }));

  res.json({
    success: true,
    data: analytics,
  });
}

// ═══════════════════════════════════════════════════════════
// CSV Export Endpoints
// ═══════════════════════════════════════════════════════════

export async function exportRecipients(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { distributionId } = req.params;

  if (!distributionId) {
    res.status(400).json({ error: 'Distribution ID required' });
    return;
  }

  await exportDistributionRecipients(db, distributionId, res);
}

export async function exportBatches(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { distributionId } = req.params;

  if (!distributionId) {
    res.status(400).json({ error: 'Distribution ID required' });
    return;
  }

  await exportDistributionBatches(db, distributionId, res);
}

export async function exportHolders(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  const { snapshotId } = req.params;

  if (!snapshotId) {
    res.status(400).json({ error: 'Snapshot ID required' });
    return;
  }

  await exportSnapshotHolders(db, snapshotId, res);
}

export async function exportSummary(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  await exportAnalyticsSummary(db, res);
}

export async function exportGas(req: Request, res: Response): Promise<void> {
  const db: Db = req.app.locals.db;
  await exportGasAnalytics(db, res);
}

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

function formatTokens(weiAmount: string | undefined): number {
  if (!weiAmount) return 0;
  try {
    const wei = BigInt(weiAmount);
    return Number(wei / BigInt(10 ** 14)) / 10000; // 4 decimal places
  } catch {
    return 0;
  }
}
