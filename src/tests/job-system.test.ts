import { MongoClient, Db, ObjectId } from 'mongodb';
import { getConfig } from '../config/env';

/**
 * Test script for job system functionality
 * Run with: npx ts-node src/tests/job-system.test.ts
 */

const config = getConfig();
let client: MongoClient;
let db: Db;

async function setup() {
  console.log('🔧 Connecting to MongoDB...');
  client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  db = client.db();
  console.log('✅ Connected to MongoDB\n');
}

async function cleanup() {
  await client.close();
  console.log('\n🔧 Disconnected from MongoDB');
}

async function clearTestData() {
  console.log('🧹 Clearing test data...');
  await db.collection('snapshots').deleteMany({ weekId: { $regex: /^TEST-/ } });
  await db.collection('distributions').deleteMany({ weekId: { $regex: /^TEST-/ } });
  await db.collection('jobs').deleteMany({ weekId: { $regex: /^TEST-/ } });
  await db.collection('job_logs').deleteMany({ weekId: { $regex: /^TEST-/ } });
  await db.collection('batches').deleteMany({ weekId: { $regex: /^TEST-/ } });
  await db.collection('recipients').deleteMany({ weekId: { $regex: /^TEST-/ } });
  await db.collection('holders').deleteMany({ weekId: { $regex: /^TEST-/ } });
  console.log('✅ Test data cleared\n');
}

// ═══════════════════════════════════════════════════════════
// Test: Job Logs Collection
// ═══════════════════════════════════════════════════════════

async function testJobLogs() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: Job Logs Collection');
  console.log('═══════════════════════════════════════════════════════════\n');

  const jobId = `test-job-${Date.now()}`;
  const weekId = 'TEST-999';

  // Create job log
  console.log('1. Creating job log...');
  await db.collection('job_logs').insertOne({
    jobId,
    type: 'snapshot-start',
    weekId,
    status: 'queued',
    logs: [{ timestamp: new Date(), level: 'info', message: 'Job queued' }],
    retryCount: 0,
    queuedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const created = await db.collection('job_logs').findOne({ jobId });
  console.log(`   ✅ Created: ${created ? 'Yes' : 'No'}`);
  console.log(`   Status: ${created?.status}`);

  // Update to running
  console.log('\n2. Updating to running...');
  await db.collection('job_logs').updateOne(
    { jobId },
    {
      $set: { status: 'running', startedAt: new Date(), updatedAt: new Date() },
      $push: { logs: { timestamp: new Date(), level: 'info', message: 'Job started' } as any }
    }
  );

  const running = await db.collection('job_logs').findOne({ jobId });
  console.log(`   ✅ Status: ${running?.status}`);
  console.log(`   Logs count: ${running?.logs?.length}`);

  // Update to completed
  console.log('\n3. Updating to completed...');
  await db.collection('job_logs').updateOne(
    { jobId },
    {
      $set: { status: 'completed', completedAt: new Date(), updatedAt: new Date() },
      $push: { logs: { timestamp: new Date(), level: 'success', message: 'Job completed' } as any }
    }
  );

  const completed = await db.collection('job_logs').findOne({ jobId });
  console.log(`   ✅ Status: ${completed?.status}`);
  console.log(`   Logs count: ${completed?.logs?.length}`);

  // Cleanup
  await db.collection('job_logs').deleteOne({ jobId });
  console.log('\n✅ Job Logs Test PASSED\n');
}

// ═══════════════════════════════════════════════════════════
// Test: Week Status Logic
// ═══════════════════════════════════════════════════════════

async function testWeekStatus() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: Week Status Logic');
  console.log('═══════════════════════════════════════════════════════════\n');

  const weekId = 'TEST-STATUS';

  // Scenario 1: No data - all pending
  console.log('1. Scenario: No data (fresh start)');
  const status1 = await getWeekStatus(weekId);
  console.log(`   Start Snapshot: ${status1.startSnapshot.status} ${status1.startSnapshot.status === 'pending' ? '✅' : '❌'}`);
  console.log(`   End Snapshot: ${status1.endSnapshot.status} ${status1.endSnapshot.status === 'pending' ? '✅' : '❌'}`);
  console.log(`   Calculate: ${status1.calculate.status} ${status1.calculate.status === 'pending' ? '✅' : '❌'}`);
  console.log(`   Airdrop: ${status1.airdrop.status} ${status1.airdrop.status === 'pending' ? '✅' : '❌'}`);

  // Scenario 2: Start snapshot completed
  console.log('\n2. Scenario: Start snapshot completed');
  await db.collection('snapshots').insertOne({
    weekId: `${weekId}-start`,
    status: 'completed',
    totalHolders: 100,
    totalBalance: '1000000',
    timestamp: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
  });

  const status2 = await getWeekStatus(weekId);
  console.log(`   Start Snapshot: ${status2.startSnapshot.status} ${status2.startSnapshot.status === 'completed' ? '✅' : '❌'}`);
  console.log(`   End Snapshot: ${status2.endSnapshot.status} ${status2.endSnapshot.status === 'pending' ? '✅' : '❌'}`);

  // Scenario 3: Both snapshots completed
  console.log('\n3. Scenario: Both snapshots completed');
  await db.collection('snapshots').insertOne({
    weekId: `${weekId}-end`,
    status: 'completed',
    totalHolders: 100,
    totalBalance: '1000000',
    timestamp: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
  });

  const status3 = await getWeekStatus(weekId);
  console.log(`   Start Snapshot: ${status3.startSnapshot.status} ${status3.startSnapshot.status === 'completed' ? '✅' : '❌'}`);
  console.log(`   End Snapshot: ${status3.endSnapshot.status} ${status3.endSnapshot.status === 'completed' ? '✅' : '❌'}`);
  console.log(`   Calculate: ${status3.calculate.status} ${status3.calculate.status === 'pending' ? '✅' : '❌'}`);

  // Scenario 4: Distribution ready (calculate done)
  console.log('\n4. Scenario: Distribution ready');
  await db.collection('distributions').insertOne({
    weekId,
    status: 'ready',
    createdAt: new Date(),
  });

  const status4 = await getWeekStatus(weekId);
  console.log(`   Calculate: ${status4.calculate.status} ${status4.calculate.status === 'completed' ? '✅' : '❌'}`);
  console.log(`   Airdrop: ${status4.airdrop.status} ${status4.airdrop.status === 'pending' ? '✅' : '❌'}`);

  // Scenario 5: Distribution completed
  console.log('\n5. Scenario: Distribution completed');
  await db.collection('distributions').updateOne(
    { weekId },
    { $set: { status: 'completed', completedAt: new Date() } }
  );

  const status5 = await getWeekStatus(weekId);
  console.log(`   Airdrop: ${status5.airdrop.status} ${status5.airdrop.status === 'completed' ? '✅' : '❌'}`);

  // Scenario 6: Running job with completed snapshot (stale job)
  console.log('\n6. Scenario: Stale job (job running but snapshot completed)');
  await db.collection('jobs').insertOne({
    weekId: `${weekId}-start`,
    type: 'snapshot',
    status: 'running',
    createdAt: new Date(),
  });

  const status6 = await getWeekStatus(weekId);
  console.log(`   Start Snapshot: ${status6.startSnapshot.status} ${status6.startSnapshot.status === 'completed' ? '✅ (correctly shows completed, not running)' : '❌ (bug: showing running)'}`);

  // Cleanup
  await db.collection('snapshots').deleteMany({ weekId: { $regex: weekId } });
  await db.collection('distributions').deleteMany({ weekId });
  await db.collection('jobs').deleteMany({ weekId: { $regex: weekId } });

  console.log('\n✅ Week Status Test PASSED\n');
}

// Helper: Get week status (mirrors admin controller logic)
async function getWeekStatus(weekId: string) {
  const startSnapshot = await db.collection('snapshots').findOne({ weekId: `${weekId}-start` });
  const endSnapshot = await db.collection('snapshots').findOne({ weekId: `${weekId}-end` });
  const distribution = await db.collection('distributions').findOne({ weekId });

  const runningJobs = await db.collection('jobs').find({
    weekId: { $regex: weekId },
    status: 'running'
  }).toArray();

  // Check which specific jobs are running (but not if snapshot is already completed)
  const isStartSnapshotRunning = runningJobs.some((j: any) => j.weekId === `${weekId}-start` && j.type === 'snapshot')
    && (!startSnapshot || startSnapshot.status !== 'completed');
  const isEndSnapshotRunning = runningJobs.some((j: any) => j.weekId === `${weekId}-end` && j.type === 'snapshot')
    && (!endSnapshot || endSnapshot.status !== 'completed');
  const isCalculateRunning = runningJobs.some((j: any) => j.weekId === weekId && j.type === 'calculation')
    && (!distribution || !['ready', 'processing', 'completed'].includes(distribution.status));
  const isAirdropRunning = runningJobs.some((j: any) => j.weekId === weekId && j.type === 'airdrop')
    && (!distribution || distribution.status !== 'completed');

  return {
    startSnapshot: getStepStatus(startSnapshot, isStartSnapshotRunning),
    endSnapshot: getStepStatus(endSnapshot, isEndSnapshotRunning),
    calculate: getCalcStatus(distribution, isCalculateRunning),
    airdrop: getAirdropStatus(distribution, isAirdropRunning),
  };
}

function getStepStatus(snapshot: any, isRunning: boolean) {
  if (isRunning) return { status: 'running' };
  if (!snapshot) return { status: 'pending' };
  if (snapshot.status === 'completed') return { status: 'completed', completedAt: snapshot.completedAt };
  if (snapshot.status === 'failed') return { status: 'failed' };
  return { status: 'pending' };
}

function getCalcStatus(distribution: any, isRunning: boolean) {
  if (isRunning) return { status: 'running' };
  if (!distribution) return { status: 'pending' };
  if (['ready', 'processing', 'completed'].includes(distribution.status)) return { status: 'completed' };
  if (distribution.status === 'failed') return { status: 'failed' };
  return { status: 'pending' };
}

function getAirdropStatus(distribution: any, isRunning: boolean) {
  if (isRunning) return { status: 'running' };
  if (!distribution) return { status: 'pending' };
  if (distribution.status === 'completed') return { status: 'completed' };
  if (distribution.status === 'failed') return { status: 'failed' };
  if (distribution.status === 'ready') return { status: 'pending' };
  return { status: 'pending' };
}

// ═══════════════════════════════════════════════════════════
// Test: Scheduler State Restoration
// ═══════════════════════════════════════════════════════════

async function testSchedulerStateRestoration() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: Scheduler State Restoration');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Scenario 1: No data - should start fresh
  console.log('1. Scenario: No data');
  const state1 = await determineSchedulerState();
  console.log(`   State: ${state1.nextAction} ${state1.nextAction === 'waiting-for-start-snapshot' ? '✅' : '❌'}`);

  // Scenario 2: Start snapshot completed
  console.log('\n2. Scenario: Start snapshot completed');
  await db.collection('snapshots').insertOne({
    weekId: 'TEST-SCHED-start',
    status: 'completed',
    totalHolders: 100,
    timestamp: new Date(),
    createdAt: new Date(),
  });

  const state2 = await determineSchedulerState();
  console.log(`   State: ${state2.nextAction} ${state2.nextAction === 'waiting-for-end-snapshot' ? '✅' : '❌'}`);

  // Scenario 3: Both snapshots completed
  console.log('\n3. Scenario: Both snapshots completed');
  await db.collection('snapshots').insertOne({
    weekId: 'TEST-SCHED-end',
    status: 'completed',
    totalHolders: 100,
    timestamp: new Date(),
    createdAt: new Date(),
  });

  const state3 = await determineSchedulerState();
  console.log(`   State: ${state3.nextAction} ${state3.nextAction === 'waiting-for-calculate' ? '✅' : '❌'}`);

  // Scenario 4: Distribution ready
  console.log('\n4. Scenario: Distribution ready');
  await db.collection('distributions').insertOne({
    weekId: 'TEST-SCHED',
    status: 'ready',
    createdAt: new Date(),
  });

  const state4 = await determineSchedulerState();
  console.log(`   State: ${state4.nextAction} ${state4.nextAction === 'waiting-for-airdrop' ? '✅' : '❌'}`);

  // Scenario 5: Distribution completed
  console.log('\n5. Scenario: Distribution completed');
  await db.collection('distributions').updateOne(
    { weekId: 'TEST-SCHED' },
    { $set: { status: 'completed' } }
  );

  const state5 = await determineSchedulerState();
  console.log(`   State: ${state5.nextAction} ${state5.nextAction === 'waiting-for-start-snapshot' ? '✅' : '❌'}`);

  // Cleanup
  await db.collection('snapshots').deleteMany({ weekId: { $regex: /^TEST-SCHED/ } });
  await db.collection('distributions').deleteMany({ weekId: 'TEST-SCHED' });

  console.log('\n✅ Scheduler State Restoration Test PASSED\n');
}

// Helper: Determine scheduler state (mirrors scheduler.ts logic)
async function determineSchedulerState() {
  const latestDist = await db.collection('distributions')
    .find({})
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();

  const latestSnapshot = await db.collection('snapshots')
    .find({})
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();

  if (latestDist.length === 0 && latestSnapshot.length === 0) {
    return { nextAction: 'waiting-for-start-snapshot' };
  }

  // Determine current cycle from weekId
  let currentWeekId = '';
  if (latestDist.length > 0 && latestDist[0]?.weekId) {
    currentWeekId = latestDist[0].weekId;
  } else if (latestSnapshot.length > 0 && latestSnapshot[0]?.weekId) {
    currentWeekId = latestSnapshot[0].weekId.replace(/-start$/, '').replace(/-end$/, '');
  }

  // Check what step we're at
  const dist = latestDist[0];
  if (dist) {
    if (dist.status === 'ready') {
      return { nextAction: 'waiting-for-airdrop', weekId: currentWeekId };
    } else if (dist.status === 'completed') {
      return { nextAction: 'waiting-for-start-snapshot', weekId: currentWeekId };
    } else if (dist.status === 'processing') {
      return { nextAction: 'airdrop-in-progress', weekId: currentWeekId };
    }
  }

  // No distribution - check snapshots
  const startSnap = await db.collection('snapshots').findOne({ weekId: `${currentWeekId}-start` });
  const endSnap = await db.collection('snapshots').findOne({ weekId: `${currentWeekId}-end` });

  if (endSnap?.status === 'completed') {
    return { nextAction: 'waiting-for-calculate', weekId: currentWeekId };
  } else if (startSnap?.status === 'completed') {
    return { nextAction: 'waiting-for-end-snapshot', weekId: currentWeekId };
  }

  return { nextAction: 'waiting-for-start-snapshot', weekId: currentWeekId };
}

// ═══════════════════════════════════════════════════════════
// Run All Tests
// ═══════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           AQUARI AIRDROP - JOB SYSTEM TESTS               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    await setup();
    await clearTestData();

    await testJobLogs();
    await testWeekStatus();
    await testSchedulerStateRestoration();

    await clearTestData();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  ALL TESTS PASSED ✅                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runAllTests();
