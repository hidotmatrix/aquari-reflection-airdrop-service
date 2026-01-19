import { MongoClient, Db } from 'mongodb';
import { logger } from '../utils/logger';
import { getConfig } from './env';

// ═══════════════════════════════════════════════════════════
// MongoDB Connection with Error Handling
// ═══════════════════════════════════════════════════════════

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;

export interface DatabaseStatus {
  connected: boolean;
  host: string | null;
  database: string | null;
  error: string | null;
}

export async function connectDatabase(): Promise<Db> {
  if (db && isConnected) {
    return db;
  }

  const config = getConfig();
  const uri = config.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI not set in environment');
  }

  try {
    logger.info('Connecting to MongoDB...');

    client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
    });

    // Set up event handlers before connecting
    client.on('serverHeartbeatFailed', () => {
      logger.warn('MongoDB heartbeat failed');
      isConnected = false;
    });

    client.on('serverHeartbeatSucceeded', () => {
      if (!isConnected) {
        logger.info('MongoDB heartbeat restored');
        isConnected = true;
      }
    });

    client.on('close', () => {
      logger.warn('MongoDB connection closed');
      isConnected = false;
    });

    client.on('error', (err) => {
      logger.error('MongoDB error:', err);
      isConnected = false;
    });

    await client.connect();

    // Verify connection with ping
    await client.db().command({ ping: 1 });

    db = client.db();
    isConnected = true;

    logger.info(`Connected to MongoDB: ${db.databaseName}`);

    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`MongoDB connection failed: ${message}`);
    isConnected = false;
    throw new Error(`Failed to connect to MongoDB: ${message}`);
  }
}

export function getDb(): Db {
  if (!db || !isConnected) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return db;
}

export function getDatabaseStatus(): DatabaseStatus {
  if (!client || !db) {
    return {
      connected: false,
      host: null,
      database: null,
      error: 'Not initialized',
    };
  }

  return {
    connected: isConnected,
    host: client.options.hosts?.[0]?.toString() ?? null,
    database: db.databaseName,
    error: isConnected ? null : 'Connection lost',
  };
}

export async function checkDatabaseHealth(): Promise<boolean> {
  if (!client || !db) {
    return false;
  }

  try {
    await db.command({ ping: 1 });
    isConnected = true;
    return true;
  } catch {
    isConnected = false;
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    try {
      await client.close(true);
      logger.info('MongoDB connection closed gracefully');
    } catch (error) {
      logger.error('Error closing MongoDB connection:', error);
    } finally {
      client = null;
      db = null;
      isConnected = false;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// INDEX CREATION - Critical for query performance
// ═══════════════════════════════════════════════════════════

export async function createIndexes(database: Db): Promise<void> {
  try {
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

    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Error creating database indexes:', error);
    throw error;
  }
}

// For testing - set db directly
export function setDb(database: Db): void {
  db = database;
  isConnected = true;
}
