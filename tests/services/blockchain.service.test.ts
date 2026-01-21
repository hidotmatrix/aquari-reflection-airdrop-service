import {
  initializeBlockchain,
  isBlockchainReady,
  getCurrentGasPrice,
  isGasPriceAcceptable,
  getWalletEthBalance,
  getWalletTokenBalance,
  getDisperseAllowance,
  executeBatchAirdrop,
  estimateBatchGas,
  getTransactionStatus,
  getWalletAddress,
  getBlockchainInfo,
  resetMockCounter,
} from '../../src/services/blockchain.service';
import { resetConfig } from '../../src/config/env';
import { BatchRecipient } from '../../src/models';

// ═══════════════════════════════════════════════════════════
// Blockchain Service Tests (Mock Mode)
// ═══════════════════════════════════════════════════════════

describe('Blockchain Service', () => {
  beforeEach(() => {
    resetConfig();
    resetMockCounter();
  });

  afterEach(() => {
    resetConfig();
  });

  describe('initializeBlockchain', () => {
    it('should initialize in mock mode without errors', () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      expect(() => initializeBlockchain()).not.toThrow();
    });
  });

  describe('isBlockchainReady', () => {
    it('should return true in mock mode', () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      expect(isBlockchainReady()).toBe(true);
    });
  });

  describe('getCurrentGasPrice', () => {
    it('should return max gas price in mock mode', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      process.env.MAX_GAS_PRICE = '50000000000';
      resetConfig();

      initializeBlockchain();

      const gasPrice = await getCurrentGasPrice();

      expect(gasPrice).toBe(BigInt('50000000000'));
    });
  });

  describe('isGasPriceAcceptable', () => {
    it('should always return true in mock mode', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const acceptable = await isGasPriceAcceptable();

      expect(acceptable).toBe(true);
    });
  });

  describe('getWalletEthBalance', () => {
    it('should return mock ETH balance', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const balance = await getWalletEthBalance();

      expect(balance).toBe('10000000000000000000'); // 10 ETH
    });
  });

  describe('getWalletTokenBalance', () => {
    it('should return mock token balance', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const balance = await getWalletTokenBalance();

      expect(balance).toBe('100000000000000000000000'); // 100,000 AQUARI
    });
  });

  describe('getDisperseAllowance', () => {
    it('should return max uint256 in mock mode', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const allowance = await getDisperseAllowance();

      expect(allowance).toBe('115792089237316195423570985008687907853269984665640564039457584007913129639935');
    });
  });

  describe('executeBatchAirdrop', () => {
    it('should execute mock airdrop successfully', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const recipients: BatchRecipient[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
      ];

      const result = await executeBatchAirdrop(recipients);

      expect(result).toBeDefined();
      expect(result.txHash).toMatch(/^0x/);
      expect(result.gasUsed).toBeDefined();
      expect(result.gasPrice).toBeDefined();
      expect(result.blockNumber).toBeDefined();
      expect(result.confirmedAt).toBeInstanceOf(Date);
    });

    it('should generate unique tx hashes for each batch', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();
      resetMockCounter();

      initializeBlockchain();

      const recipients: BatchRecipient[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
      ];

      const result1 = await executeBatchAirdrop(recipients);
      const result2 = await executeBatchAirdrop(recipients);

      expect(result1.txHash).not.toBe(result2.txHash);
    });

    it('should calculate gas used based on recipient count', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const recipients: BatchRecipient[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
        { address: '0x3333333333333333333333333333333333333333', amount: '3000000000000000000' },
      ];

      const result = await executeBatchAirdrop(recipients);

      // Mock uses 25000 gas per recipient
      expect(result.gasUsed).toBe((3 * 25000).toString());
    });
  });

  describe('estimateBatchGas', () => {
    it('should estimate gas for batch', async () => {
      const gas = await estimateBatchGas(100);

      // 21000 base + 65000 per recipient
      expect(gas).toBe(21000n + 65000n * 100n);
    });

    it('should scale linearly with recipient count', async () => {
      const gas50 = await estimateBatchGas(50);
      const gas100 = await estimateBatchGas(100);
      const gas200 = await estimateBatchGas(200);

      expect(gas100 - gas50).toBe(65000n * 50n);
      expect(gas200 - gas100).toBe(65000n * 100n);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return confirmed for any tx in mock mode', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const status = await getTransactionStatus('0x1234567890abcdef');

      expect(status).toBe('confirmed');
    });
  });

  describe('getWalletAddress', () => {
    it('should return null in mock mode without private key', () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      delete process.env.PRIVATE_KEY;
      resetConfig();

      initializeBlockchain();

      const address = getWalletAddress();

      expect(address).toBeNull();
    });
  });

  describe('getBlockchainInfo', () => {
    it('should return blockchain info in mock mode', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const info = await getBlockchainInfo();

      expect(info).toBeDefined();
      expect(info.network).toBe('Base');
      expect(info.ethBalance).toBe('10000000000000000000');
      expect(info.tokenBalance).toBe('100000000000000000000000');
      expect(info.isReady).toBe(true);
    });
  });

  describe('resetMockCounter', () => {
    it('should reset mock transaction counter', async () => {
      process.env.MOCK_TRANSACTIONS = 'true';
      resetConfig();

      initializeBlockchain();

      const recipients: BatchRecipient[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
      ];

      // Execute a few mock transactions
      await executeBatchAirdrop(recipients);
      await executeBatchAirdrop(recipients);

      // Reset counter
      resetMockCounter();

      // Next tx should be #1 again
      const result = await executeBatchAirdrop(recipients);
      expect(result.txHash).toBe('0x' + '0'.repeat(63) + '1');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Batch Recipient Validation Tests
// ═══════════════════════════════════════════════════════════

describe('Batch Recipients', () => {
  describe('BatchRecipient structure', () => {
    it('should have address and amount fields', () => {
      const recipient: BatchRecipient = {
        address: '0x1234567890123456789012345678901234567890',
        amount: '1000000000000000000',
      };

      expect(recipient.address).toBeDefined();
      expect(recipient.amount).toBeDefined();
    });

    it('should accept valid Ethereum addresses', () => {
      const validAddresses = [
        '0x0000000000000000000000000000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA',
      ];

      validAddresses.forEach((address) => {
        const recipient: BatchRecipient = { address, amount: '1' };
        expect(recipient.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      });
    });

    it('should accept wei amounts as strings', () => {
      const amounts = [
        '1',
        '1000000000000000000', // 1 token (18 decimals)
        '115792089237316195423570985008687907853269984665640564039457584007913129639935', // max uint256
      ];

      amounts.forEach((amount) => {
        const recipient: BatchRecipient = {
          address: '0x0000000000000000000000000000000000000000',
          amount,
        };
        expect(() => BigInt(recipient.amount)).not.toThrow();
      });
    });
  });
});
