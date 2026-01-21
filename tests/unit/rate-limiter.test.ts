import { Request, Response } from 'express';
import {
  createRateLimiter,
  resetRateLimit,
  resetLoginRateLimit,
  getRateLimitStatus,
  clearAllRateLimits,
} from '../../src/admin/middleware/rate-limiter';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Rate Limiter', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: jest.Mock;

  beforeEach(() => {
    clearAllRateLimits();

    mockReq = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
      body: { username: 'testuser' },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };

    nextFn = jest.fn();
  });

  describe('createRateLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = createRateLimiter({
        maxAttempts: 5,
        windowMs: 60000,
        blockDurationMs: 60000,
        keyGenerator: () => 'test-key',
      });

      // First 5 requests should pass
      for (let i = 0; i < 5; i++) {
        limiter(mockReq as Request, mockRes as Response, nextFn);
        expect(nextFn).toHaveBeenCalledTimes(i + 1);
      }
    });

    it('should block after exceeding limit', () => {
      const limiter = createRateLimiter({
        maxAttempts: 3,
        windowMs: 60000,
        blockDurationMs: 60000,
        keyGenerator: () => 'test-key-block',
      });

      // First 3 requests pass
      for (let i = 0; i < 3; i++) {
        limiter(mockReq as Request, mockRes as Response, nextFn);
      }

      expect(nextFn).toHaveBeenCalledTimes(3);

      // 4th request should be blocked
      limiter(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many attempts',
        })
      );
    });

    it('should set rate limit headers', () => {
      const limiter = createRateLimiter({
        maxAttempts: 10,
        windowMs: 60000,
        blockDurationMs: 60000,
        keyGenerator: () => 'test-key-headers',
      });

      limiter(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for a key', () => {
      const testKey = 'test-reset-key';
      const limiter = createRateLimiter({
        maxAttempts: 2,
        windowMs: 60000,
        blockDurationMs: 60000,
        keyGenerator: () => testKey,
      });

      // Use up attempts
      limiter(mockReq as Request, mockRes as Response, nextFn);
      limiter(mockReq as Request, mockRes as Response, nextFn);

      // Should be blocked now
      limiter(mockReq as Request, mockRes as Response, nextFn);
      expect(mockRes.status).toHaveBeenCalledWith(429);

      // Reset
      resetRateLimit(testKey);

      // Create fresh mocks
      const newNextFn = jest.fn();
      const newRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;

      // Should work again
      limiter(mockReq as Request, newRes, newNextFn);
      expect(newNextFn).toHaveBeenCalled();
    });
  });

  describe('resetLoginRateLimit', () => {
    it('should reset rate limit for IP and username combination', () => {
      const status1 = getRateLimitStatus('login:127.0.0.1:testuser');
      expect(status1.isBlocked).toBe(false);

      resetLoginRateLimit('127.0.0.1', 'testuser');

      const status2 = getRateLimitStatus('login:127.0.0.1:testuser');
      expect(status2.isBlocked).toBe(false);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return correct status for new key', () => {
      const status = getRateLimitStatus('new-key');

      expect(status.isBlocked).toBe(false);
      expect(status.remainingAttempts).toBeGreaterThan(0);
      expect(status.blockedUntil).toBeNull();
    });

    it('should return blocked status when blocked', () => {
      const testKey = 'test-status-key';
      const limiter = createRateLimiter({
        maxAttempts: 1,
        windowMs: 60000,
        blockDurationMs: 60000,
        keyGenerator: () => testKey,
      });

      // Use up attempts and get blocked
      limiter(mockReq as Request, mockRes as Response, nextFn);
      limiter(mockReq as Request, mockRes as Response, nextFn);

      const status = getRateLimitStatus(testKey);
      expect(status.isBlocked).toBe(true);
      expect(status.remainingAttempts).toBe(0);
      expect(status.blockedUntil).toBeInstanceOf(Date);
    });
  });

  describe('clearAllRateLimits', () => {
    it('should clear all rate limit entries', () => {
      const limiter = createRateLimiter({
        maxAttempts: 1,
        windowMs: 60000,
        blockDurationMs: 60000,
        keyGenerator: () => 'test-clear-key',
      });

      // Get blocked
      limiter(mockReq as Request, mockRes as Response, nextFn);
      limiter(mockReq as Request, mockRes as Response, nextFn);

      // Clear all
      clearAllRateLimits();

      // Should work again
      const newNextFn = jest.fn();
      const newRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as unknown as Response;

      limiter(mockReq as Request, newRes, newNextFn);
      expect(newNextFn).toHaveBeenCalled();
    });
  });
});
