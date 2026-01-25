import { MongoClient, Db } from 'mongodb';
import { getConfig } from '../config/env';

/**
 * API Endpoint Tests - Tests the actual HTTP endpoints
 * Run with: npx ts-node src/tests/api-endpoints.test.ts
 *
 * NOTE: Server must be running on port 3000
 */

// Type for API responses
interface ApiResponse {
  success: boolean;
  error?: string;
  status?: any;
  activeJobs?: any[];
  recentJobs?: any[];
  job?: any;
  logs?: any[];
  weeks?: string[];
  [key: string]: any;
}

const config = getConfig();
const BASE_URL = 'http://localhost:3000';
let client: MongoClient;
let db: Db;

async function setup() {
  console.log('🔧 Connecting to MongoDB...');
  client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  db = client.db();
  console.log('✅ Connected\n');
}

async function cleanup() {
  // Clean test data
  await db.collection('snapshots').deleteMany({ weekId: { $regex: /^API-TEST/ } });
  await db.collection('distributions').deleteMany({ weekId: { $regex: /^API-TEST/ } });
  await db.collection('jobs').deleteMany({ weekId: { $regex: /^API-TEST/ } });
  await db.collection('job_logs').deleteMany({ weekId: { $regex: /^API-TEST/ } });
  await client.close();
  console.log('\n🔧 Cleaned up test data');
}

async function checkServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// Test: Week Status Endpoint
// ═══════════════════════════════════════════════════════════

async function testWeekStatusEndpoint() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: GET /admin/week/:weekId/status');
  console.log('═══════════════════════════════════════════════════════════\n');

  const weekId = 'API-TEST-001';

  // Test 1: Empty state
  console.log('1. Empty state (no data)...');
  const res1 = await fetch(`${BASE_URL}/admin/week/${weekId}/status`);
  const data1 = await res1.json() as ApiResponse;

  if (data1.success && data1.status.startSnapshot.status === 'pending') {
    console.log('   ✅ Returns pending for all steps');
  } else {
    console.log('   ❌ Failed:', data1);
    throw new Error('Empty state test failed');
  }

  // Test 2: With completed start snapshot
  console.log('\n2. With completed start snapshot...');
  await db.collection('snapshots').insertOne({
    weekId: `${weekId}-start`,
    status: 'completed',
    totalHolders: 100,
    totalBalance: '1000',
    timestamp: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
  });

  const res2 = await fetch(`${BASE_URL}/admin/week/${weekId}/status`);
  const data2 = await res2.json() as ApiResponse;

  if (data2.success &&
      data2.status.startSnapshot.status === 'completed' &&
      data2.status.endSnapshot.status === 'pending') {
    console.log('   ✅ Start=completed, End=pending');
  } else {
    console.log('   ❌ Failed:', data2.status);
    throw new Error('Start snapshot test failed');
  }

  // Test 3: With stale running job
  console.log('\n3. With stale running job (snapshot completed but job still "running")...');
  await db.collection('jobs').insertOne({
    weekId: `${weekId}-start`,
    type: 'snapshot',
    status: 'running',
    createdAt: new Date(),
  });

  const res3 = await fetch(`${BASE_URL}/admin/week/${weekId}/status`);
  const data3 = await res3.json() as ApiResponse;

  if (data3.success && data3.status.startSnapshot.status === 'completed') {
    console.log('   ✅ Correctly shows completed (not running)');
  } else {
    console.log('   ❌ Bug: Shows running instead of completed:', data3.status.startSnapshot);
    throw new Error('Stale job test failed');
  }

  console.log('\n✅ Week Status Endpoint Test PASSED\n');
}

// ═══════════════════════════════════════════════════════════
// Test: Jobs Status Endpoint
// ═══════════════════════════════════════════════════════════

async function testJobsStatusEndpoint() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: GET /admin/jobs/status');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Create a job log
  const jobId = `api-test-job-${Date.now()}`;
  await db.collection('job_logs').insertOne({
    jobId,
    type: 'snapshot-start',
    weekId: 'API-TEST-002',
    status: 'completed',
    logs: [
      { timestamp: new Date(), level: 'info', message: 'Started' },
      { timestamp: new Date(), level: 'success', message: 'Completed' },
    ],
    retryCount: 0,
    queuedAt: new Date(),
    startedAt: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('1. Fetching jobs status...');
  const res = await fetch(`${BASE_URL}/admin/jobs/status`);
  const data = await res.json() as ApiResponse;

  if (data.success) {
    console.log(`   ✅ Success: true`);
    console.log(`   Active jobs: ${data.activeJobs?.length || 0}`);
    console.log(`   Recent jobs: ${data.recentJobs?.length || 0}`);

    const hasOurJob = data.recentJobs?.some((j: any) => j.weekId === 'API-TEST-002');
    if (hasOurJob) {
      console.log('   ✅ Our test job found in recent jobs');
    } else {
      console.log('   ⚠️  Test job not found (might be filtered)');
    }
  } else {
    console.log('   ❌ Failed:', data);
    throw new Error('Jobs status test failed');
  }

  console.log('\n✅ Jobs Status Endpoint Test PASSED\n');
}

// ═══════════════════════════════════════════════════════════
// Test: Job Logs Endpoint
// ═══════════════════════════════════════════════════════════

async function testJobLogsEndpoint() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: GET /admin/jobs/:jobId/logs');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Create a job log with specific ID
  const jobId = `api-test-logs-${Date.now()}`;
  await db.collection('job_logs').insertOne({
    jobId,
    type: 'calculate',
    weekId: 'API-TEST-003',
    status: 'completed',
    progress: { percentage: 100 },
    logs: [
      { timestamp: new Date(), level: 'info', message: 'Calculating rewards...' },
      { timestamp: new Date(), level: 'info', message: 'Found 50 eligible holders' },
      { timestamp: new Date(), level: 'success', message: 'Calculation complete' },
    ],
    retryCount: 0,
    queuedAt: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`1. Fetching logs for job ${jobId}...`);
  const res = await fetch(`${BASE_URL}/admin/jobs/${jobId}/logs`);
  const data = await res.json() as ApiResponse;

  if (data.success && data.logs && data.logs.length === 3) {
    console.log('   ✅ Success: true');
    console.log(`   Job status: ${data.job.status}`);
    console.log(`   Logs count: ${data.logs.length}`);
    console.log(`   First log: "${data.logs[0].message}"`);
  } else {
    console.log('   ❌ Failed:', data);
    throw new Error('Job logs test failed');
  }

  console.log('\n✅ Job Logs Endpoint Test PASSED\n');
}

// ═══════════════════════════════════════════════════════════
// Test: Weeks List Endpoint
// ═══════════════════════════════════════════════════════════

async function testWeeksListEndpoint() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST: GET /admin/weeks/list');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Create some test data
  await db.collection('snapshots').insertOne({
    weekId: 'API-TEST-W01-start',
    status: 'completed',
    totalHolders: 100,
    timestamp: new Date(),
    createdAt: new Date(),
  });

  await db.collection('distributions').insertOne({
    weekId: 'API-TEST-W02',
    status: 'ready',
    createdAt: new Date(),
  });

  console.log('1. Fetching weeks list...');
  const res = await fetch(`${BASE_URL}/admin/weeks/list`);
  const data = await res.json() as ApiResponse;

  if (data.success && data.weeks) {
    console.log('   ✅ Success: true');
    console.log(`   Weeks found: ${data.weeks.length}`);
    console.log(`   Weeks: ${data.weeks.join(', ')}`);

    if (data.weeks.includes('API-TEST-W01') || data.weeks.includes('API-TEST-W02')) {
      console.log('   ✅ Test weeks found');
    }
  } else {
    console.log('   ❌ Failed:', data);
    throw new Error('Weeks list test failed');
  }

  console.log('\n✅ Weeks List Endpoint Test PASSED\n');
}

// ═══════════════════════════════════════════════════════════
// Run All Tests
// ═══════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         AQUARI AIRDROP - API ENDPOINT TESTS               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Check if server is running
    console.log('🔍 Checking if server is running...');
    const serverRunning = await checkServerRunning();
    if (!serverRunning) {
      console.log('❌ Server is not running on port 3000!');
      console.log('   Please start the server first: npm run dev\n');
      process.exit(1);
    }
    console.log('✅ Server is running\n');

    await setup();

    await testWeekStatusEndpoint();
    await testJobsStatusEndpoint();
    await testJobLogsEndpoint();
    await testWeeksListEndpoint();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              ALL API TESTS PASSED ✅                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runAllTests();
