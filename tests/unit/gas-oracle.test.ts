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
  });
});
