import { ObjectId } from 'mongodb';
import {
  createRecipient,
  calculateEligibility,
  CreateRecipientInput,
} from '../../src/models/Recipient';

// ═══════════════════════════════════════════════════════════
// Recipient Model Tests
// ═══════════════════════════════════════════════════════════

describe('Recipient Model', () => {
  describe('createRecipient', () => {
    const validInput: CreateRecipientInput = {
      distributionId: new ObjectId(),
      weekId: '2025-W04',
      address: '0xAbCdEf1234567890123456789012345678901234',
      balances: {
        start: '1000000000000000000',
        end: '1500000000000000000',
        min: '1000000000000000000',
      },
      reward: '50000000000000000',
      rewardFormatted: '0.05',
      percentage: 5.25,
    };

    it('should create recipient with correct structure', () => {
      const recipient = createRecipient(validInput);

      expect(recipient.distributionId).toBe(validInput.distributionId);
      expect(recipient.weekId).toBe('2025-W04');
      expect(recipient.address).toBe('0xabcdef1234567890123456789012345678901234');
      expect(recipient.balances).toEqual(validInput.balances);
      expect(recipient.reward).toBe('50000000000000000');
      expect(recipient.rewardFormatted).toBe('0.05');
      expect(recipient.percentage).toBe(5.25);
    });

    it('should set default status to pending', () => {
      const recipient = createRecipient(validInput);
      expect(recipient.status).toBe('pending');
    });

    it('should set retryCount to 0', () => {
      const recipient = createRecipient(validInput);
      expect(recipient.retryCount).toBe(0);
    });

    it('should lowercase address', () => {
      const recipient = createRecipient(validInput);
      expect(recipient.address).toBe('0xabcdef1234567890123456789012345678901234');
    });

    it('should set createdAt and updatedAt timestamps', () => {
      const before = new Date();
      const recipient = createRecipient(validInput);
      const after = new Date();

      expect(recipient.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(recipient.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(recipient.updatedAt.getTime()).toEqual(recipient.createdAt.getTime());
    });

    it('should not set batchId, txHash, error, or completedAt', () => {
      const recipient = createRecipient(validInput);
      expect(recipient.batchId).toBeUndefined();
      expect(recipient.batchNumber).toBeUndefined();
      expect(recipient.txHash).toBeUndefined();
      expect(recipient.error).toBeUndefined();
      expect(recipient.completedAt).toBeUndefined();
    });
  });

  describe('calculateEligibility', () => {
    const minRequired = '1000000000000000000'; // 1 token with 18 decimals

    describe('eligible holders', () => {
      it('should return eligible when both balances meet minimum', () => {
        const result = calculateEligibility(
          '2000000000000000000', // 2 tokens
          '3000000000000000000', // 3 tokens
          minRequired
        );

        expect(result.isEligible).toBe(true);
        expect(result.minBalance).toBe('2000000000000000000');
        expect(result.reason).toBeUndefined();
      });

      it('should use MIN balance (start < end)', () => {
        const result = calculateEligibility(
          '1500000000000000000', // 1.5 tokens (start)
          '5000000000000000000', // 5 tokens (end)
          minRequired
        );

        expect(result.isEligible).toBe(true);
        expect(result.minBalance).toBe('1500000000000000000');
      });

      it('should use MIN balance (end < start)', () => {
        const result = calculateEligibility(
          '5000000000000000000', // 5 tokens (start)
          '1500000000000000000', // 1.5 tokens (end)
          minRequired
        );

        expect(result.isEligible).toBe(true);
        expect(result.minBalance).toBe('1500000000000000000');
      });

      it('should return eligible when balance equals minimum exactly', () => {
        const result = calculateEligibility(
          minRequired,
          minRequired,
          minRequired
        );

        expect(result.isEligible).toBe(true);
        expect(result.minBalance).toBe(minRequired);
      });

      it('should handle very large balances', () => {
        const largeBalance = '999999999000000000000000000'; // ~1 billion tokens
        const result = calculateEligibility(largeBalance, largeBalance, minRequired);

        expect(result.isEligible).toBe(true);
        expect(result.minBalance).toBe(largeBalance);
      });
    });

    describe('ineligible holders', () => {
      it('should return ineligible when start balance is 0', () => {
        const result = calculateEligibility(
          '0',
          '2000000000000000000',
          minRequired
        );

        expect(result.isEligible).toBe(false);
        expect(result.reason).toBe('Not held at week start');
        expect(result.minBalance).toBe('0');
      });

      it('should return ineligible when end balance is 0', () => {
        const result = calculateEligibility(
          '2000000000000000000',
          '0',
          minRequired
        );

        expect(result.isEligible).toBe(false);
        expect(result.reason).toBe('Not held at week end');
        expect(result.minBalance).toBe('0');
      });

      it('should return ineligible when MIN balance below minimum', () => {
        const result = calculateEligibility(
          '500000000000000000',  // 0.5 tokens
          '2000000000000000000', // 2 tokens
          minRequired
        );

        expect(result.isEligible).toBe(false);
        expect(result.reason).toContain('Below minimum');
        expect(result.minBalance).toBe('500000000000000000');
      });

      it('should return ineligible when both balances are 0', () => {
        const result = calculateEligibility('0', '0', minRequired);

        expect(result.isEligible).toBe(false);
        expect(result.reason).toBe('Not held at week start');
      });
    });

    describe('edge cases', () => {
      it('should handle minRequired of 0', () => {
        const result = calculateEligibility(
          '1',
          '1',
          '0'
        );

        expect(result.isEligible).toBe(true);
        expect(result.minBalance).toBe('1');
      });

      it('should correctly compare equal balances', () => {
        const balance = '1234567890123456789';
        const result = calculateEligibility(balance, balance, minRequired);

        expect(result.isEligible).toBe(true);
        expect(result.minBalance).toBe(balance);
      });

      it('should handle string numbers with leading zeros', () => {
        const result = calculateEligibility(
          '01000000000000000000',
          '02000000000000000000',
          minRequired
        );

        // BigInt handles leading zeros correctly
        expect(result.isEligible).toBe(true);
      });
    });

    describe('anti-gaming protection (MIN method)', () => {
      it('should prevent gaming by buying right before end snapshot', () => {
        // User had 0.1 tokens all week, bought 100 tokens right before end
        const result = calculateEligibility(
          '100000000000000000',    // 0.1 tokens at start
          '100000000000000000000', // 100 tokens at end
          minRequired
        );

        expect(result.isEligible).toBe(false);
        expect(result.reason).toContain('Below minimum');
        // MIN balance is 0.1, below the 1 token minimum
        expect(result.minBalance).toBe('100000000000000000');
      });

      it('should prevent gaming by selling right after start snapshot', () => {
        // User sold most tokens right after start snapshot
        const result = calculateEligibility(
          '100000000000000000000', // 100 tokens at start
          '100000000000000000',    // 0.1 tokens at end
          minRequired
        );

        expect(result.isEligible).toBe(false);
        expect(result.reason).toContain('Below minimum');
        // MIN balance is 0.1, below the 1 token minimum
        expect(result.minBalance).toBe('100000000000000000');
      });

      it('should reward consistent holders', () => {
        // User held steady amount all week
        const result = calculateEligibility(
          '50000000000000000000', // 50 tokens at start
          '52000000000000000000', // 52 tokens at end (small accumulation)
          minRequired
        );

        expect(result.isEligible).toBe(true);
        expect(result.minBalance).toBe('50000000000000000000');
      });
    });
  });
});
