import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { setDb } from '../src/config/database';
import { resetConfig } from '../src/config/env';

// ═══════════════════════════════════════════════════════════
// Test Setup
// ═══════════════════════════════════════════════════════════

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let testDb: Db;

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.ADMIN_USERNAME = 'test_admin';
process.env.ADMIN_PASSWORD = 'test_password';
process.env.SESSION_SECRET = 'test_session_secret_for_testing_only';
process.env.MORALIS_API_KEY = 'test_moralis_api_key';

// Mode config
process.env.MODE = 'fork';
process.env.MOCK_SNAPSHOTS = 'true';
process.env.MOCK_TRANSACTIONS = 'true';

// Token/batch config
process.env.MIN_BALANCE = '1000000000000000000000';
process.env.BATCH_SIZE = '100';
process.env.MAX_GAS_PRICE = '50000000000';
process.env.CONFIRMATIONS = '1';

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  testDb = mongoClient.db('aquari-test');

  // Set the test database
  setDb(testDb);
});

afterAll(async () => {
  await mongoClient.close();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections before each test
  const collections = await testDb.listCollections().toArray();
  for (const collection of collections) {
    await testDb.collection(collection.name).deleteMany({});
  }
});

afterEach(() => {
  // Reset config after each test
  resetConfig();
});

export function getTestDb(): Db {
  return testDb;
}
