import {
  getTxLink,
  getAddressLink,
  getTokenLink,
  getTokenHolderLink,
  getBlockLink,
  isMockTxHash,
  formatTxHash,
  formatAddress,
  getExplorerBaseUrl,
  explorerHelpers,
} from '../../src/utils/explorer';

// Mock the config
jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    MODE: 'fork',
  }),
  isForkMode: () => true,
}));

describe('Explorer Utils', () => {
  describe('getExplorerBaseUrl', () => {
    it('should return BaseScan URL', () => {
      const url = getExplorerBaseUrl();
      expect(url).toBe('https://basescan.org');
    });
  });

  describe('getTxLink', () => {
    it('should generate valid transaction link', () => {
      const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const link = getTxLink(txHash);

      expect(link).toBe(`https://basescan.org/tx/${txHash}`);
    });

    it('should return # for mock transactions', () => {
      const mockHash = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const link = getTxLink(mockHash);

      expect(link).toBe('#');
    });

    it('should return # for empty hash', () => {
      expect(getTxLink('')).toBe('#');
    });
  });

  describe('getAddressLink', () => {
    it('should generate valid address link', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const link = getAddressLink(address);

      expect(link).toBe(`https://basescan.org/address/${address}`);
    });

    it('should return # for empty address', () => {
      expect(getAddressLink('')).toBe('#');
    });
  });

  describe('getTokenLink', () => {
    it('should generate valid token link', () => {
      const tokenAddress = '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA';
      const link = getTokenLink(tokenAddress);

      expect(link).toBe(`https://basescan.org/token/${tokenAddress}`);
    });
  });

  describe('getBlockLink', () => {
    it('should generate valid block link', () => {
      const blockNumber = 12345678;
      const link = getBlockLink(blockNumber);

      expect(link).toBe(`https://basescan.org/block/${blockNumber}`);
    });

    it('should return # for invalid block number', () => {
      expect(getBlockLink(0)).toBe('#');
    });
  });

  describe('isMockTxHash', () => {
    it('should identify mock transaction hashes', () => {
      expect(isMockTxHash('0x0000000000000000000000000000000000000000000000000000000000000001')).toBe(true);
      expect(isMockTxHash('0x' + 'mock'.repeat(16))).toBe(true);
    });

    it('should not flag real transaction hashes', () => {
      const realHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(isMockTxHash(realHash)).toBe(false);
    });

    it('should return true for empty hash', () => {
      expect(isMockTxHash('')).toBe(true);
    });
  });

  describe('formatTxHash', () => {
    it('should truncate long transaction hash', () => {
      const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const formatted = formatTxHash(txHash);

      expect(formatted).toBe('0x12345678...90abcdef');
      expect(formatted.length).toBeLessThan(txHash.length);
    });

    it('should return "Mock TX" for mock hashes', () => {
      expect(formatTxHash('0x0000000000000000000000000000000000000000000000000000000000000001')).toBe('Mock TX');
    });

    it('should return "—" for empty hash', () => {
      expect(formatTxHash('')).toBe('—');
    });
  });

  describe('formatAddress', () => {
    it('should truncate address', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const formatted = formatAddress(address);

      expect(formatted).toBe('0x1234...5678');
    });

    it('should return "—" for empty address', () => {
      expect(formatAddress('')).toBe('—');
    });
  });

  describe('getTokenHolderLink', () => {
    it('should generate valid token holder link', () => {
      const tokenAddress = '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA';
      const holderAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const link = getTokenHolderLink(tokenAddress, holderAddress);

      expect(link).toBe(`https://basescan.org/token/${tokenAddress}?a=${holderAddress}`);
    });

    it('should return # for empty token address', () => {
      expect(getTokenHolderLink('', '0x1234567890abcdef1234567890abcdef12345678')).toBe('#');
    });

    it('should return # for empty holder address', () => {
      expect(getTokenHolderLink('0x7F0E9971D3320521Fc88F863E173a4cddBB051bA', '')).toBe('#');
    });

    it('should return # for both empty', () => {
      expect(getTokenHolderLink('', '')).toBe('#');
    });
  });

  describe('explorerHelpers', () => {
    it('should export all helper functions', () => {
      expect(explorerHelpers.getTxLink).toBe(getTxLink);
      expect(explorerHelpers.getAddressLink).toBe(getAddressLink);
      expect(explorerHelpers.getTokenLink).toBe(getTokenLink);
      expect(explorerHelpers.getTokenHolderLink).toBe(getTokenHolderLink);
      expect(explorerHelpers.getBlockLink).toBe(getBlockLink);
      expect(explorerHelpers.isMockTxHash).toBe(isMockTxHash);
      expect(explorerHelpers.formatTxHash).toBe(formatTxHash);
      expect(explorerHelpers.formatAddress).toBe(formatAddress);
    });

    it('should have baseUrl property', () => {
      expect(explorerHelpers.baseUrl).toBe('https://basescan.org');
    });
  });

  describe('getTokenLink edge cases', () => {
    it('should return # for empty token address', () => {
      expect(getTokenLink('')).toBe('#');
    });
  });
});
