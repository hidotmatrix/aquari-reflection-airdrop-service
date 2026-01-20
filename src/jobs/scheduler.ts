import { Db } from 'mongodb';
import cron from 'node-cron';
import { getConfig, getModeName, useFastCycles } from '../config/env';
import { logger } from '../utils/logger';
import { startJob } from '../services/job.runner';
import { getCurrentWeekId, getTestCycleId } from '../utils/week';

// ═══════════════════════════════════════════════════════════
// Scheduler
// ═══════════════════════════════════════════════════════════
//
// Fork Mode (Fast Cycles):
//   Server Start → Snapshot START
//   +10 min      → Snapshot END
//   +5 min       → Calculate
//   +5 min       → Airdrop (auto or manual)
//
// Production Mode (Weekly Cron):
//   Sunday  23:59 UTC → Snapshot
//   Monday  00:30 UTC → Calculate
//   Manual            → Airdrop
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
let fastCycleTimeouts: NodeJS.Timeout[] = [];

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

  if (useFastCycles()) {
    initializeFastCycleScheduler(db);
  } else {
    initializeWeeklyCronScheduler(db);
  }

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

  // Clear fast cycle timeouts
  fastCycleTimeouts.forEach(timeout => clearTimeout(timeout));
  fastCycleTimeouts = [];

  schedulerState.isRunning = false;
  schedulerState.nextAction = 'stopped';
  schedulerState.nextActionTime = null;

  logger.info('Scheduler stopped');
}

// ═══════════════════════════════════════════════════════════
// Fast Cycle Scheduler (Fork Mode)
// ═══════════════════════════════════════════════════════════

function initializeFastCycleScheduler(db: Db): void {
  const config = getConfig();
  const schedule = config.SCHEDULE;

  const totalCycleTime = schedule.snapshotIntervalMinutes + schedule.calculateDelayMinutes +
    (schedule.autoApprove ? schedule.airdropDelayMinutes : 0);

  logger.info('Fast Cycle Schedule:');
  logger.info(`  Auto-Start: ${schedule.autoStart ? 'YES' : 'NO (manual trigger required)'}`);
  if (schedule.startDelayMinutes > 0) {
    logger.info(`  Start Delay: ${schedule.startDelayMinutes} minutes`);
  }
  logger.info(`  0:00  - Snapshot START`);
  logger.info(`  ${schedule.snapshotIntervalMinutes}:00 - Snapshot END`);
  logger.info(`  ${schedule.snapshotIntervalMinutes + schedule.calculateDelayMinutes}:00 - Calculate rewards`);
  if (schedule.autoApprove) {
    logger.info(`  ${totalCycleTime}:00 - Airdrop (auto)`);
  } else {
    logger.info(`  ??:?? - Airdrop (manual approval required)`);
  }
  logger.info('───────────────────────────────────────────────────────────');

  // Check if auto-start is enabled
  if (!schedule.autoStart) {
    schedulerState.nextAction = 'waiting-for-trigger';
    schedulerState.nextActionTime = null;
    logger.info('');
    logger.info('⏸️  Scheduler initialized but NOT auto-starting');
    logger.info('   Use the admin dashboard to manually start the workflow');
    logger.info('');
    return;
  }

  // Check if there's a start delay
  if (schedule.startDelayMinutes > 0) {
    const startDelayMs = schedule.startDelayMinutes * 60 * 1000;
    const startTime = new Date(Date.now() + startDelayMs);

    schedulerState.nextAction = 'starting-soon';
    schedulerState.nextActionTime = startTime;

    logger.info('');
    logger.info(`⏳ Workflow will start in ${schedule.startDelayMinutes} minutes at ${startTime.toLocaleTimeString()}`);
    logger.info('');

    const delayTimeout = setTimeout(() => {
      logger.info('Start delay complete - beginning first cycle');
      schedulerState.currentCycle = 1;
      startFastCycle(db);
    }, startDelayMs);

    fastCycleTimeouts.push(delayTimeout);
    return;
  }

  // Start first cycle immediately
  schedulerState.currentCycle = 1;
  startFastCycle(db);
}

/**
 * Start a fast test cycle
 */
async function startFastCycle(db: Db): Promise<void> {
  const config = getConfig();
  const schedule = config.SCHEDULE;
  const cycleId = getTestCycleId(schedulerState.currentCycle);

  logger.info('');
  logger.info(`${'═'.repeat(60)}`);
  logger.info(`  CYCLE #${schedulerState.currentCycle} STARTED (${cycleId})`);
  logger.info(`${'═'.repeat(60)}`);
  logger.info('');

  // Step 1: Take START snapshot immediately
  schedulerState.nextAction = 'snapshot-start';
  schedulerState.nextActionTime = new Date();

  logger.info(`[${cycleId}] Taking START snapshot...`);
  try {
    await startJob(db, 'snapshot', `${cycleId}-start`);
    schedulerState.lastSnapshot = new Date();
    logger.info(`[${cycleId}] START snapshot complete`);
  } catch (error) {
    logger.error(`[${cycleId}] START snapshot failed:`, error);
  }

  // Step 2: Schedule END snapshot
  const endSnapshotDelayMs = schedule.snapshotIntervalMinutes * 60 * 1000;
  const endSnapshotTime = new Date(Date.now() + endSnapshotDelayMs);

  schedulerState.nextAction = 'snapshot-end';
  schedulerState.nextActionTime = endSnapshotTime;

  logger.info(`[${cycleId}] END snapshot scheduled for ${endSnapshotTime.toLocaleTimeString()} (in ${schedule.snapshotIntervalMinutes} min)`);

  const endSnapshotTimeout = setTimeout(async () => {
    logger.info(`[${cycleId}] Taking END snapshot...`);
    try {
      await startJob(db, 'snapshot', `${cycleId}-end`);
      schedulerState.lastSnapshot = new Date();
      logger.info(`[${cycleId}] END snapshot complete`);
    } catch (error) {
      logger.error(`[${cycleId}] END snapshot failed:`, error);
    }

    // Step 3: Schedule calculation
    const calcDelayMs = schedule.calculateDelayMinutes * 60 * 1000;
    const calcTime = new Date(Date.now() + calcDelayMs);

    schedulerState.nextAction = 'calculation';
    schedulerState.nextActionTime = calcTime;

    logger.info(`[${cycleId}] Calculation scheduled for ${calcTime.toLocaleTimeString()} (in ${schedule.calculateDelayMinutes} min)`);

    const calcTimeout = setTimeout(async () => {
      logger.info(`[${cycleId}] Calculating rewards...`);
      try {
        await startJob(db, 'calculation', cycleId);
        schedulerState.lastCalculation = new Date();
        logger.info(`[${cycleId}] Calculation complete`);
      } catch (error) {
        logger.error(`[${cycleId}] Calculation failed:`, error);
      }

      // Step 4: Airdrop (auto or manual)
      if (schedule.autoApprove) {
        const airdropDelayMs = schedule.airdropDelayMinutes * 60 * 1000;
        const airdropTime = new Date(Date.now() + airdropDelayMs);

        schedulerState.nextAction = 'airdrop';
        schedulerState.nextActionTime = airdropTime;

        logger.info(`[${cycleId}] Airdrop scheduled for ${airdropTime.toLocaleTimeString()} (in ${schedule.airdropDelayMinutes} min, auto-approve)`);

        const airdropTimeout = setTimeout(async () => {
          logger.info(`[${cycleId}] Executing airdrop (auto-approved)...`);
          try {
            await startJob(db, 'airdrop', cycleId);
            schedulerState.lastAirdrop = new Date();
            logger.info(`[${cycleId}] Airdrop complete`);
          } catch (error) {
            logger.error(`[${cycleId}] Airdrop failed:`, error);
          }

          // Start next cycle
          logger.info('');
          schedulerState.currentCycle++;
          startFastCycle(db);
        }, airdropDelayMs);

        fastCycleTimeouts.push(airdropTimeout);
      } else {
        // Wait for manual approval
        schedulerState.nextAction = 'awaiting-approval';
        schedulerState.nextActionTime = null;

        logger.info('');
        logger.info(`${'─'.repeat(60)}`);
        logger.info(`[${cycleId}] WAITING FOR MANUAL APPROVAL`);
        logger.info(`  Visit: http://localhost:${config.PORT}/admin/distributions`);
        logger.info(`  Approve the distribution to execute airdrop`);
        logger.info(`${'─'.repeat(60)}`);
        logger.info('');
      }
    }, calcDelayMs);

    fastCycleTimeouts.push(calcTimeout);
  }, endSnapshotDelayMs);

  fastCycleTimeouts.push(endSnapshotTimeout);
}

/**
 * Continue to next fast cycle after manual approval
 */
export function continueToNextCycle(db: Db): void {
  if (!useFastCycles()) return;

  schedulerState.lastAirdrop = new Date();
  schedulerState.currentCycle++;

  logger.info('Manual approval received - starting next cycle');
  startFastCycle(db);
}

/**
 * Manually start the workflow (when AUTO_START=false)
 */
export function manualStartWorkflow(db: Db): { success: boolean; message: string } {
  if (!useFastCycles()) {
    return { success: false, message: 'Manual start only available in fork mode' };
  }

  if (schedulerState.nextAction !== 'waiting-for-trigger' && schedulerState.nextAction !== 'stopped') {
    return { success: false, message: `Workflow already running (status: ${schedulerState.nextAction})` };
  }

  logger.info('');
  logger.info('🚀 Manual workflow start triggered from admin dashboard');
  logger.info('');

  schedulerState.currentCycle = 1;
  startFastCycle(db);

  return { success: true, message: 'Workflow started successfully' };
}

// ═══════════════════════════════════════════════════════════
// Weekly Cron Scheduler (Production Mode)
// ═══════════════════════════════════════════════════════════

function initializeWeeklyCronScheduler(db: Db): void {
  logger.info('Weekly Cron Schedule (UTC):');
  logger.info('  Sunday  23:59 - Snapshot');
  logger.info('  Monday  00:30 - Calculate rewards');
  logger.info('  Manual        - Airdrop approval');
  logger.info('───────────────────────────────────────────────────────────');

  // Sunday 23:59 UTC - Take snapshot
  const snapshotTask = cron.schedule('59 23 * * 0', async () => {
    const weekId = getCurrentWeekId();
    logger.info(`[Cron] Taking snapshot for week ${weekId}`);

    schedulerState.nextAction = 'snapshot';
    await startJob(db, 'snapshot', weekId);
    schedulerState.lastSnapshot = new Date();

    schedulerState.nextAction = 'calculation';
    schedulerState.nextActionTime = getNextMonday0030();
    logNextAction();
  }, {
    timezone: 'UTC'
  });

  // Monday 00:30 UTC - Calculate rewards
  const calcTask = cron.schedule('30 0 * * 1', async () => {
    const weekId = getCurrentWeekId();
    logger.info(`[Cron] Calculating rewards for week ${weekId}`);

    schedulerState.nextAction = 'calculation';
    await startJob(db, 'calculation', weekId);
    schedulerState.lastCalculation = new Date();

    schedulerState.nextAction = 'awaiting-approval';
    schedulerState.nextActionTime = null;
    logger.info('[Scheduler] Awaiting manual airdrop approval at /admin/distributions');
  }, {
    timezone: 'UTC'
  });

  scheduledTasks.push(snapshotTask, calcTask);

  // Set initial state
  updateNextCronAction();
  logNextAction();
}

function updateNextCronAction(): void {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  if ((dayOfWeek === 0 && (hour > 23 || (hour === 23 && minute >= 59))) ||
      (dayOfWeek === 1 && (hour === 0 && minute < 30))) {
    schedulerState.nextAction = 'calculation';
    schedulerState.nextActionTime = getNextMonday0030();
  } else if (dayOfWeek === 1 && (hour > 0 || (hour === 0 && minute >= 30))) {
    schedulerState.nextAction = 'awaiting-approval';
    schedulerState.nextActionTime = null;
  } else {
    schedulerState.nextAction = 'snapshot';
    schedulerState.nextActionTime = getNextSunday2359();
  }
}

function logNextAction(): void {
  if (schedulerState.nextActionTime) {
    const timeStr = schedulerState.nextActionTime.toISOString();
    const localStr = schedulerState.nextActionTime.toLocaleString();
    logger.info(`[Scheduler] Next: ${schedulerState.nextAction} at ${timeStr} (${localStr})`);
  } else if (schedulerState.nextAction === 'awaiting-approval') {
    logger.info('[Scheduler] Next: Awaiting manual airdrop approval');
  }
}

function getNextSunday2359(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  let daysToAdd = 0;

  if (dayOfWeek === 0) {
    if (hour < 23 || (hour === 23 && minute < 59)) {
      daysToAdd = 0;
    } else {
      daysToAdd = 7;
    }
  } else {
    daysToAdd = 7 - dayOfWeek;
  }

  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + daysToAdd);
  target.setUTCHours(23, 59, 0, 0);
  return target;
}

function getNextMonday0030(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  let daysToAdd = 0;

  if (dayOfWeek === 1) {
    if (hour === 0 && minute < 30) {
      daysToAdd = 0;
    } else {
      daysToAdd = 7;
    }
  } else if (dayOfWeek === 0) {
    daysToAdd = 1;
  } else {
    daysToAdd = 8 - dayOfWeek;
  }

  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + daysToAdd);
  target.setUTCHours(0, 30, 0, 0);
  return target;
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

  // Continue to next cycle if in fast mode
  if (useFastCycles()) {
    continueToNextCycle(db);
  }
}
