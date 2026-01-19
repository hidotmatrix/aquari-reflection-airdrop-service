import { Request } from 'express';
import {
  getPagination,
  buildPaginationMeta,
  paginatedResponse,
  LIMITS,
  MAX_LIMIT,
} from '../../src/utils/pagination';

// ═══════════════════════════════════════════════════════════
// Pagination Utility Tests
// ═══════════════════════════════════════════════════════════

describe('Pagination Utilities', () => {
  describe('getPagination', () => {
    const createMockRequest = (query: Record<string, string>): Request => ({
      query,
    } as unknown as Request);

    it('should return default values when no params provided', () => {
      const req = createMockRequest({});
      const result = getPagination(req, 20);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.skip).toBe(0);
    });

    it('should parse page and limit from query', () => {
      const req = createMockRequest({ page: '2', limit: '50' });
      const result = getPagination(req, 20);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.skip).toBe(50);
    });

    it('should enforce minimum page of 1', () => {
      const req = createMockRequest({ page: '0' });
      const result = getPagination(req, 20);
      expect(result.page).toBe(1);

      const reqNegative = createMockRequest({ page: '-5' });
      const resultNegative = getPagination(reqNegative, 20);
      expect(resultNegative.page).toBe(1);
    });

    it('should enforce maximum limit', () => {
      const req = createMockRequest({ limit: '1000' });
      const result = getPagination(req, 20);
      expect(result.limit).toBe(MAX_LIMIT);
    });

    it('should use default limit when limit is 0', () => {
      const req = createMockRequest({ limit: '0' });
      const result = getPagination(req, 20);
      // parseInt('0') returns 0 which is falsy, so defaults to defaultLimit
      expect(result.limit).toBe(20);
    });

    it('should enforce minimum limit of 1 for negative values', () => {
      const req = createMockRequest({ limit: '-5' });
      const result = getPagination(req, 20);
      expect(result.limit).toBe(1);
    });

    it('should calculate correct skip value', () => {
      const req = createMockRequest({ page: '3', limit: '25' });
      const result = getPagination(req, 20);
      expect(result.skip).toBe(50); // (3-1) * 25
    });

    it('should handle invalid page string', () => {
      const req = createMockRequest({ page: 'invalid' });
      const result = getPagination(req, 20);
      expect(result.page).toBe(1);
    });

    it('should handle invalid limit string', () => {
      const req = createMockRequest({ limit: 'invalid' });
      const result = getPagination(req, 20);
      expect(result.limit).toBe(20);
    });
  });

  describe('buildPaginationMeta', () => {
    it('should build correct metadata', () => {
      const result = buildPaginationMeta(100, { page: 2, limit: 20, skip: 20 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(100);
      expect(result.totalPages).toBe(5);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(true);
    });

    it('should return hasNext=false on last page', () => {
      const result = buildPaginationMeta(100, { page: 5, limit: 20, skip: 80 });
      expect(result.hasNext).toBe(false);
    });

    it('should return hasPrev=false on first page', () => {
      const result = buildPaginationMeta(100, { page: 1, limit: 20, skip: 0 });
      expect(result.hasPrev).toBe(false);
    });

    it('should handle empty results', () => {
      const result = buildPaginationMeta(0, { page: 1, limit: 20, skip: 0 });
      expect(result.totalPages).toBe(0);
      expect(result.hasNext).toBe(false);
    });

    it('should calculate correct totalPages', () => {
      expect(buildPaginationMeta(100, { page: 1, limit: 20, skip: 0 }).totalPages).toBe(5);
      expect(buildPaginationMeta(101, { page: 1, limit: 20, skip: 0 }).totalPages).toBe(6);
      expect(buildPaginationMeta(99, { page: 1, limit: 20, skip: 0 }).totalPages).toBe(5);
    });
  });

  describe('paginatedResponse', () => {
    it('should return correctly structured response', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const result = paginatedResponse(data, 100, { page: 1, limit: 20, skip: 0 });

      expect(result.data).toEqual(data);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.total).toBe(100);
    });
  });

  describe('LIMITS constants', () => {
    it('should have correct default limits', () => {
      expect(LIMITS.SNAPSHOTS).toBe(20);
      expect(LIMITS.HOLDERS).toBe(100);
      expect(LIMITS.DISTRIBUTIONS).toBe(20);
      expect(LIMITS.RECIPIENTS).toBe(100);
      expect(LIMITS.BATCHES).toBe(50);
      expect(LIMITS.SEARCH_HISTORY).toBe(50);
    });
  });

  describe('MAX_LIMIT', () => {
    it('should be 500', () => {
      expect(MAX_LIMIT).toBe(500);
    });
  });
});
