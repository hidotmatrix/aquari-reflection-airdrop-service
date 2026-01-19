// ═══════════════════════════════════════════════════════════
// Formatting Utilities
// ═══════════════════════════════════════════════════════════

/**
 * Format wei to human-readable token amount
 * @param wei - Amount in wei (string for big numbers)
 * @param decimals - Token decimals (default: 18)
 * @param displayDecimals - Decimals to show (default: 4)
 */
export function formatTokenAmount(
  wei: string,
  decimals: number = 18,
  displayDecimals: number = 4
): string {
  if (!wei || wei === '0') return '0';

  // Handle big numbers as strings
  const weiStr = wei.toString().padStart(decimals + 1, '0');
  const integerPart = weiStr.slice(0, -decimals) || '0';
  const decimalPart = weiStr.slice(-decimals);

  // Format integer part with commas
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Trim decimal part to desired precision
  const trimmedDecimal = decimalPart.slice(0, displayDecimals).replace(/0+$/, '');

  if (trimmedDecimal) {
    return `${formattedInteger}.${trimmedDecimal}`;
  }
  return formattedInteger;
}

/**
 * Format ETH amount (18 decimals)
 */
export function formatEth(wei: string, displayDecimals: number = 6): string {
  return formatTokenAmount(wei, 18, displayDecimals);
}

/**
 * Format USDC amount (6 decimals)
 */
export function formatUsdc(wei: string, displayDecimals: number = 2): string {
  return formatTokenAmount(wei, 6, displayDecimals);
}

/**
 * Format percentage with specified decimals
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Truncate Ethereum address for display
 * @param address - Full address
 * @param startChars - Characters to show at start (default: 6)
 * @param endChars - Characters to show at end (default: 4)
 */
export function truncateAddress(
  address: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (!address) return '';
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return formatDate(d);
}

/**
 * Normalize Ethereum address to lowercase
 */
export function normalizeAddress(address: string): string {
  return address.toLowerCase().trim();
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Format gas price in gwei
 */
export function formatGasPrice(weiStr: string): string {
  const wei = BigInt(weiStr);
  const gwei = wei / BigInt(1e9);
  return `${gwei.toString()} gwei`;
}

/**
 * Format large number with suffix (K, M, B)
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toString();
}
