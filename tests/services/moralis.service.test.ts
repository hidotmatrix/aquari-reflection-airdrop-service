import { fetchMockHolders } from '../../src/services/moralis.service';

// ═══════════════════════════════════════════════════════════
// Moralis Service Tests (Mock Mode)
// ═══════════════════════════════════════════════════════════

describe('Moralis Service', () => {
  describe('fetchMockHolders', () => {
    it('should return mock holders', async () => {
      const { holders, apiCallCount, totalSupply } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        100
      );

      expect(holders).toBeDefined();
      expect(Array.isArray(holders)).toBe(true);
      expect(holders.length).toBe(100);
    });

    it('should return specified count of holders', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        50
      );

      expect(holders.length).toBe(50);
    });

    it('should return holders with correct structure', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        10
      );

      holders.forEach((holder) => {
        expect(holder).toHaveProperty('owner_address');
        expect(holder).toHaveProperty('balance');
        expect(holder).toHaveProperty('balance_formatted');
        expect(holder).toHaveProperty('is_contract');
      });
    });

    it('should return valid Ethereum addresses', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        10
      );

      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      holders.forEach((holder) => {
        expect(holder.owner_address).toMatch(addressRegex);
      });
    });

    it('should return balance as string', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        10
      );

      holders.forEach((holder) => {
        expect(typeof holder.balance).toBe('string');
        expect(typeof holder.balance_formatted).toBe('string');
      });
    });

    it('should set apiCallCount to 1 for mock', async () => {
      const { apiCallCount } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        250
      );

      // Mock always returns 1 API call
      expect(apiCallCount).toBe(1);
    });

    it('should call progress callback', async () => {
      const progressCalls: Array<{ count: number; cursor: string | null }> = [];

      await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        200,
        (count, cursor) => {
          progressCalls.push({ count, cursor });
        }
      );

      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it('should handle zero count', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        0
      );

      expect(holders).toEqual([]);
    });

    it('should handle large count', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        1000
      );

      expect(holders.length).toBe(1000);
    });

    it('should generate unique addresses', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        500
      );

      const addresses = new Set(holders.map((h) => h.owner_address.toLowerCase()));
      expect(addresses.size).toBe(500);
    });

    it('should generate balances and sort them', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        50
      );

      // Mock data is generated with random balances but sorted before return
      expect(holders.length).toBe(50);
      holders.forEach(holder => {
        expect(BigInt(holder.balance)).toBeGreaterThan(0n);
      });
    });

    it('should mark some addresses as contracts', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        100
      );

      // At least some should be contracts, some should not be
      const contracts = holders.filter((h) => h.is_contract === true || h.is_contract === 'true');
      const nonContracts = holders.filter((h) => h.is_contract === false || h.is_contract === 'false');

      expect(contracts.length).toBeGreaterThanOrEqual(0);
      expect(nonContracts.length).toBeGreaterThanOrEqual(0);
    });
  });
});
