import { ObjectId } from 'mongodb';
import { fromMoralisResponse, MoralisHolderResponse } from '../../src/models/Holder';

// ═══════════════════════════════════════════════════════════
// Holder Model Tests
// ═══════════════════════════════════════════════════════════

describe('Holder Model', () => {
  describe('fromMoralisResponse', () => {
    const weekId = '2025-W04';
    const snapshotId = new ObjectId();

    const validMoralisResponse: MoralisHolderResponse = {
      owner_address: '0xAbCdEf1234567890123456789012345678901234',
      balance: '1000000000000000000',
      balance_formatted: '1.0',
      is_contract: false as (string | boolean),
    };

    it('should convert Moralis response to Holder', () => {
      const holder = fromMoralisResponse(validMoralisResponse, weekId, snapshotId);

      expect(holder.weekId).toBe(weekId);
      expect(holder.snapshotId).toBe(snapshotId);
      expect(holder.address).toBe('0xabcdef1234567890123456789012345678901234');
      expect(holder.balance).toBe('1000000000000000000');
      expect(holder.balanceFormatted).toBe('1.0');
      expect(holder.isContract).toBe(false);
    });

    it('should lowercase the address', () => {
      const response: MoralisHolderResponse = {
        ...validMoralisResponse,
        owner_address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      };

      const holder = fromMoralisResponse(response, weekId, snapshotId);
      expect(holder.address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });

    it('should handle contract addresses', () => {
      const response: MoralisHolderResponse = {
        ...validMoralisResponse,
        is_contract: true,
      };

      const holder = fromMoralisResponse(response, weekId, snapshotId);
      expect(holder.isContract).toBe(true);
    });

    it('should set createdAt timestamp', () => {
      const before = new Date();
      const holder = fromMoralisResponse(validMoralisResponse, weekId, snapshotId);
      const after = new Date();

      expect(holder.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(holder.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should handle label if provided', () => {
      const response: MoralisHolderResponse = {
        ...validMoralisResponse,
        owner_address_label: 'Binance Hot Wallet',
      };

      const holder = fromMoralisResponse(response, weekId, snapshotId);
      expect(holder.label).toBe('Binance Hot Wallet');
    });

    it('should handle entity if provided', () => {
      const response: MoralisHolderResponse = {
        ...validMoralisResponse,
        entity: 'Binance',
      };

      const holder = fromMoralisResponse(response, weekId, snapshotId);
      expect(holder.entity).toBe('Binance');
    });

    it('should handle zero balance', () => {
      const response: MoralisHolderResponse = {
        ...validMoralisResponse,
        balance: '0',
        balance_formatted: '0',
      };

      const holder = fromMoralisResponse(response, weekId, snapshotId);
      expect(holder.balance).toBe('0');
      expect(holder.balanceFormatted).toBe('0');
    });

    it('should handle very large balance', () => {
      const largeBalance = '999999999000000000000000000000';
      const response: MoralisHolderResponse = {
        ...validMoralisResponse,
        balance: largeBalance,
        balance_formatted: '999999999000.0',
      };

      const holder = fromMoralisResponse(response, weekId, snapshotId);
      expect(holder.balance).toBe(largeBalance);
    });

    it('should not include _id field', () => {
      const holder = fromMoralisResponse(validMoralisResponse, weekId, snapshotId);
      expect(holder._id).toBeUndefined();
    });

    it('should preserve weekId format', () => {
      const testWeekId = '2024-W52';
      const holder = fromMoralisResponse(validMoralisResponse, testWeekId, snapshotId);
      expect(holder.weekId).toBe('2024-W52');
    });

    it('should handle response without optional fields', () => {
      const minimalResponse: MoralisHolderResponse = {
        owner_address: '0x1234567890123456789012345678901234567890',
        balance: '100',
        balance_formatted: '0.0000001',
        is_contract: false as (string | boolean),
      };

      const holder = fromMoralisResponse(minimalResponse, weekId, snapshotId);

      expect(holder.label).toBeUndefined();
      expect(holder.entity).toBeUndefined();
    });

    it('should handle is_contract as string "true"', () => {
      const response: MoralisHolderResponse = {
        ...validMoralisResponse,
        is_contract: 'true',
      };

      const holder = fromMoralisResponse(response, weekId, snapshotId);
      expect(holder.isContract).toBe(true);
    });

    it('should handle is_contract as string "false"', () => {
      const response: MoralisHolderResponse = {
        ...validMoralisResponse,
        is_contract: 'false',
      };

      const holder = fromMoralisResponse(response, weekId, snapshotId);
      expect(holder.isContract).toBe(false);
    });
  });
});
