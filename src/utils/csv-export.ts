// ═══════════════════════════════════════════════════════════
// CSV Export Utility
// Generate CSV files for distributions, recipients, and batches
// ═══════════════════════════════════════════════════════════

import { Response } from 'express';
import { Db, ObjectId } from 'mongodb';
import { Distribution, Recipient, Batch, Holder, Snapshot } from '../models';
import { formatEth, formatGwei } from './gas-oracle';

interface CSVColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

/**
 * Convert data array to CSV string
 */
function toCSV<T>(data: T[], columns: CSVColumn<T>[]): string {
  const headers = columns.map(c => c.header).join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const value = col.accessor(row);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const stringValue = String(value ?? '');
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',')
  );
  return [headers, ...rows].join('\n');
}

/**
 * Send CSV response
 */
function sendCSV(res: Response, filename: string, csvContent: string): void {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
}

/**
 * Export recipients for a distribution
 */
export async function exportDistributionRecipients(
  db: Db,
  distributionId: string,
  res: Response
): Promise<void> {
  const distribution = await db.collection<Distribution>('distributions')
    .findOne({ _id: new ObjectId(distributionId) });

  if (!distribution) {
    res.status(404).json({ error: 'Distribution not found' });
    return;
  }

  const recipients = await db.collection<Recipient>('recipients')
    .find({ distributionId: new ObjectId(distributionId) })
    .sort({ reward: -1 })
    .toArray();

  const columns: CSVColumn<Recipient>[] = [
    { header: 'Address', accessor: r => r.address },
    { header: 'Start Balance (wei)', accessor: r => r.balances?.start || '0' },
    { header: 'End Balance (wei)', accessor: r => r.balances?.end || '0' },
    { header: 'MIN Balance (wei)', accessor: r => r.balances?.min || '0' },
    { header: 'Start Balance (tokens)', accessor: r => formatTokens(r.balances?.start) },
    { header: 'End Balance (tokens)', accessor: r => formatTokens(r.balances?.end) },
    { header: 'MIN Balance (tokens)', accessor: r => formatTokens(r.balances?.min) },
    { header: 'Reward (wei)', accessor: r => r.reward || '0' },
    { header: 'Reward (tokens)', accessor: r => r.rewardFormatted || '' },
    { header: 'Percentage', accessor: r => r.percentage?.toFixed(4) || '0' },
    { header: 'Status', accessor: r => r.status },
    { header: 'Batch Number', accessor: r => r.batchNumber ?? '' },
    { header: 'TX Hash', accessor: r => r.txHash || '' },
  ];

  const csv = toCSV(recipients, columns);
  sendCSV(res, `distribution-${distribution.weekId}-recipients.csv`, csv);
}

/**
 * Export all batches for a distribution
 */
export async function exportDistributionBatches(
  db: Db,
  distributionId: string,
  res: Response
): Promise<void> {
  const distribution = await db.collection<Distribution>('distributions')
    .findOne({ _id: new ObjectId(distributionId) });

  if (!distribution) {
    res.status(404).json({ error: 'Distribution not found' });
    return;
  }

  const batches = await db.collection<Batch>('batches')
    .find({ distributionId: new ObjectId(distributionId) })
    .sort({ batchNumber: 1 })
    .toArray();

  const columns: CSVColumn<Batch>[] = [
    { header: 'Batch Number', accessor: b => b.batchNumber },
    { header: 'Status', accessor: b => b.status },
    { header: 'Recipient Count', accessor: b => b.recipientCount },
    { header: 'Total Amount (wei)', accessor: b => b.totalAmount || '0' },
    { header: 'Total Amount (tokens)', accessor: b => formatTokens(b.totalAmount) },
    { header: 'TX Hash', accessor: b => b.execution?.txHash || '' },
    { header: 'Gas Used', accessor: b => b.execution?.gasUsed || '' },
    { header: 'Gas Price (wei)', accessor: b => b.execution?.gasPrice || '' },
    { header: 'Gas Price (gwei)', accessor: b => b.execution?.gasPrice ? formatGwei(BigInt(b.execution.gasPrice)) : '' },
    { header: 'Block Number', accessor: b => b.execution?.blockNumber || '' },
    { header: 'Confirmed At', accessor: b => b.execution?.confirmedAt ? new Date(b.execution.confirmedAt).toISOString() : '' },
    { header: 'Retry Count', accessor: b => b.retryCount },
    { header: 'Last Error', accessor: b => b.lastError || '' },
  ];

  const csv = toCSV(batches, columns);
  sendCSV(res, `distribution-${distribution.weekId}-batches.csv`, csv);
}

/**
 * Export holders for a snapshot
 */
export async function exportSnapshotHolders(
  db: Db,
  snapshotId: string,
  res: Response
): Promise<void> {
  const snapshot = await db.collection<Snapshot>('snapshots')
    .findOne({ _id: new ObjectId(snapshotId) });

  if (!snapshot) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }

  const holders = await db.collection<Holder>('holders')
    .find({ snapshotId: new ObjectId(snapshotId) })
    .sort({ balance: -1 })
    .toArray();

  const columns: CSVColumn<Holder>[] = [
    { header: 'Address', accessor: h => h.address },
    { header: 'Balance (wei)', accessor: h => h.balance },
    { header: 'Balance (tokens)', accessor: h => h.balanceFormatted || formatTokens(h.balance) },
    { header: 'Is Contract', accessor: h => h.isContract ? 'Yes' : 'No' },
    { header: 'Label', accessor: h => h.label || '' },
    { header: 'Entity', accessor: h => h.entity || '' },
  ];

  const csv = toCSV(holders, columns);
  sendCSV(res, `snapshot-${snapshot.weekId}-holders.csv`, csv);
}

/**
 * Export analytics summary
 */
export async function exportAnalyticsSummary(
  db: Db,
  res: Response
): Promise<void> {
  const distributions = await db.collection<Distribution>('distributions')
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  const columns: CSVColumn<Distribution>[] = [
    { header: 'Week ID', accessor: d => d.weekId },
    { header: 'Status', accessor: d => d.status },
    { header: 'Total Holders', accessor: d => d.stats?.totalHolders || 0 },
    { header: 'Eligible Holders', accessor: d => d.stats?.eligibleHolders || 0 },
    { header: 'Config Excluded', accessor: d => d.stats?.configExcluded || 0 },
    { header: 'Bot Restricted', accessor: d => d.stats?.botRestricted || 0 },
    { header: 'Total Eligible Balance (wei)', accessor: d => d.stats?.totalEligibleBalance || '0' },
    { header: 'Total Eligible Balance (tokens)', accessor: d => formatTokens(d.stats?.totalEligibleBalance) },
    { header: 'Reward Pool (wei)', accessor: d => d.config?.rewardPool || '0' },
    { header: 'Reward Pool (tokens)', accessor: d => formatTokens(d.config?.rewardPool) },
    { header: 'Reward Token', accessor: d => d.config?.rewardToken || '' },
    { header: 'Total Distributed (wei)', accessor: d => d.stats?.totalDistributed || '0' },
    { header: 'Total Distributed (tokens)', accessor: d => formatTokens(d.stats?.totalDistributed) },
    { header: 'Created At', accessor: d => d.createdAt ? new Date(d.createdAt).toISOString() : '' },
    { header: 'Completed At', accessor: d => d.completedAt ? new Date(d.completedAt).toISOString() : '' },
  ];

  const csv = toCSV(distributions, columns);
  sendCSV(res, `analytics-summary-${new Date().toISOString().split('T')[0]}.csv`, csv);
}

/**
 * Export gas analytics
 */
export async function exportGasAnalytics(
  db: Db,
  res: Response
): Promise<void> {
  const batches = await db.collection<Batch>('batches')
    .find({ status: 'completed' })
    .sort({ 'execution.confirmedAt': -1 })
    .toArray();

  interface BatchWithGas extends Batch {
    gasPerRecipient?: number;
    costEth?: string;
  }

  const batchesWithGas: BatchWithGas[] = batches.map(b => {
    const gasUsed = BigInt(b.execution?.gasUsed || '0');
    const gasPrice = BigInt(b.execution?.gasPrice || '0');
    const recipientCount = b.recipientCount || 1;
    const cost = gasUsed * gasPrice;

    return {
      ...b,
      gasPerRecipient: Number(gasUsed) / recipientCount,
      costEth: formatEth(cost),
    };
  });

  const columns: CSVColumn<BatchWithGas>[] = [
    { header: 'Week ID', accessor: b => b.weekId },
    { header: 'Batch Number', accessor: b => b.batchNumber },
    { header: 'Recipients', accessor: b => b.recipientCount },
    { header: 'Gas Used', accessor: b => b.execution?.gasUsed || '0' },
    { header: 'Gas Price (gwei)', accessor: b => b.execution?.gasPrice ? formatGwei(BigInt(b.execution.gasPrice)) : '0' },
    { header: 'Gas Per Recipient', accessor: b => b.gasPerRecipient?.toFixed(0) || '0' },
    { header: 'Cost (ETH)', accessor: b => b.costEth || '0' },
    { header: 'TX Hash', accessor: b => b.execution?.txHash || '' },
    { header: 'Block Number', accessor: b => b.execution?.blockNumber || '' },
    { header: 'Confirmed At', accessor: b => b.execution?.confirmedAt ? new Date(b.execution.confirmedAt).toISOString() : '' },
  ];

  const csv = toCSV(batchesWithGas, columns);
  sendCSV(res, `gas-analytics-${new Date().toISOString().split('T')[0]}.csv`, csv);
}

/**
 * Format wei to tokens with 18 decimals
 */
function formatTokens(weiAmount: string | undefined): string {
  if (!weiAmount) return '0';
  try {
    const wei = BigInt(weiAmount);
    const whole = wei / BigInt(10 ** 18);
    const decimal = wei % BigInt(10 ** 18);
    const decimalStr = decimal.toString().padStart(18, '0').slice(0, 4);
    return `${whole}.${decimalStr}`;
  } catch {
    return '0';
  }
}
