import { MongoClient, Db } from 'mongodb';
import { logger } from '../utils/logger';
import { getConfig } from './env';

// ═══════════════════════════════════════════════════════════
// MongoDB Connection
// ═══════════════════════════════════════════════════════════

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  const config = getConfig();
  const uri = config.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI not set in environment');
  }

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  await client.connect();
  db = client.db();

  logger.info('Connected to MongoDB');

  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed');
  }
}

// ═══════════════════════════════════════════════════════════
// INDEX CREATION - Critical for query performance
// ═══════════════════════════════════════════════════════════

export async function createIndexes(database: Db): Promise<void> {
  // SNAPSHOTS (metadata only)
  await database.collection('snapshots').createIndexes([
    { key: { weekId: 1 }, unique: true },
    { key: { timestamp: -1 } },
    { key: { status: 1 } }
  ]);

  // HOLDERS (normalized - one doc per holder per week)
  await database.collection('holders').createIndexes([
    { key: { weekId: 1, address: 1 }, unique: true },
    { key: { address: 1 } },
    { key: { address: 1, weekId: -1 } },
    { key: { weekId: 1, balance: -1 } },
    { key: { snapshotId: 1 } }
  ]);

  // DISTRIBUTIONS
  await database.collection('distributions').createIndexes([
    { key: { weekId: 1 }, unique: true },
    { key: { createdAt: -1 } },
    { key: { status: 1, createdAt: -1 } }
  ]);

  // RECIPIENTS (critical for wallet search)
  await database.collection('recipients').createIndexes([
    { key: { address: 1 } },
    { key: { address: 1, weekId: -1 } },
    { key: { distributionId: 1, address: 1 }, unique: true },
    { key: { distributionId: 1, reward: -1 } },
    { key: { weekId: 1, status: 1 } },
    { key: { status: 1 } },
    { key: { txHash: 1 }, sparse: true }
  ]);

  // BATCHES
  await database.collection('batches').createIndexes([
    { key: { distributionId: 1, batchNumber: 1 }, unique: true },
    { key: { distributionId: 1, status: 1 } },
    { key: { weekId: 1, status: 1 } },
    { key: { status: 1, createdAt: -1 } },
    { key: { 'execution.txHash': 1 }, sparse: true }
  ]);

  logger.info('Database indexes created');
}

// For testing - set db directly
export function setDb(database: Db): void {
  db = database;
}
