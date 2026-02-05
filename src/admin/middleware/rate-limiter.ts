import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

// ═══════════════════════════════════════════════════════════
// Rate Limiter Middleware
// Protects against brute-force attacks on login and sensitive endpoints
// ═══════════════════════════════════════════════════════════

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  blockedUntil: number | null;
}

interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxAttempts: number;     // Max attempts within window
  blockDurationMs: number; // How long to block after exceeding
  keyGenerator: (req: Request) => string;
}

// In-memory store for rate limiting
// For production with multiple instances, use Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

// Default configurations
const DEFAULT_LOGIN_CONFIG: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,       // 15 minutes
  maxAttempts: 5,                  // 5 attempts
  blockDurationMs: 15 * 60 * 1000, // Block for 15 minutes
  keyGenerator: (req) => {
    // Use IP + username combination
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const username = req.body?.username || 'unknown';
    return `login:${ip}:${username}`;
  },
};

const DEFAULT_API_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,           // 1 minute
  maxAttempts: 60,                // 60 requests per minute
  blockDurationMs: 60 * 1000,     // Block for 1 minute
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `api:${ip}`;
  },
};

/**
 * Clean up expired entries periodically
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  // Use the maximum window size to ensure we don't delete entries too early
  const maxWindow = Math.max(DEFAULT_LOGIN_CONFIG.windowMs, DEFAULT_API_CONFIG.windowMs);

  for (const [key, entry] of rateLimitStore.entries()) {
    // Check if entry is past its window and not blocked
    const isExpired = entry.firstAttempt + maxWindow < now;
    const isUnblocked = !entry.blockedUntil || entry.blockedUntil < now;

    // Only delete if both expired AND unblocked (or was never blocked)
    if (isExpired && isUnblocked) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Create a rate limiter middleware
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}): (req: Request, res: Response, next: NextFunction) => void {
  const finalConfig = { ...DEFAULT_LOGIN_CONFIG, ...config };

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = finalConfig.keyGenerator(req);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Check if currently blocked
    if (entry?.blockedUntil && entry.blockedUntil > now) {
      const remainingSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
      logger.warn(`Rate limit exceeded for ${key}. Blocked for ${remainingSeconds}s more.`);

      res.status(429).json({
        error: 'Too many attempts',
        message: `Too many failed attempts. Please try again in ${remainingSeconds} seconds.`,
        retryAfter: remainingSeconds,
      });
      return;
    }

    // Reset if window has passed
    if (!entry || now - entry.firstAttempt > finalConfig.windowMs) {
      entry = {
        attempts: 0,
        firstAttempt: now,
        blockedUntil: null,
      };
    }

    // Increment attempts
    entry.attempts++;
    rateLimitStore.set(key, entry);

    // Check if exceeded
    if (entry.attempts > finalConfig.maxAttempts) {
      entry.blockedUntil = now + finalConfig.blockDurationMs;
      rateLimitStore.set(key, entry);

      const blockSeconds = Math.ceil(finalConfig.blockDurationMs / 1000);
      logger.warn(`Rate limit triggered for ${key}. Blocking for ${blockSeconds}s.`);

      res.status(429).json({
        error: 'Too many attempts',
        message: `Too many failed attempts. Please try again in ${blockSeconds} seconds.`,
        retryAfter: blockSeconds,
      });
      return;
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', finalConfig.maxAttempts.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, finalConfig.maxAttempts - entry.attempts).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil((entry.firstAttempt + finalConfig.windowMs) / 1000).toString());

    next();
  };
}

/**
 * Login rate limiter - stricter limits for login attempts
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  maxAttempts: 5,                  // 5 attempts
  blockDurationMs: 15 * 60 * 1000, // Block for 15 minutes
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const username = req.body?.username || 'unknown';
    return `login:${ip}:${username}`;
  },
});

/**
 * API rate limiter - more lenient for general API calls
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,           // 1 minute
  maxAttempts: 100,               // 100 requests per minute
  blockDurationMs: 60 * 1000,     // Block for 1 minute
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `api:${ip}`;
  },
});

/**
 * Reset rate limit for a specific key (e.g., after successful login)
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Reset rate limit by IP and username
 */
export function resetLoginRateLimit(ip: string, username: string): void {
  const key = `login:${ip}:${username}`;
  rateLimitStore.delete(key);
}

/**
 * Get rate limit status for a key
 */
export function getRateLimitStatus(key: string): { isBlocked: boolean; remainingAttempts: number; blockedUntil: Date | null } {
  const entry = rateLimitStore.get(key);
  const now = Date.now();

  if (!entry) {
    return { isBlocked: false, remainingAttempts: DEFAULT_LOGIN_CONFIG.maxAttempts, blockedUntil: null };
  }

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return {
      isBlocked: true,
      remainingAttempts: 0,
      blockedUntil: new Date(entry.blockedUntil),
    };
  }

  return {
    isBlocked: false,
    remainingAttempts: Math.max(0, DEFAULT_LOGIN_CONFIG.maxAttempts - entry.attempts),
    blockedUntil: null,
  };
}

/**
 * Get all rate limit entries (for admin/debugging)
 */
export function getAllRateLimitEntries(): Array<{ key: string; entry: RateLimitEntry }> {
  const entries: Array<{ key: string; entry: RateLimitEntry }> = [];
  for (const [key, entry] of rateLimitStore.entries()) {
    entries.push({ key, entry });
  }
  return entries;
}

/**
 * Clear all rate limit entries
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}
