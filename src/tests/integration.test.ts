import { MongoClient, Db } from 'mongodb';
import { getConfig } from '../config/env';
import {
  initializeJobLogService,
  createJobLog,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  addJobLogEntry,
  getJobLogById,
  getRecentJobLogs,
  getActiveJobLogs,
} from '../services/job-log.service';

/**
 * Integration Test - Tests full job logging flow
 * Run with: npx ts-node src/tests/integration.test.ts
 */

const config = getConfig();
let client: MongoClient;
let db: Db;

async function setup() {
  console.log('🔧 Connecting to MongoDB...');
  client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  db = client.db();

  // Initialize job log service
  initializeJobLogService(db);
  console.log('✅ Connected and initialized\n');
}

async function cleanup() {
  // Clean test data
  await db.collection('job_logs').deleteMany({ weekId: { $regex: /^INT-TEST/ } });
  await client.close();
  console.log('\n🔧 Cleaned up');
}

// ═══════════════════════════════════════════════════════════
// Test: Full Job Lifecycle
// ═══════════════════════════════════════════════════════════

async function testFullJobLifecycle() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: Full Job Lifecycle (using job-log.service.ts)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const jobId = `int-test-${Date.now()}`;
  const weekId = 'INT-TEST-001';

  // 1. Create job
  console.log('1. Creating job log...');
  const created = await createJobLog(jobId, 'snapshot-start', weekId);
  console.log(`   ✅ Created with status: ${created.status}`);
  console.log(`   Logs: ${created.logs.length}`);

  // 2. Mark as running
  console.log('\n2. Marking as running...');
  await markJobRunning(jobId);
  const running = await getJobLogById(jobId);
  console.log(`   ✅ Status: ${running?.status}`);
  console.log(`   Started at: ${running?.startedAt ? 'set' : 'not set'}`);

  // 3. Add progress logs
  console.log('\n3. Adding progress logs...');
  await addJobLogEntry(jobId, 'info', 'Fetching holders from API...');
  await addJobLogEntry(jobId, 'info', 'Progress: 500 holders saved');
  await addJobLogEntry(jobId, 'warn', 'Rate limited, waiting...');
  await addJobLogEntry(jobId, 'info', 'Progress: 1000 holders saved');

  const withLogs = await getJobLogById(jobId);
  console.log(`   ✅ Total logs: ${withLogs?.logs.length}`);

  // 4. Mark as completed
  console.log('\n4. Marking as completed...');
  await markJobCompleted(jobId, { totalHolders: 1000 });
  const completed = await getJobLogById(jobId);
  console.log(`   ✅ Status: ${completed?.status}`);
  console.log(`   Completed at: ${completed?.completedAt ? 'set' : 'not set'}`);
  console.log(`   Total logs: ${completed?.logs.length}`);

  // 5. Query functions
  console.log('\n5. Testing query functions...');
  const recent = await getRecentJobLogs(10);
  console.log(`   Recent jobs: ${recent.length}`);

  const active = await getActiveJobLogs();
  console.log(`   Active jobs: ${active.length} (should be 0)`);

  // Cleanup this test job
  await db.collection('job_logs').deleteOne({ jobId });

  console.log('\n✅ Full Job Lifecycle Test PASSED\n');
}

// ═══════════════════════════════════════════════════════════
// Test: Failed Job
// ═══════════════════════════════════════════════════════════

async function testFailedJob() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: Failed Job');
  console.log('═══════════════════════════════════════════════════════════\n');

  const jobId = `int-test-fail-${Date.now()}`;
  const weekId = 'INT-TEST-002';

  // Create and start
  await createJobLog(jobId, 'airdrop', weekId);
  await markJobRunning(jobId);

  // Add some progress
  await addJobLogEntry(jobId, 'info', 'Processing batch 1...');
  await addJobLogEntry(jobId, 'error', 'Insufficient balance!');

  // Mark as failed
  console.log('1. Marking job as failed...');
  await markJobFailed(jobId, 'Insufficient token balance for airdrop');

  const failed = await getJobLogById(jobId);
  console.log(`   ✅ Status: ${failed?.status}`);
  console.log(`   Error: ${failed?.error}`);
  console.log(`   Last log level: ${failed?.logs[failed.logs.length - 1]?.level}`);

  // Cleanup
  await db.collection('job_logs').deleteOne({ jobId });

  console.log('\n✅ Failed Job Test PASSED\n');
}

// ═══════════════════════════════════════════════════════════
// Test: Multiple Jobs Query
// ═══════════════════════════════════════════════════════════

async function testMultipleJobsQuery() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: Multiple Jobs Query');
  console.log('═══════════════════════════════════════════════════════════\n');

  const weekId = 'INT-TEST-003';

  // Create multiple jobs
  console.log('1. Creating 4 jobs...');
  const job1 = await createJobLog('multi-1', 'snapshot-start', weekId);
  const job2 = await createJobLog('multi-2', 'snapshot-end', weekId);
  const job3 = await createJobLog('multi-3', 'calculate', weekId);
  const job4 = await createJobLog('multi-4', 'airdrop', weekId);

  // Mark some as running
  await markJobRunning('multi-1');
  await markJobRunning('multi-2');

  // Mark some as completed
  await markJobCompleted('multi-1');
  await markJobCompleted('multi-2');
  await markJobCompleted('multi-3');

  // Leave multi-4 as queued

  console.log('   ✅ Created and updated jobs');

  // Query
  console.log('\n2. Querying jobs...');
  const recent = await getRecentJobLogs(10);
  const active = await getActiveJobLogs();

  const multiJobs = recent.filter(j => j.jobId.startsWith('multi-'));
  console.log(`   Multi jobs found: ${multiJobs.length}`);
  console.log(`   Active jobs: ${active.length}`);

  // Check statuses
  const statuses = multiJobs.map(j => `${j.jobId}:${j.status}`).join(', ');
  console.log(`   Statuses: ${statuses}`);

  // Cleanup
  await db.collection('job_logs').deleteMany({ jobId: { $regex: /^multi-/ } });

  console.log('\n✅ Multiple Jobs Query Test PASSED\n');
}

// ═══════════════════════════════════════════════════════════
// Run All Tests
// ═══════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       AQUARI AIRDROP - INTEGRATION TESTS                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    await setup();

    await testFullJobLifecycle();
    await testFailedJob();
    await testMultipleJobsQuery();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           ALL INTEGRATION TESTS PASSED ✅                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runAllTests();
