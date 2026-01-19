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
process.env.MOCK_MODE = 'true';

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
