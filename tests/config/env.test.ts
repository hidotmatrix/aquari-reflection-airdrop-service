import {
  validateEnv,
  getConfig,
  resetConfig,
  getActiveNetwork,
  isProductionMode,
  isForkMode,
  useFastCycles,
  getModeName,
  getMoralisChain,
  getTokenAddress,
  getDisperseAddress,
  getRpcUrl,
} from '../../src/config/env';

// ═══════════════════════════════════════════════════════════
// Environment Config Tests
// ═══════════════════════════════════════════════════════════

describe('Environment Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe('validateEnv', () => {
    it('should validate and return config with required vars set', () => {
      const config = validateEnv();

      expect(config).toBeDefined();
      expect(config.NODE_ENV).toBeDefined();
      expect(config.MONGODB_URI).toBeDefined();
      expect(config.ADMIN_USERNAME).toBeDefined();
      expect(config.ADMIN_PASSWORD).toBeDefined();
      expect(config.SESSION_SECRET).toBeDefined();
      expect(config.MORALIS_API_KEY).toBeDefined();
    });

    it('should throw error for missing required MONGODB_URI', () => {
      const savedUri = process.env.MONGODB_URI;
      delete process.env.MONGODB_URI;

      expect(() => validateEnv()).toThrow('Missing required environment variable: MONGODB_URI');

      process.env.MONGODB_URI = savedUri;
    });

    it('should throw error for invalid NODE_ENV', () => {
      process.env.NODE_ENV = 'invalid';

      expect(() => validateEnv()).toThrow('NODE_ENV must be development, production, or test');
    });

    it('should throw error for invalid MODE', () => {
      process.env.MODE = 'invalid';

      expect(() => validateEnv()).toThrow('MODE must be fork or production');
    });

    it('should use default values for optional vars', () => {
      delete process.env.PORT;
      delete process.env.LOG_LEVEL;

      const config = validateEnv();

      expect(config.PORT).toBe(3000);
      expect(config.LOG_LEVEL).toBe('debug');
    });
  });

  describe('getConfig', () => {
    it('should return singleton config instance', () => {
      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    it('should return new instance after resetConfig', () => {
      const config1 = getConfig();
      resetConfig();
      const config2 = getConfig();

      expect(config1).not.toBe(config2);
    });
  });

  describe('MODE', () => {
    it('should default to fork mode', () => {
      delete process.env.MODE;
      resetConfig();

      const config = getConfig();
      expect(config.MODE).toBe('fork');
    });

    it('should accept production mode', () => {
      process.env.MODE = 'production';
      process.env.PRIVATE_KEY = 'test_private_key_for_production';
      resetConfig();

      const config = getConfig();
      expect(config.MODE).toBe('production');
    });

    it('should require PRIVATE_KEY for production mode', () => {
      process.env.MODE = 'production';
      delete process.env.PRIVATE_KEY;
      resetConfig();

      expect(() => getConfig()).toThrow('PRIVATE_KEY is required for production mode');
    });
  });

  describe('SCHEDULE config', () => {
    it('should use fast cycles for fork mode', () => {
      process.env.MODE = 'fork';
      resetConfig();

      const config = getConfig();
      expect(config.SCHEDULE.useFastCycles).toBe(true);
      expect(config.SCHEDULE.snapshotIntervalMinutes).toBe(10);
      expect(config.SCHEDULE.calculateDelayMinutes).toBe(5);
      expect(config.SCHEDULE.airdropDelayMinutes).toBe(5);
    });

    it('should use weekly cron for production mode', () => {
      process.env.MODE = 'production';
      process.env.PRIVATE_KEY = 'test_key';
      resetConfig();

      const config = getConfig();
      expect(config.SCHEDULE.useFastCycles).toBe(false);
    });

    it('should allow override of timing from env', () => {
      process.env.MODE = 'fork';
      process.env.SNAPSHOT_INTERVAL = '15';
      process.env.CALCULATE_DELAY = '3';
      process.env.AIRDROP_DELAY = '2';
      process.env.AUTO_APPROVE = 'true';
      resetConfig();

      const config = getConfig();
      expect(config.SCHEDULE.snapshotIntervalMinutes).toBe(15);
      expect(config.SCHEDULE.calculateDelayMinutes).toBe(3);
      expect(config.SCHEDULE.airdropDelayMinutes).toBe(2);
      expect(config.SCHEDULE.autoApprove).toBe(true);
    });
  });

  describe('NETWORK config', () => {
    it('should use fork RPC URL for fork mode', () => {
      delete process.env.RPC_URL;
      process.env.MODE = 'fork';
      resetConfig();

      const config = getConfig();
      expect(config.NETWORK.rpcUrl).toBe('http://localhost:8545');
    });

    it('should use production RPC for production mode', () => {
      delete process.env.RPC_URL;
      process.env.MODE = 'production';
      process.env.PRIVATE_KEY = 'test_key';
      resetConfig();

      const config = getConfig();
      expect(config.NETWORK.rpcUrl).toBe('https://mainnet.base.org');
    });

    it('should use custom RPC_URL when provided', () => {
      process.env.RPC_URL = 'http://custom:8545';
      resetConfig();

      const config = getConfig();
      expect(config.NETWORK.rpcUrl).toBe('http://custom:8545');
    });

    it('should have correct chain ID for Base mainnet', () => {
      const config = getConfig();
      expect(config.NETWORK.chainId).toBe(8453);
    });

    it('should have default AQUARI token address', () => {
      const config = getConfig();
      expect(config.NETWORK.tokenAddress).toBe('0x7F0E9971D3320521Fc88F863E173a4cddBB051bA');
    });

    it('should have default Disperse contract address', () => {
      const config = getConfig();
      expect(config.NETWORK.disperseAddress).toBe('0xD152f549545093347A162Dce210e7293f1452150');
    });
  });

  describe('Helper Functions', () => {
    describe('isForkMode', () => {
      it('should return true when MODE is fork', () => {
        process.env.MODE = 'fork';
        resetConfig();

        expect(isForkMode()).toBe(true);
      });

      it('should return false when MODE is production', () => {
        process.env.MODE = 'production';
        process.env.PRIVATE_KEY = 'test_key';
        resetConfig();

        expect(isForkMode()).toBe(false);
      });
    });

    describe('isProductionMode', () => {
      it('should return true when MODE is production', () => {
        process.env.MODE = 'production';
        process.env.PRIVATE_KEY = 'test_key';
        resetConfig();

        expect(isProductionMode()).toBe(true);
      });
    });

    describe('useFastCycles', () => {
      it('should return true for fork mode', () => {
        process.env.MODE = 'fork';
        resetConfig();

        expect(useFastCycles()).toBe(true);
      });

      it('should return false for production mode', () => {
        process.env.MODE = 'production';
        process.env.PRIVATE_KEY = 'test_key';
        resetConfig();

        expect(useFastCycles()).toBe(false);
      });
    });

    describe('getModeName', () => {
      it('should return MOCK mode name when both mocks are true', () => {
        process.env.MOCK_SNAPSHOTS = 'true';
        process.env.MOCK_TRANSACTIONS = 'true';
        resetConfig();

        expect(getModeName()).toBe('MOCK (No API/TX)');
      });

      it('should return SIMULATED mode name when only tx is mocked', () => {
        process.env.MOCK_SNAPSHOTS = 'false';
        process.env.MOCK_TRANSACTIONS = 'true';
        resetConfig();

        expect(getModeName()).toBe('SIMULATED (Real API, Mock TX)');
      });

      it('should return FORK mode name for fork mode', () => {
        process.env.MOCK_SNAPSHOTS = 'false';
        process.env.MOCK_TRANSACTIONS = 'false';
        process.env.MODE = 'fork';
        resetConfig();

        expect(getModeName()).toBe('FORK (Fast Cycles)');
      });

      it('should return PRODUCTION for production mode', () => {
        process.env.MOCK_SNAPSHOTS = 'false';
        process.env.MOCK_TRANSACTIONS = 'false';
        process.env.MODE = 'production';
        process.env.PRIVATE_KEY = 'test_key';
        resetConfig();

        expect(getModeName()).toBe('PRODUCTION (Weekly)');
      });
    });

    describe('getMoralisChain', () => {
      it('should always return base', () => {
        expect(getMoralisChain()).toBe('base');
      });
    });

    describe('getTokenAddress', () => {
      it('should return default AQUARI address', () => {
        expect(getTokenAddress()).toBe('0x7F0E9971D3320521Fc88F863E173a4cddBB051bA');
      });
    });

    describe('getDisperseAddress', () => {
      it('should return default Disperse address', () => {
        expect(getDisperseAddress()).toBe('0xD152f549545093347A162Dce210e7293f1452150');
      });
    });

    describe('getRpcUrl', () => {
      it('should return fork RPC for fork mode', () => {
        delete process.env.RPC_URL;
        process.env.MODE = 'fork';
        resetConfig();

        expect(getRpcUrl()).toBe('http://localhost:8545');
      });
    });
  });

  describe('Batch/Gas Config', () => {
    it('should use preset batch size', () => {
      delete process.env.BATCH_SIZE;
      process.env.MODE = 'fork';
      resetConfig();

      const config = getConfig();
      expect(config.BATCH_SIZE).toBe(500);
    });

    it('should parse custom batch size', () => {
      process.env.BATCH_SIZE = '200';
      resetConfig();

      const config = getConfig();
      expect(config.BATCH_SIZE).toBe(200);
    });

    it('should have default max gas price of 50 gwei', () => {
      delete process.env.MAX_GAS_PRICE;
      resetConfig();

      const config = getConfig();
      expect(config.MAX_GAS_PRICE).toBe('50000000000');
    });

    it('should use preset confirmations for fork mode', () => {
      delete process.env.CONFIRMATIONS;
      process.env.MODE = 'fork';
      resetConfig();

      const config = getConfig();
      expect(config.CONFIRMATIONS).toBe(1);
    });

    it('should use preset confirmations for production mode', () => {
      delete process.env.CONFIRMATIONS;
      process.env.MODE = 'production';
      process.env.PRIVATE_KEY = 'test_key';
      resetConfig();

      const config = getConfig();
      expect(config.CONFIRMATIONS).toBe(3);
    });
  });
});
