import { getConfig, getMoralisChain, getActiveNetwork } from '../config/env';
import { logger } from '../utils/logger';
import { MoralisHolderResponse } from '../models/Holder';

// ═══════════════════════════════════════════════════════════
// Moralis API Service
// Supports both Base Mainnet and Base Sepolia testnet
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://deep-index.moralis.io/api/v2.2';

// Rate limiting configuration
// Moralis free tier: 40,000 CU/day, ~25 req/sec burst
// Using conservative limits to avoid 429 errors
const RATE_LIMIT_DELAY_MS = 1000; // 1 second between requests (conservative)
const RATE_LIMIT_BACKOFF_BASE_MS = 3000; // Start with 3 seconds on first rate limit
const RATE_LIMIT_BACKOFF_MAX_MS = 60000; // Max 60 second backoff

/**
 * Get the Moralis chain identifier based on current AIRDROP_MODE
 * - Production: 'base' (Base Mainnet)
 * - Test: '0x14a34' (Base Sepolia - hex chain ID)
 */
function getChain(): string {
  return getMoralisChain();
}

export interface MoralisApiResponse {
  page: string;
  page_size: string;
  cursor: string;
  total_supply?: string;
  result: MoralisHolderResponse[];
}

export interface FetchHoldersResult {
  holders: MoralisHolderResponse[];
  apiCallCount: number;
  totalSupply?: string;
}

export interface FetchPageResult {
  holders: MoralisHolderResponse[];
  nextCursor: string | null;
  totalSupply?: string;
}

export interface TokenStats {
  totalHolders: number;
  totalSupply?: string;
}

/**
 * Fetch token stats (total holder count) from Moralis
 */
export async function fetchTokenStats(tokenAddress: string): Promise<TokenStats> {
  const config = getConfig();

  // Fetch just the first page to get metadata
  const url = new URL(`${BASE_URL}/erc20/${tokenAddress}/owners`);
  url.searchParams.set('chain', getChain());
  url.searchParams.set('limit', '1'); // Just need metadata, not actual holders

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': config.MORALIS_API_KEY,
    },
  });

  if (response.status === 429) {
    throw new Error('RATE_LIMITED');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Moralis API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { page_size?: string; total_supply?: string };

  // Moralis returns page info - we need to estimate total from pagination
  // Unfortunately Moralis doesn't return total count directly
  // We'll estimate based on first fetch or use a cached value
  return {
    totalHolders: data.page_size ? parseInt(data.page_size) : 0,
    totalSupply: data.total_supply,
  };
}

/**
 * Fetch a single page of token holders
 */
export async function fetchHoldersPage(
  tokenAddress: string,
  cursor?: string | null
): Promise<FetchPageResult> {
  const config = getConfig();

  const url = new URL(`${BASE_URL}/erc20/${tokenAddress}/owners`);
  url.searchParams.set('chain', getChain());
  url.searchParams.set('limit', '100');
  url.searchParams.set('order', 'DESC');
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': config.MORALIS_API_KEY,
    },
  });

  if (response.status === 429) {
    // Rate limited - throw specific error for retry handling
    throw new Error('RATE_LIMITED');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Moralis API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as MoralisApiResponse;

  return {
    holders: data.result,
    nextCursor: data.cursor || null,
    totalSupply: data.total_supply,
  };
}

/**
 * Fetch all token holders from Moralis API with pagination
 * Now with better rate limiting and resumable cursor support
 */
export async function fetchAllTokenHolders(
  tokenAddress: string,
  onProgress?: (count: number, cursor: string | null) => void,
  startCursor?: string | null
): Promise<FetchHoldersResult> {
  const holders: MoralisHolderResponse[] = [];
  let cursor = startCursor || '';
  let apiCallCount = 0;
  let totalSupply: string | undefined;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  const network = getActiveNetwork();
  logger.info(`Fetching holders for token ${tokenAddress} on ${network.chainName} (${getChain()})${startCursor ? ' (resuming)' : ''}`);

  do {
    try {
      const result = await fetchHoldersPage(tokenAddress, cursor || undefined);

      apiCallCount++;
      consecutiveErrors = 0; // Reset on success

      if (!totalSupply && result.totalSupply) {
        totalSupply = result.totalSupply;
      }

      holders.push(...result.holders);
      cursor = result.nextCursor || '';

      if (onProgress) {
        onProgress(holders.length, cursor || null);
      }

      logger.debug(`Fetched ${result.holders.length} holders, total: ${holders.length}, cursor: ${cursor ? 'yes' : 'no'}`);

      // Rate limiting - wait between requests to avoid 429 errors
      // Using conservative 1 second delay for stability
      if (cursor) {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message === 'RATE_LIMITED') {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.error(`Too many rate limit errors, stopping at ${holders.length} holders`);
          throw new Error(`Rate limited after fetching ${holders.length} holders. Cursor: ${cursor}`);
        }

        // Exponential backoff for rate limits with higher base and max
        const backoffMs = Math.min(RATE_LIMIT_BACKOFF_BASE_MS * Math.pow(2, consecutiveErrors - 1), RATE_LIMIT_BACKOFF_MAX_MS);
        logger.warn(`Rate limited by Moralis API, backing off ${backoffMs / 1000}s before retry (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
        await sleep(backoffMs);
        continue; // Retry same cursor
      }

      throw error;
    }
  } while (cursor !== '');

  logger.info(`Completed fetching ${holders.length} holders in ${apiCallCount} API calls`);

  return {
    holders,
    apiCallCount,
    totalSupply,
  };
}

/**
 * Fetch holders with retry logic
 */
export async function fetchHoldersWithRetry(
  tokenAddress: string,
  maxRetries: number = 3,
  onProgress?: (count: number, cursor: string | null) => void
): Promise<FetchHoldersResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchAllTokenHolders(tokenAddress, onProgress);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.info(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Failed to fetch holders');
}

// ═══════════════════════════════════════════════════════════
// Mock implementation for testing
// ═══════════════════════════════════════════════════════════

export function generateMockHolders(count: number): MoralisHolderResponse[] {
  const holders: MoralisHolderResponse[] = [];

  for (let i = 0; i < count; i++) {
    const balance = Math.floor(Math.random() * 100000) + 1000;
    const balanceWei = BigInt(balance) * BigInt(10 ** 18);

    holders.push({
      owner_address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      owner_address_label: i < 5 ? `Whale ${i + 1}` : undefined,
      balance: balanceWei.toString(),
      balance_formatted: balance.toString(),
      is_contract: i % 20 === 0 ? 'true' : 'false',
      entity: i < 3 ? 'Exchange' : undefined,
      usd_value: (balance * 0.01).toString(),
      percentage_relative_to_total_supply: (balance / 1000000) * 100,
    });
  }

  // Sort by balance descending (like Moralis does)
  holders.sort((a, b) => {
    const balA = BigInt(a.balance);
    const balB = BigInt(b.balance);
    return balB > balA ? 1 : balB < balA ? -1 : 0;
  });

  return holders;
}

export async function fetchMockHolders(
  _tokenAddress: string,
  holderCount: number = 100,
  onProgress?: (count: number, cursor: string | null) => void
): Promise<FetchHoldersResult> {
  logger.info(`[MOCK] Generating ${holderCount} mock holders`);

  // Simulate API delay
  await sleep(500);

  const holders = generateMockHolders(holderCount);

  if (onProgress) {
    onProgress(holders.length, null);
  }

  return {
    holders,
    apiCallCount: 1,
    totalSupply: (BigInt(holderCount) * BigInt(10000) * BigInt(10 ** 18)).toString(),
  };
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
