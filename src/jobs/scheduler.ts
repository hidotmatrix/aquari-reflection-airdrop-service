import { Db } from 'mongodb';
import cron from 'node-cron';
import { getConfig, getModeName } from '../config/env';
import { logger } from '../utils/logger';
import { startJob } from '../services/job.runner';
import { getCurrentWeekId, getTestCycleId } from '../utils/week';
import { getWalletTokenBalance } from '../services/blockchain.service';
import { Distribution } from '../models';

// ═══════════════════════════════════════════════════════════
// Cron-Based Scheduler (3-Step Flow)
// ═══════════════════════════════════════════════════════════
//
// 3-Step Cron Schedule:
//   SNAPSHOT_CRON  → Take snapshot (uses previous as baseline)
//   CALCULATE_CRON → Calculate rewards (if 2+ snapshots exist)
//   AIRDROP_CRON   → Auto-airdrop (100% wallet balance)
//
// First cycle: Only snapshot (baseline, no calculation possible)
// Subsequent cycles: Snapshot → Calculate → Airdrop
//
// ═══════════════════════════════════════════════════════════

interface SchedulerState {
  isRunning: boolean;
  mode: string;
  currentCycle: number;
  snapshotCount: number;
  nextAction: string;
  nextActionTime: Date | null;
  lastSnapshot: Date | null;
  lastCalculation: Date | null;
  lastAirdrop: Date | null;
}

let schedulerState: SchedulerState = {
  isRunning: false,
  mode: 'unknown',
  currentCycle: 0,
  snapshotCount: 0,
  nextAction: 'none',
  nextActionTime: null,
  lastSnapshot: null,
  lastCalculation: null,
  lastAirdrop: null,
};

let scheduledTasks: cron.ScheduledTask[] = [];

/**
 * Get the current scheduler state
 */
export function getSchedulerState(): SchedulerState {
  return { ...schedulerState };
}

/**
 * Initialize the scheduler based on MODE
 */
export async function initializeScheduler(db: Db): Promise<void> {
  const config = getConfig();
  schedulerState.mode = config.MODE;

  logger.info('───────────────────────────────────────────────────────────');
  logger.info(`Scheduler: ${getModeName()}`);
  logger.info('───────────────────────────────────────────────────────────');

  // Check database for current state before initializing crons
  await restoreSchedulerState(db);

  // Initialize 3-cron scheduler
  initializeThreeCronScheduler(db);

  schedulerState.isRunning = true;
}

/**
 * Restore scheduler state from database on startup
 */
async function restoreSchedulerState(db: Db): Promise<void> {
  try {
    // Count existing snapshots
    const snapshotCount = await db.collection('snapshots').countDocuments({ status: 'completed' });
    schedulerState.snapshotCount = snapshotCount;

    // Find the most recent distribution
    const latestDist = await db.collection('distributions')
      .find({})
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    // Find the most recent snapshot to determine cycle
    const latestSnapshot = await db.collection('snapshots')
      .find({})
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (latestDist.length === 0 && latestSnapshot.length === 0) {
      logger.info('No previous data found - starting fresh');
      logger.info('First snapshot will be baseline (no airdrop possible until 2+ snapshots)');
      return;
    }

    // Determine current cycle from weekId
    let currentWeekId = '';
    if (latestSnapshot.length > 0 && latestSnapshot[0]?.weekId) {
      currentWeekId = latestSnapshot[0].weekId;
    }

    // Extract cycle number from CYCLE-XXX or TEST-XXX format
    const match = currentWeekId.match(/(?:CYCLE|TEST)-(\d+)/);
    if (match && match[1]) {
      schedulerState.currentCycle = parseInt(match[1], 10);
      logger.info(`Restored cycle number: ${schedulerState.currentCycle}`);
    }

    logger.info(`Snapshots in database: ${snapshotCount}`);

    // Check what step we're at
    const dist = latestDist[0];
    if (dist) {
      if (dist.status === 'ready') {
        schedulerState.nextAction = 'waiting-for-airdrop';
        logger.info(`Distribution ${dist.weekId} is ready - waiting for airdrop cron`);
      } else if (dist.status === 'completed') {
        schedulerState.nextAction = 'waiting-for-snapshot';
        logger.info(`Distribution ${dist.weekId} completed - waiting for next cycle`);
      } else if (dist.status === 'processing') {
        schedulerState.nextAction = 'airdrop-in-progress';
        logger.info(`Distribution ${dist.weekId} is processing`);
      }
    } else if (snapshotCount >= 2) {
      schedulerState.nextAction = 'waiting-for-calculate';
      logger.info(`${snapshotCount} snapshots exist - waiting for calculate cron`);
    } else if (snapshotCount === 1) {
      schedulerState.nextAction = 'waiting-for-snapshot';
      logger.info(`Only 1 snapshot exists (baseline) - waiting for next snapshot`);
    }
  } catch (error) {
    logger.warn('Could not restore scheduler state:', error);
  }
}

/**
 * Stop all scheduled tasks
 */
export function stopScheduler(): void {
  logger.info('Stopping scheduler...');

  // Stop cron jobs
  scheduledTasks.forEach(task => task.stop());
  scheduledTasks = [];

  schedulerState.isRunning = false;
  schedulerState.nextAction = 'stopped';
  schedulerState.nextActionTime = null;

  logger.info('Scheduler stopped');
}

// ═══════════════════════════════════════════════════════════
// 3-Cron Scheduler
// ═══════════════════════════════════════════════════════════

/**
 * 3-cron setup: SNAPSHOT → CALCULATE → AIRDROP
 */
function initializeThreeCronScheduler(db: Db): void {
  const config = getConfig();
  const schedule = config.SCHEDULE;

  logger.info('3-Step Cron Schedule:');
  logger.info(`  1. Snapshot:  ${schedule.snapshotCron || 'NOT SET'}`);
  logger.info(`  2. Calculate: ${schedule.calculateCron || 'NOT SET'}`);
  logger.info(`  3. Airdrop:   ${schedule.airdropCron || 'NOT SET'}`);
  logger.info('───────────────────────────────────────────────────────────');

  // Validate all 3 cron expressions are set
  if (!schedule.snapshotCron || !schedule.calculateCron || !schedule.airdropCron) {
    logger.error('All 3 cron expressions must be set:');
    logger.error('  SNAPSHOT_CRON, CALCULATE_CRON, AIRDROP_CRON');
    throw new Error('Missing required cron configuration');
  }

  // Step 1: Snapshot cron
  validateAndScheduleCron(schedule.snapshotCron, 'SNAPSHOT_CRON', async () => {
    schedulerState.currentCycle++;
    const cycleId = config.MODE === 'fork'
      ? getTestCycleId(schedulerState.currentCycle)
      : getCurrentWeekId();

    logger.info('');
    logger.info(`${'═'.repeat(60)}`);
    logger.info(`  CYCLE #${schedulerState.currentCycle} - SNAPSHOT (${cycleId})`);
    logger.info(`${'═'.repeat(60)}`);

    schedulerState.nextAction = 'taking-snapshot';
    try {
      await startJob(db, 'snapshot', cycleId);
      schedulerState.lastSnapshot = new Date();
      schedulerState.snapshotCount++;
      logger.info(`[${cycleId}] Snapshot complete (Total snapshots: ${schedulerState.snapshotCount})`);

      if (schedulerState.snapshotCount < 2) {
        logger.info(`[${cycleId}] Baseline snapshot taken - need 1 more for calculation`);
      }
    } catch (error) {
      logger.error(`[${cycleId}] Snapshot failed:`, error);
    }

    schedulerState.nextAction = 'waiting-for-calculate';
    schedulerState.nextActionTime = getNextCronTime(schedule.calculateCron!);
  });
  logger.info(`  Snapshot cron scheduled`);

  // Step 2: Calculate cron
  validateAndScheduleCron(schedule.calculateCron, 'CALCULATE_CRON', async () => {
    const cycleId = config.MODE === 'fork'
      ? getTestCycleId(schedulerState.currentCycle)
      : getCurrentWeekId();

    logger.info('');
    logger.info(`[${cycleId}] CALCULATE - Checking snapshots...`);

    // Count completed snapshots
    const snapshotCount = await db.collection('snapshots').countDocuments({ status: 'completed' });
    schedulerState.snapshotCount = snapshotCount;

    if (snapshotCount < 2) {
      logger.warn(`[${cycleId}] Only ${snapshotCount} snapshot(s) - need at least 2 to calculate`);
      logger.warn(`[${cycleId}] Skipping calculation, waiting for more snapshots`);
      schedulerState.nextAction = 'waiting-for-snapshot';
      schedulerState.nextActionTime = getNextCronTime(schedule.snapshotCron!);
      return;
    }

    logger.info(`[${cycleId}] Found ${snapshotCount} snapshots - running calculation...`);

    schedulerState.nextAction = 'calculating';
    try {
      await startJob(db, 'calculation', cycleId);
      schedulerState.lastCalculation = new Date();
      logger.info(`[${cycleId}] Calculation complete`);
    } catch (error) {
      logger.error(`[${cycleId}] Calculation failed:`, error);
    }

    schedulerState.nextAction = 'waiting-for-airdrop';
    schedulerState.nextActionTime = getNextCronTime(schedule.airdropCron!);
  });
  logger.info(`  Calculate cron scheduled`);

  // Step 3: Airdrop cron (auto-approve with 100% wallet balance)
  validateAndScheduleCron(schedule.airdropCron, 'AIRDROP_CRON', async () => {
    const cycleId = config.MODE === 'fork'
      ? getTestCycleId(schedulerState.currentCycle)
      : getCurrentWeekId();

    logger.info('');
    logger.info(`[${cycleId}] AIRDROP - Checking for ready distribution...`);

    // Check if there's a ready distribution
    const readyDist = await db.collection<Distribution>('distributions').findOne({
      status: 'ready'
    });

    if (!readyDist) {
      logger.warn(`[${cycleId}] No ready distribution found - skipping airdrop`);
      schedulerState.nextAction = 'waiting-for-snapshot';
      schedulerState.nextActionTime = getNextCronTime(schedule.snapshotCron!);
      return;
    }

    logger.info(`[${cycleId}] Found ready distribution - auto-approving...`);
    await autoApproveAndAirdrop(db, readyDist.weekId);

    // Set next action for next cycle
    schedulerState.nextAction = 'waiting-for-snapshot';
    schedulerState.nextActionTime = getNextCronTime(schedule.snapshotCron!);
  });
  logger.info(`  Airdrop cron scheduled`);

  // Set next action time based on restored state (or default to snapshot)
  if (!schedulerState.nextAction || schedulerState.nextAction === 'none') {
    schedulerState.nextAction = 'waiting-for-snapshot';
  }

  // Set the correct next action time based on current state
  switch (schedulerState.nextAction) {
    case 'waiting-for-snapshot':
      schedulerState.nextActionTime = getNextCronTime(schedule.snapshotCron);
      break;
    case 'waiting-for-calculate':
      schedulerState.nextActionTime = getNextCronTime(schedule.calculateCron);
      break;
    case 'waiting-for-airdrop':
      schedulerState.nextActionTime = getNextCronTime(schedule.airdropCron);
      break;
  }

  logger.info('');
  logger.info('3-step cron scheduler ready');
  logger.info(`   Snapshots in DB: ${schedulerState.snapshotCount}`);
  logger.info(`   State: ${schedulerState.nextAction}`);
  if (schedulerState.nextActionTime) {
    logger.info(`   Next action at: ${schedulerState.nextActionTime.toLocaleString()}`);
  }
  logger.info('');
}

/**
 * Helper to validate and schedule a cron job
 */
function validateAndScheduleCron(cronExpr: string, name: string, handler: () => Promise<void>): void {
  if (!cron.validate(cronExpr)) {
    logger.error(`Invalid ${name}: "${cronExpr}"`);
    logger.error('   Cron format: "minute hour day month weekday"');
    throw new Error(`Invalid ${name} expression: ${cronExpr}`);
  }

  const task = cron.schedule(cronExpr, handler);
  scheduledTasks.push(task);
}

/**
 * Get next run time for a cron expression
 */
function getNextCronTime(cronExpr: string | null): Date | null {
  if (!cronExpr) return null;
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const minute = parts[0] ?? '';
    const hour = parts[1] ?? '';
    const dayOfMonth = parts[2] ?? '';
    const month = parts[3] ?? '';
    const dayOfWeek = parts[4] ?? '';

    // Handle "*/N" patterns (every N minutes/hours)
    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2), 10);
      const now = new Date();
      const nextMinute = Math.ceil((now.getMinutes() + 1) / interval) * interval;
      const next = new Date(now);
      if (nextMinute >= 60) {
        next.setHours(next.getHours() + 1);
        next.setMinutes(nextMinute - 60);
      } else {
        next.setMinutes(nextMinute);
      }
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;
    }

    // Handle hourly patterns like "30 * * * *" (every hour at minute 30)
    if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && minute) {
      const targetMinute = parseInt(minute, 10);
      if (isNaN(targetMinute)) return null;

      const now = new Date();
      const next = new Date(now);
      next.setMinutes(targetMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);

      // If that minute already passed this hour, schedule for next hour
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }

      return next;
    }

    // Handle daily patterns like "30 14 * * *"
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && minute && hour) {
      const targetMinute = parseInt(minute, 10);
      const targetHour = parseInt(hour, 10);

      if (isNaN(targetMinute) || isNaN(targetHour)) return null;

      const now = new Date();
      const next = new Date();
      next.setHours(targetHour, targetMinute, 0, 0);

      // If time already passed today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      return next;
    }

    // Handle weekly patterns like "30 23 * * 0" (Sunday at 23:30)
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && minute && hour && dayOfWeek) {
      const targetMinute = parseInt(minute, 10);
      const targetHour = parseInt(hour, 10);
      const targetDayOfWeek = parseInt(dayOfWeek, 10);

      if (isNaN(targetMinute) || isNaN(targetHour) || isNaN(targetDayOfWeek)) return null;

      const now = new Date();
      const next = new Date();
      next.setHours(targetHour, targetMinute, 0, 0);

      const currentDayOfWeek = now.getDay();
      let daysToAdd = targetDayOfWeek - currentDayOfWeek;

      if (daysToAdd < 0 || (daysToAdd === 0 && next <= now)) {
        daysToAdd += 7;
      }

      next.setDate(next.getDate() + daysToAdd);
      return next;
    }

    // For complex patterns, return null (dashboard shows cron expression)
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Auto-Approve and Airdrop
// ═══════════════════════════════════════════════════════════

/**
 * Auto-approve airdrop using 100% of wallet token balance
 */
async function autoApproveAndAirdrop(db: Db, weekId: string): Promise<boolean> {
  logger.info('');
  logger.info(`${'─'.repeat(60)}`);
  logger.info(`[${weekId}] AUTO-AIRDROP - Reading wallet balance...`);

  try {
    // Get current wallet token balance (real-time)
    const walletBalance = await getWalletTokenBalance();
    const walletBalanceBigInt = BigInt(walletBalance);

    if (walletBalanceBigInt === 0n) {
      logger.warn(`[${weekId}] Wallet balance is 0 - skipping airdrop`);
      schedulerState.nextAction = 'skipped-no-balance';
      return false;
    }

    const formattedBalance = (Number(walletBalanceBigInt) / 1e18).toLocaleString('en-US');
    logger.info(`[${weekId}] Wallet balance: ${formattedBalance} AQUARI`);
    logger.info(`[${weekId}] Using 100% as reward pool`);

    // Find the distribution for this week
    const distribution = await db.collection<Distribution>('distributions').findOne({
      weekId,
      status: 'ready'
    });

    if (!distribution) {
      logger.error(`[${weekId}] No ready distribution found for auto-approval`);
      return false;
    }

    // Update distribution with wallet balance as reward pool
    await db.collection<Distribution>('distributions').updateOne(
      { _id: distribution._id },
      {
        $set: {
          'config.rewardPool': walletBalance,
          'config.autoApproved': true,
          'config.walletBalanceUsed': walletBalance,
          'config.autoApprovedAt': new Date(),
          status: 'processing',
          updatedAt: new Date()
        }
      }
    );

    logger.info(`[${weekId}] Distribution auto-approved with ${formattedBalance} AQUARI`);
    logger.info(`${'─'.repeat(60)}`);
    logger.info('');

    // Start airdrop job
    schedulerState.nextAction = 'airdrop';
    await startJob(db, 'airdrop', weekId);
    schedulerState.lastAirdrop = new Date();

    logger.info(`[${weekId}] Airdrop complete`);
    return true;

  } catch (error) {
    logger.error(`[${weekId}] Auto-airdrop failed:`, error);
    schedulerState.nextAction = 'airdrop-failed';
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// Manual Triggers (for dashboard)
// ═══════════════════════════════════════════════════════════

export async function triggerSnapshot(db: Db, cycleId: string): Promise<void> {
  logger.info(`[Manual] Triggering snapshot for ${cycleId}`);
  await startJob(db, 'snapshot', cycleId);
  schedulerState.lastSnapshot = new Date();
  schedulerState.snapshotCount++;
}

export async function triggerCalculation(db: Db, cycleId: string): Promise<void> {
  logger.info(`[Manual] Triggering calculation for ${cycleId}`);
  await startJob(db, 'calculation', cycleId);
  schedulerState.lastCalculation = new Date();
}

export async function triggerAirdrop(db: Db, weekId: string): Promise<void> {
  logger.info(`[Manual] Triggering airdrop for ${weekId}`);
  await startJob(db, 'airdrop', weekId);
  schedulerState.lastAirdrop = new Date();
}
