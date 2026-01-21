// Mock modules before importing
jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    MOCK_TRANSACTIONS: true,
    MAX_GAS_PRICE: '50000000000',
    CONFIRMATIONS: 1,
    BATCH_SIZE: 500,
    PRIVATE_KEY: 'mock_private_key',
  }),
  getActiveNetwork: () => ({
    rpcUrl: 'http://localhost:8545',
    chainId: 8453,
    chainName: 'Base',
    tokenAddress: '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA',
    tokenSymbol: 'AQUARI',
    tokenDecimals: 18,
    disperseAddress: '0xD152f549545093347A162Dce210e7293f1452150',
  }),
  getRpcUrl: () => 'http://localhost:8545',
  getDisperseAddress: () => '0xD152f549545093347A162Dce210e7293f1452150',
  getTokenAddress: () => '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA',
  getTokenSymbol: () => 'AQUARI',
  getTokenDecimals: () => 18,
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import after mocks
import {
  runPreFlightChecks,
  waitForAirdropConditions,
} from '../../src/services/blockchain.service';

describe('Blockchain Pre-Flight Checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runPreFlightChecks', () => {
    it('should pass all checks in mock mode', async () => {
      const result = await runPreFlightChecks(100, BigInt(1000000000000000000000));

      expect(result.passed).toBe(true);
      expect(result.checks.ethBalance.passed).toBe(true);
      expect(result.checks.tokenBalance.passed).toBe(true);
      expect(result.checks.gasPrice.passed).toBe(true);
      expect(result.checks.allowance.passed).toBe(true);
    });

    it('should return mock values for all checks', async () => {
      const result = await runPreFlightChecks(100, BigInt(1000000000000000000000));

      expect(result.checks.ethBalance.value).toBe('10 ETH');
      expect(result.checks.tokenBalance.value).toBe('100,000 AQUARI');
      expect(result.checks.gasPrice.value).toBe('1 gwei');
    });
  });

  describe('waitForAirdropConditions', () => {
    it('should return ready immediately in mock mode', async () => {
      const result = await waitForAirdropConditions(
        100,
        BigInt(1000000000000000000000),
        1000
      );

      expect(result.ready).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });
});
