import { Request } from 'express';

// ═══════════════════════════════════════════════════════════
// Pagination Utilities
// ═══════════════════════════════════════════════════════════

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

// Default limits per endpoint type
export const LIMITS = {
  SNAPSHOTS: 20,
  HOLDERS: 100,
  DISTRIBUTIONS: 20,
  RECIPIENTS: 100,
  BATCHES: 50,
  SEARCH_HISTORY: 50,
} as const;

// Maximum allowed limit to prevent abuse
export const MAX_LIMIT = 500;

/**
 * Parse pagination params from request query
 */
export function getPagination(
  req: Request,
  defaultLimit: number = 20
): PaginationParams {
  const pageParam = req.query.page;
  const limitParam = req.query.limit;

  const page = Math.max(
    1,
    typeof pageParam === 'string' ? parseInt(pageParam, 10) || 1 : 1
  );

  const requestedLimit =
    typeof limitParam === 'string' ? parseInt(limitParam, 10) || defaultLimit : defaultLimit;

  const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Build pagination metadata
 */
export function buildPaginationMeta(
  total: number,
  params: PaginationParams
): PaginationMeta {
  const totalPages = Math.ceil(total / params.limit);

  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages,
    hasNext: params.page < totalPages,
    hasPrev: params.page > 1,
  };
}

/**
 * Build paginated response object
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  return {
    data,
    pagination: buildPaginationMeta(total, params),
  };
}
