import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { getConfig } from './env';

// ═══════════════════════════════════════════════════════════
// Redis Connection for BullMQ with Error Handling
// ═══════════════════════════════════════════════════════════

let redisClient: Redis | null = null;
let isConnected = false;
let connectionError: string | null = null;

export interface RedisStatus {
  connected: boolean;
  host: string | null;
  port: number | null;
  error: string | null;
}

export function getRedisConnection(): Redis {
  if (redisClient && isConnected) {
    return redisClient;
  }

  const config = getConfig();

  logger.info('Connecting to Redis...');

  redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,
    retryStrategy: (times: number) => {
      if (times > 10) {
        connectionError = 'Redis connection failed after 10 retries';
        logger.error(connectionError);
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 5000);
      logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})...`);
      return delay;
    },
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      if (targetErrors.some(e => err.message.includes(e))) {
        return true; // Reconnect for these errors
      }
      return false;
    },
  });

  redisClient.on('connect', () => {
    logger.info('Redis connecting...');
  });

  redisClient.on('ready', () => {
    isConnected = true;
    connectionError = null;
    logger.info('Redis connected and ready');
  });

  redisClient.on('error', (err) => {
    connectionError = err.message;
    logger.error('Redis error:', err.message);
  });

  redisClient.on('close', () => {
    isConnected = false;
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    isConnected = false;
    logger.info('Redis reconnecting...');
  });

  redisClient.on('end', () => {
    isConnected = false;
    logger.info('Redis connection ended');
  });

  return redisClient;
}

export function getRedisStatus(): RedisStatus {
  if (!redisClient) {
    return {
      connected: false,
      host: null,
      port: null,
      error: 'Not initialized',
    };
  }

  const { host, port } = redisClient.options;

  return {
    connected: isConnected,
    host: host ?? null,
    port: port ?? null,
    error: connectionError,
  };
}

export async function checkRedisHealth(): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  try {
    const result = await redisClient.ping();
    isConnected = result === 'PONG';
    if (isConnected) {
      connectionError = null;
    }
    return isConnected;
  } catch (error) {
    isConnected = false;
    connectionError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      // Disconnect gracefully
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
      // Force disconnect if quit fails
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
      connectionError = null;
    }
  }
}

// For testing - set redis client directly
export function setRedisClient(client: Redis): void {
  redisClient = client;
  isConnected = true;
}

// Check if Redis is optional (can run without it for development)
export function isRedisRequired(): boolean {
  const config = getConfig();
  // Redis is only required for job queues, not core functionality
  return config.NODE_ENV === 'production';
}
