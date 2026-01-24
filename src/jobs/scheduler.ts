import { Db } from 'mongodb';
import cron from 'node-cron';
import { getConfig, getModeName } from '../config/env';
import { logger } from '../utils/logger';
import { startJob } from '../services/job.runner';
import { getCurrentWeekId, getTestCycleId } from '../utils/week';
import { getWalletTokenBalance } from '../services/blockchain.service';
import { Distribution } from '../models';

// ═══════════════════════════════════════════════════════════
// Cron-Based Scheduler
// ═══════════════════════════════════════════════════════════
//
// 4-Step Cron Schedule:
//   START_SNAPSHOT_CRON → Take START snapshot
//   END_SNAPSHOT_CRON   → Take END snapshot
//   CALCULATE_CRON      → Calculate rewards
//   AIRDROP_CRON        → Auto-airdrop (100% wallet balance)
//
// Fork Mode: Configurable cron times (e.g., 5 min apart daily)
// Production Mode: Weekly schedule (Sunday night)
//
// ═══════════════════════════════════════════════════════════

interface SchedulerState {
  isRunning: boolean;
  mode: string;
  currentCycle: number;
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
export function initializeScheduler(db: Db): void {
  const config = getConfig();
  schedulerState.mode = config.MODE;

  logger.info('───────────────────────────────────────────────────────────');
  logger.info(`Scheduler: ${getModeName()}`);
  logger.info('───────────────────────────────────────────────────────────');

  // Initialize 4-cron scheduler
  initializeFourCronScheduler(db);

  schedulerState.isRunning = true;
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
// 4-Cron Scheduler
// ═══════════════════════════════════════════════════════════

/**
 * 4-cron setup: START_SNAPSHOT → END_SNAPSHOT → CALCULATE → AIRDROP
 */
function initializeFourCronScheduler(db: Db): void {
  const config = getConfig();
  const schedule = config.SCHEDULE;

  logger.info('4-Step Cron Schedule:');
  logger.info(`  1. Start Snapshot: ${schedule.startSnapshotCron || 'NOT SET'}`);
  logger.info(`  2. End Snapshot:   ${schedule.endSnapshotCron || 'NOT SET'}`);
  logger.info(`  3. Calculate:      ${schedule.calculateCron || 'NOT SET'}`);
  logger.info(`  4. Airdrop:        ${schedule.airdropCron || 'NOT SET'}`);
  logger.info('───────────────────────────────────────────────────────────');

  // Validate all 4 cron expressions are set
  if (!schedule.startSnapshotCron || !schedule.endSnapshotCron ||
      !schedule.calculateCron || !schedule.airdropCron) {
    logger.error('All 4 cron expressions must be set:');
    logger.error('  START_SNAPSHOT_CRON, END_SNAPSHOT_CRON, CALCULATE_CRON, AIRDROP_CRON');
    throw new Error('Missing required cron configuration');
  }

  // Step 1: START Snapshot cron
  validateAndScheduleCron(schedule.startSnapshotCron, 'START_SNAPSHOT_CRON', async () => {
    schedulerState.currentCycle++;
    const cycleId = config.MODE === 'fork'
      ? getTestCycleId(schedulerState.currentCycle)
      : getCurrentWeekId();

    logger.info('');
    logger.info(`${'═'.repeat(60)}`);
    logger.info(`  CYCLE #${schedulerState.currentCycle} - START SNAPSHOT (${cycleId})`);
    logger.info(`${'═'.repeat(60)}`);

    schedulerState.nextAction = 'snapshot-start';
    try {
      await startJob(db, 'snapshot', `${cycleId}-start`);
      schedulerState.lastSnapshot = new Date();
      logger.info(`[${cycleId}] START snapshot complete`);
    } catch (error) {
      logger.error(`[${cycleId}] START snapshot failed:`, error);
    }

    schedulerState.nextAction = 'waiting-for-end-snapshot';
    schedulerState.nextActionTime = getNextCronTime(schedule.endSnapshotCron!);
  });
  logger.info(`  Start Snapshot cron scheduled`);

  // Step 2: END Snapshot cron
  validateAndScheduleCron(schedule.endSnapshotCron, 'END_SNAPSHOT_CRON', async () => {
    const cycleId = config.MODE === 'fork'
      ? getTestCycleId(schedulerState.currentCycle)
      : getCurrentWeekId();

    logger.info('');
    logger.info(`[${cycleId}] END SNAPSHOT - Taking end snapshot...`);

    schedulerState.nextAction = 'snapshot-end';
    try {
      await startJob(db, 'snapshot', `${cycleId}-end`);
      schedulerState.lastSnapshot = new Date();
      logger.info(`[${cycleId}] END snapshot complete`);
    } catch (error) {
      logger.error(`[${cycleId}] END snapshot failed:`, error);
    }

    schedulerState.nextAction = 'waiting-for-calculate';
    schedulerState.nextActionTime = getNextCronTime(schedule.calculateCron!);
  });
  logger.info(`  End Snapshot cron scheduled`);

  // Step 3: Calculate cron
  validateAndScheduleCron(schedule.calculateCron, 'CALCULATE_CRON', async () => {
    const cycleId = config.MODE === 'fork'
      ? getTestCycleId(schedulerState.currentCycle)
      : getCurrentWeekId();

    logger.info('');
    logger.info(`[${cycleId}] CALCULATE - Running calculation...`);

    schedulerState.nextAction = 'calculation';
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

  // Step 4: Airdrop cron (auto-approve with 100% wallet balance)
  validateAndScheduleCron(schedule.airdropCron, 'AIRDROP_CRON', async () => {
    const cycleId = config.MODE === 'fork'
      ? getTestCycleId(schedulerState.currentCycle)
      : getCurrentWeekId();

    logger.info('');
    logger.info(`[${cycleId}] AIRDROP - Auto-approving with wallet balance...`);

    await autoApproveAndAirdrop(db, cycleId);

    // Set next action for next cycle
    schedulerState.nextAction = 'waiting-for-start-snapshot';
    schedulerState.nextActionTime = getNextCronTime(schedule.startSnapshotCron!);
  });
  logger.info(`  Airdrop cron scheduled`);

  // Set initial state
  schedulerState.nextAction = 'waiting-for-start-snapshot';
  schedulerState.nextActionTime = getNextCronTime(schedule.startSnapshotCron);

  logger.info('');
  logger.info('4-step cron scheduler ready');
  if (schedulerState.nextActionTime) {
    logger.info(`   Next: Start Snapshot at ${schedulerState.nextActionTime.toLocaleString()}`);
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
 * Handles common patterns: "M H * * *" (specific time daily)
 */
function getNextCronTime(cronExpr: string | null): Date | null {
  if (!cronExpr) return null;
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const minute = parts[0];
    const hour = parts[1];
    const dayOfMonth = parts[2];
    const month = parts[3];
    const dayOfWeek = parts[4];

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
 * Called after calculation completes
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

export async function triggerSnapshot(db: Db, weekId: string): Promise<void> {
  logger.info(`[Manual] Triggering snapshot for ${weekId}`);
  await startJob(db, 'snapshot', weekId);
  schedulerState.lastSnapshot = new Date();
}

export async function triggerCalculation(db: Db, weekId: string): Promise<void> {
  logger.info(`[Manual] Triggering calculation for ${weekId}`);
  await startJob(db, 'calculation', weekId);
  schedulerState.lastCalculation = new Date();
}

export async function triggerAirdrop(db: Db, weekId: string): Promise<void> {
  logger.info(`[Manual] Triggering airdrop for ${weekId}`);
  await startJob(db, 'airdrop', weekId);
  schedulerState.lastAirdrop = new Date();
}
