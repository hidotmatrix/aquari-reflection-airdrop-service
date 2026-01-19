import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { getConfig } from './env';

// ═══════════════════════════════════════════════════════════
// Redis Connection for BullMQ
// ═══════════════════════════════════════════════════════════

let redisClient: Redis | null = null;

export function getRedisConnection(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const config = getConfig();

  redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error('Redis connection failed after 10 retries');
        return null; // Stop retrying
      }
      return Math.min(times * 100, 3000);
    },
  });

  redisClient.on('connect', () => {
    logger.info('Connected to Redis');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error:', err);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

// For testing - set redis client directly
export function setRedisClient(client: Redis): void {
  redisClient = client;
}
