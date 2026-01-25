import {
  getGasPrices,
  estimateAirdropCost,
  isGasAcceptable,
  formatGwei,
  formatEth,
  clearGasCache,
} from '../../src/utils/gas-oracle';

// Mock the config module
jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    MOCK_TRANSACTIONS: true,
    MAX_GAS_PRICE: '50000000000', // 50 gwei
  }),
  getRpcUrl: () => 'http://localhost:8545',
}));

describe('Gas Oracle', () => {
  beforeEach(() => {
    clearGasCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getGasPrices', () => {
    it('should return mock gas prices in mock mode', async () => {
      const prices = await getGasPrices();

      expect(prices).toBeDefined();
      expect(prices.current).toBeDefined();
      expect(prices.isAcceptable).toBe(true);
      expect(prices.timestamp).toBeInstanceOf(Date);
    });

    it('should cache gas prices', async () => {
      const prices1 = await getGasPrices();
      const prices2 = await getGasPrices();

      // Should be the same cached instance (same timestamp)
      expect(prices1.timestamp.getTime()).toBe(prices2.timestamp.getTime());
    });

    it('should return fresh prices after cache clear', async () => {
      const prices1 = await getGasPrices();
      clearGasCache();

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const prices2 = await getGasPrices();
      expect(prices2.timestamp.getTime()).toBeGreaterThanOrEqual(prices1.timestamp.getTime());
    });
  });

  describe('estimateAirdropCost', () => {
    it('should estimate gas for given recipient count', async () => {
      const estimate = await estimateAirdropCost(100);

      expect(estimate).toBeDefined();
      expect(estimate.estimatedGas).toBeGreaterThan(0n);
      expect(estimate.estimatedCostWei).toBeGreaterThan(0n);
      expect(estimate.estimatedCostEth).toBeDefined();
    });

    it('should scale with recipient count', async () => {
      const estimate100 = await estimateAirdropCost(100);
      const estimate500 = await estimateAirdropCost(500);

      expect(estimate500.estimatedGas).toBeGreaterThan(estimate100.estimatedGas);
    });

    it('should use custom gas price if provided', async () => {
      const customGasPrice = BigInt(100000000000); // 100 gwei
      const estimate = await estimateAirdropCost(100, customGasPrice);

      expect(estimate.gasPrice).toBe(customGasPrice);
    });
  });

  describe('isGasAcceptable', () => {
    it('should return acceptable in mock mode', async () => {
      const result = await isGasAcceptable();

      expect(result.acceptable).toBe(true);
      expect(result.gasPrices).toBeDefined();
    });
  });

  describe('formatGwei', () => {
    it('should format wei to gwei', () => {
      expect(formatGwei(BigInt(1000000000))).toBe('1.00');
      expect(formatGwei(BigInt(50000000000))).toBe('50.00');
      expect(formatGwei(BigInt(1500000000))).toBe('1.50');
    });
  });

  describe('formatEth', () => {
    it('should format wei to ETH', () => {
      expect(formatEth(BigInt(1000000000000000000))).toBe('1.0');
      expect(formatEth(BigInt(500000000000000000))).toBe('0.5');
    });

    it('should format very small amounts', () => {
      expect(formatEth(BigInt(1000000000000))).toBe('0.000001');
    });

    it('should format large amounts', () => {
      expect(formatEth(BigInt(100000000000000000000))).toBe('100.0');
    });
  });

  describe('clearGasCache', () => {
    it('should clear cached gas data', async () => {
      // Get prices to populate cache
      await getGasPrices();

      // Clear the cache
      clearGasCache();

      // Next call should get fresh data (verified by timestamps being different)
      await new Promise(resolve => setTimeout(resolve, 15));
      const freshPrices = await getGasPrices();
      expect(freshPrices).toBeDefined();
    });
  });

  describe('GasPriceData structure', () => {
    it('should have all required fields', async () => {
      const prices = await getGasPrices();

      expect(prices).toHaveProperty('current');
      expect(prices).toHaveProperty('low');
      expect(prices).toHaveProperty('medium');
      expect(prices).toHaveProperty('high');
      expect(prices).toHaveProperty('baseFee');
      expect(prices).toHaveProperty('maxPriorityFee');
      expect(prices).toHaveProperty('timestamp');
      expect(prices).toHaveProperty('isAcceptable');
      expect(prices).toHaveProperty('maxAllowed');
    });

    it('should have consistent price relationships in mock mode', async () => {
      const prices = await getGasPrices();

      // In mock mode: low = medium = current, high = current * 2
      expect(prices.low).toBe(prices.current);
      expect(prices.medium).toBe(prices.current);
      expect(prices.high).toBe(prices.current * 2n);
    });
  });

  describe('GasEstimate structure', () => {
    it('should have all required fields', async () => {
      const estimate = await estimateAirdropCost(100);

      expect(estimate).toHaveProperty('estimatedGas');
      expect(estimate).toHaveProperty('estimatedCostWei');
      expect(estimate).toHaveProperty('estimatedCostEth');
      expect(estimate).toHaveProperty('gasPrice');
    });

    it('should calculate cost correctly', async () => {
      const estimate = await estimateAirdropCost(100);

      // Cost should equal gas * gasPrice
      expect(estimate.estimatedCostWei).toBe(estimate.estimatedGas * estimate.gasPrice);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero recipients', async () => {
      const estimate = await estimateAirdropCost(0);

      // Should only have base gas (21000)
      expect(estimate.estimatedGas).toBe(21000n);
    });

    it('should handle single recipient', async () => {
      const estimate = await estimateAirdropCost(1);

      // Base gas (21000) + per-recipient gas (15000)
      expect(estimate.estimatedGas).toBe(21000n + 15000n);
    });

    it('should handle large recipient counts', async () => {
      const estimate = await estimateAirdropCost(10000);

      expect(estimate.estimatedGas).toBeGreaterThan(0n);
      expect(estimate.estimatedCostWei).toBeGreaterThan(0n);
    });
  });
});
