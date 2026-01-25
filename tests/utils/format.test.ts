import {
  formatTokenAmount,
  formatEth,
  formatUsdc,
  formatPercentage,
  truncateAddress,
  normalizeAddress,
  isValidAddress,
  formatGasPrice,
  formatCompactNumber,
  formatDate,
  formatRelativeTime,
} from '../../src/utils/format';

// ═══════════════════════════════════════════════════════════
// Format Utility Tests
// ═══════════════════════════════════════════════════════════

describe('Format Utilities', () => {
  describe('formatTokenAmount', () => {
    it('should format 18 decimal tokens correctly', () => {
      expect(formatTokenAmount('1000000000000000000', 18, 4)).toBe('1');
      expect(formatTokenAmount('10000000000000000000', 18, 4)).toBe('10');
      expect(formatTokenAmount('1500000000000000000', 18, 4)).toBe('1.5');
    });

    it('should handle zero', () => {
      expect(formatTokenAmount('0', 18, 4)).toBe('0');
      expect(formatTokenAmount('', 18, 4)).toBe('0');
    });

    it('should use default decimals (18) when not specified', () => {
      expect(formatTokenAmount('1000000000000000000')).toBe('1');
    });

    it('should use default displayDecimals (4) when not specified', () => {
      expect(formatTokenAmount('1234567890000000000', 18)).toBe('1.2345');
    });

    it('should handle very small amounts', () => {
      expect(formatTokenAmount('1', 18, 18)).toBe('0.000000000000000001');
    });

    it('should handle different token decimals (6 for USDC)', () => {
      expect(formatTokenAmount('1000000', 6, 2)).toBe('1');
      expect(formatTokenAmount('1500000', 6, 2)).toBe('1.5');
    });

    it('should handle different token decimals (8 for WBTC)', () => {
      expect(formatTokenAmount('100000000', 8, 4)).toBe('1');
    });

    it('should trim trailing zeros in decimal part', () => {
      expect(formatTokenAmount('1000000000000000000', 18, 4)).toBe('1');
      expect(formatTokenAmount('1100000000000000000', 18, 4)).toBe('1.1');
    });

    it('should format with correct decimal places', () => {
      expect(formatTokenAmount('1234567890000000000', 18, 2)).toBe('1.23');
      expect(formatTokenAmount('1234567890000000000', 18, 6)).toBe('1.234567');
    });

    it('should add thousand separators', () => {
      expect(formatTokenAmount('1000000000000000000000', 18, 0)).toBe('1,000');
      expect(formatTokenAmount('1234567000000000000000000', 18, 0)).toBe('1,234,567');
    });

    it('should handle very large numbers', () => {
      const wei = '999999999000000000000000000';
      const result = formatTokenAmount(wei, 18, 2);
      expect(result).toBe('999,999,999');
    });
  });

  describe('formatEth', () => {
    it('should format ETH amounts', () => {
      expect(formatEth('1000000000000000000')).toBe('1');
      expect(formatEth('500000000000000000')).toBe('0.5');
      expect(formatEth('123456789012345678')).toBe('0.123456');
    });
  });

  describe('formatUsdc', () => {
    it('should format USDC amounts (6 decimals)', () => {
      expect(formatUsdc('1000000')).toBe('1');
      expect(formatUsdc('500000')).toBe('0.5');
      expect(formatUsdc('123456789')).toBe('123.45');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentages', () => {
      expect(formatPercentage(50)).toBe('50.00%');
      expect(formatPercentage(33.333, 1)).toBe('33.3%');
      expect(formatPercentage(0.5, 2)).toBe('0.50%');
    });
  });

  describe('truncateAddress', () => {
    const address = '0x1234567890123456789012345678901234567890';

    it('should truncate address with default params', () => {
      expect(truncateAddress(address)).toBe('0x1234...7890');
    });

    it('should truncate with custom params', () => {
      expect(truncateAddress(address, 10, 6)).toBe('0x12345678...567890');
    });

    it('should handle empty address', () => {
      expect(truncateAddress('')).toBe('');
    });

    it('should return short address unchanged', () => {
      expect(truncateAddress('0x123')).toBe('0x123');
    });
  });

  describe('normalizeAddress', () => {
    it('should lowercase address', () => {
      expect(normalizeAddress('0xAbCdEf')).toBe('0xabcdef');
    });

    it('should trim whitespace', () => {
      expect(normalizeAddress('  0xabcdef  ')).toBe('0xabcdef');
    });
  });

  describe('isValidAddress', () => {
    it('should return true for valid addresses', () => {
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')).toBe(true);
      expect(isValidAddress('0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidAddress('')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('1234567890123456789012345678901234567890')).toBe(false);
      expect(isValidAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
    });
  });

  describe('formatGasPrice', () => {
    it('should format gas price in gwei', () => {
      expect(formatGasPrice('1000000000')).toBe('1 gwei');
      expect(formatGasPrice('50000000000')).toBe('50 gwei');
    });
  });

  describe('formatCompactNumber', () => {
    it('should format numbers with K, M, B suffixes', () => {
      expect(formatCompactNumber(500)).toBe('500');
      expect(formatCompactNumber(1500)).toBe('1.50K');
      expect(formatCompactNumber(1500000)).toBe('1.50M');
      expect(formatCompactNumber(1500000000)).toBe('1.50B');
    });

    it('should handle edge cases at thresholds', () => {
      expect(formatCompactNumber(999)).toBe('999');
      expect(formatCompactNumber(1000)).toBe('1.00K');
      expect(formatCompactNumber(999999)).toBe('1000.00K');
      expect(formatCompactNumber(1000000)).toBe('1.00M');
      expect(formatCompactNumber(1000000000)).toBe('1.00B');
    });
  });

  describe('formatDate', () => {
    it('should format Date object', () => {
      const date = new Date('2025-01-15T14:30:45.000Z');
      const formatted = formatDate(date);
      expect(formatted).toBe('2025-01-15 14:30:45 UTC');
    });

    it('should format date string', () => {
      const formatted = formatDate('2025-06-20T08:15:30.000Z');
      expect(formatted).toBe('2025-06-20 08:15:30 UTC');
    });

    it('should handle timezone correctly', () => {
      const date = new Date('2025-12-31T23:59:59.999Z');
      const formatted = formatDate(date);
      expect(formatted).toBe('2025-12-31 23:59:59 UTC');
    });
  });

  describe('formatRelativeTime', () => {
    it('should return "just now" for times less than 60 seconds ago', () => {
      const now = new Date();
      const thirtySecsAgo = new Date(now.getTime() - 30 * 1000);
      expect(formatRelativeTime(thirtySecsAgo)).toBe('just now');
    });

    it('should format minutes ago', () => {
      const now = new Date();
      const oneMinAgo = new Date(now.getTime() - 60 * 1000);
      expect(formatRelativeTime(oneMinAgo)).toBe('1 minute ago');

      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinAgo)).toBe('5 minutes ago');
    });

    it('should format hours ago', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');

      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeHoursAgo)).toBe('3 hours ago');
    });

    it('should format days ago', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(oneDayAgo)).toBe('1 day ago');

      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
    });

    it('should return formatted date for times older than 7 days', () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoWeeksAgo);
      expect(result).toContain('UTC');
    });

    it('should handle date string input', () => {
      const now = new Date();
      const oneHourAgoStr = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(oneHourAgoStr)).toBe('1 hour ago');
    });
  });
});
