import { ethers } from 'ethers';
import { getConfig, getRpcUrl } from '../config/env';
import { logger } from './logger';

// ═══════════════════════════════════════════════════════════
// Gas Price Oracle
// Fetches real-time gas prices and provides recommendations
// ═══════════════════════════════════════════════════════════

export interface GasPriceData {
  current: bigint;
  low: bigint;
  medium: bigint;
  high: bigint;
  baseFee: bigint | null;
  maxPriorityFee: bigint | null;
  timestamp: Date;
  isAcceptable: boolean;
  maxAllowed: bigint;
}

export interface GasEstimate {
  estimatedGas: bigint;
  estimatedCostWei: bigint;
  estimatedCostEth: string;
  gasPrice: bigint;
}

// Cache gas prices for 10 seconds to avoid excessive RPC calls
let cachedGasData: GasPriceData | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 10000;

/**
 * Get current gas prices from the network
 */
export async function getGasPrices(): Promise<GasPriceData> {
  const config = getConfig();
  const now = Date.now();

  // Return cached data if still valid
  if (cachedGasData && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedGasData;
  }

  // Mock data for mock transactions mode
  if (config.MOCK_TRANSACTIONS) {
    const mockPrice = BigInt(1000000000); // 1 gwei
    cachedGasData = {
      current: mockPrice,
      low: mockPrice,
      medium: mockPrice,
      high: mockPrice * 2n,
      baseFee: mockPrice,
      maxPriorityFee: BigInt(100000000), // 0.1 gwei
      timestamp: new Date(),
      isAcceptable: true,
      maxAllowed: BigInt(config.MAX_GAS_PRICE),
    };
    cacheTimestamp = now;
    return cachedGasData;
  }

  try {
    const provider = new ethers.JsonRpcProvider(getRpcUrl());
    const feeData = await provider.getFeeData();

    const currentGasPrice = feeData.gasPrice ?? BigInt(config.MAX_GAS_PRICE);
    const maxAllowed = BigInt(config.MAX_GAS_PRICE);

    // Calculate low/medium/high based on current price
    const low = currentGasPrice * 90n / 100n;
    const medium = currentGasPrice;
    const high = currentGasPrice * 120n / 100n;

    cachedGasData = {
      current: currentGasPrice,
      low,
      medium,
      high,
      baseFee: feeData.maxFeePerGas ?? null,
      maxPriorityFee: feeData.maxPriorityFeePerGas ?? null,
      timestamp: new Date(),
      isAcceptable: currentGasPrice <= maxAllowed,
      maxAllowed,
    };

    cacheTimestamp = now;
    logger.debug(`Gas prices fetched: ${formatGwei(currentGasPrice)} gwei (max: ${formatGwei(maxAllowed)} gwei)`);

    return cachedGasData;
  } catch (error) {
    logger.error('Failed to fetch gas prices:', error);

    // Return default if fetch fails
    const defaultPrice = BigInt(config.MAX_GAS_PRICE);
    return {
      current: defaultPrice,
      low: defaultPrice,
      medium: defaultPrice,
      high: defaultPrice,
      baseFee: null,
      maxPriorityFee: null,
      timestamp: new Date(),
      isAcceptable: true,
      maxAllowed: defaultPrice,
    };
  }
}

/**
 * Estimate gas cost for a batch airdrop
 */
export async function estimateAirdropCost(
  recipientCount: number,
  customGasPrice?: bigint
): Promise<GasEstimate> {
  const gasPrices = await getGasPrices();
  const gasPrice = customGasPrice ?? gasPrices.current;

  // Base gas + per-recipient gas (based on actual data: ~14,097 gas per recipient)
  const baseGas = 21000n;
  const perRecipientGas = 15000n; // Slightly higher than observed for safety margin
  const estimatedGas = baseGas + perRecipientGas * BigInt(recipientCount);

  const estimatedCostWei = estimatedGas * gasPrice;
  const estimatedCostEth = ethers.formatEther(estimatedCostWei);

  return {
    estimatedGas,
    estimatedCostWei,
    estimatedCostEth,
    gasPrice,
  };
}

/**
 * Check if gas price is acceptable for airdrop
 */
export async function isGasAcceptable(): Promise<{ acceptable: boolean; reason?: string; gasPrices: GasPriceData }> {
  const gasPrices = await getGasPrices();

  if (!gasPrices.isAcceptable) {
    return {
      acceptable: false,
      reason: `Current gas price (${formatGwei(gasPrices.current)} gwei) exceeds maximum allowed (${formatGwei(gasPrices.maxAllowed)} gwei)`,
      gasPrices,
    };
  }

  return { acceptable: true, gasPrices };
}

/**
 * Wait for gas price to become acceptable
 */
export async function waitForAcceptableGas(
  maxWaitMs: number = 300000, // 5 minutes default
  checkIntervalMs: number = 15000 // 15 seconds default
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { acceptable, reason, gasPrices } = await isGasAcceptable();

    if (acceptable) {
      logger.info(`Gas price acceptable: ${formatGwei(gasPrices.current)} gwei`);
      return true;
    }

    logger.warn(`${reason}. Waiting for gas to decrease...`);
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));

    // Clear cache to get fresh prices
    cachedGasData = null;
  }

  logger.error(`Gas price did not become acceptable within ${maxWaitMs / 1000} seconds`);
  return false;
}

/**
 * Format wei to gwei string
 */
export function formatGwei(wei: bigint): string {
  return (Number(wei) / 1e9).toFixed(2);
}

/**
 * Format wei to ETH string
 */
export function formatEth(wei: bigint): string {
  return ethers.formatEther(wei);
}

/**
 * Clear the gas price cache
 */
export function clearGasCache(): void {
  cachedGasData = null;
  cacheTimestamp = 0;
}
