import { getConfig } from '../config/env';
import { logger } from '../utils/logger';
import { MoralisHolderResponse } from '../models/Holder';

// ═══════════════════════════════════════════════════════════
// Moralis API Service
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://deep-index.moralis.io/api/v2.2';
const CHAIN = 'base';

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

/**
 * Fetch all token holders from Moralis API with pagination
 */
export async function fetchAllTokenHolders(
  tokenAddress: string,
  onProgress?: (count: number, cursor: string | null) => void
): Promise<FetchHoldersResult> {
  const config = getConfig();
  const holders: MoralisHolderResponse[] = [];
  let cursor = '';
  let apiCallCount = 0;
  let totalSupply: string | undefined;

  logger.info(`Fetching holders for token ${tokenAddress} on ${CHAIN}`);

  do {
    const url = new URL(`${BASE_URL}/erc20/${tokenAddress}/owners`);
    url.searchParams.set('chain', CHAIN);
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

    apiCallCount++;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Moralis API error: ${response.status} - ${errorText}`);
      throw new Error(`Moralis API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as MoralisApiResponse;

    if (!totalSupply && data.total_supply) {
      totalSupply = data.total_supply;
    }

    holders.push(...data.result);
    cursor = data.cursor;

    if (onProgress) {
      onProgress(holders.length, cursor || null);
    }

    logger.debug(`Fetched ${data.result.length} holders, total: ${holders.length}, cursor: ${cursor ? 'yes' : 'no'}`);

    // Rate limiting - small delay between requests
    if (cursor) {
      await sleep(100);
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
