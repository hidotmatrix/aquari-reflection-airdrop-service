// ═══════════════════════════════════════════════════════════
// Blockchain Explorer Links
// Generate links to BaseScan for transactions, addresses, and tokens
// ═══════════════════════════════════════════════════════════

import { getConfig, isForkMode } from '../config/env';

// Base Mainnet explorer
const BASESCAN_URL = 'https://basescan.org';

// Base Sepolia testnet explorer (for testing)
const BASESCAN_SEPOLIA_URL = 'https://sepolia.basescan.org';

/**
 * Get the appropriate explorer base URL
 */
export function getExplorerBaseUrl(): string {
  const config = getConfig();

  // In fork mode, still use mainnet explorer since we're forking mainnet
  // The transactions won't exist on-chain, but addresses and tokens will be valid
  return BASESCAN_URL;
}

/**
 * Generate transaction link
 */
export function getTxLink(txHash: string): string {
  if (!txHash || txHash.startsWith('0x000000')) {
    // Mock transaction
    return '#';
  }
  return `${getExplorerBaseUrl()}/tx/${txHash}`;
}

/**
 * Generate address link
 */
export function getAddressLink(address: string): string {
  if (!address) return '#';
  return `${getExplorerBaseUrl()}/address/${address}`;
}

/**
 * Generate token link
 */
export function getTokenLink(tokenAddress: string): string {
  if (!tokenAddress) return '#';
  return `${getExplorerBaseUrl()}/token/${tokenAddress}`;
}

/**
 * Generate token holder link
 */
export function getTokenHolderLink(tokenAddress: string, holderAddress: string): string {
  if (!tokenAddress || !holderAddress) return '#';
  return `${getExplorerBaseUrl()}/token/${tokenAddress}?a=${holderAddress}`;
}

/**
 * Generate block link
 */
export function getBlockLink(blockNumber: number): string {
  if (!blockNumber) return '#';
  return `${getExplorerBaseUrl()}/block/${blockNumber}`;
}

/**
 * Check if a transaction hash is a mock hash
 */
export function isMockTxHash(txHash: string): boolean {
  if (!txHash) return true;
  return txHash.startsWith('0x000000') || txHash === '0x' + 'mock'.repeat(16);
}

/**
 * Format a transaction hash for display (truncated)
 */
export function formatTxHash(txHash: string): string {
  if (!txHash) return '—';
  if (isMockTxHash(txHash)) return 'Mock TX';
  return `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
}

/**
 * Format an address for display (truncated)
 */
export function formatAddress(address: string): string {
  if (!address) return '—';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Explorer link helpers for EJS templates
 */
export const explorerHelpers = {
  getTxLink,
  getAddressLink,
  getTokenLink,
  getTokenHolderLink,
  getBlockLink,
  isMockTxHash,
  formatTxHash,
  formatAddress,
  baseUrl: BASESCAN_URL,
};
