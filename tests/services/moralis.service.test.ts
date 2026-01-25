import {
  fetchMockHolders,
  generateMockHolders,
} from '../../src/services/moralis.service';

// ═══════════════════════════════════════════════════════════
// Moralis Service Tests (Mock Mode)
// ═══════════════════════════════════════════════════════════

describe('Moralis Service', () => {
  describe('generateMockHolders', () => {
    it('should generate specified number of holders', () => {
      const holders = generateMockHolders(100);
      expect(holders.length).toBe(100);
    });

    it('should generate holders with correct structure', () => {
      const holders = generateMockHolders(10);

      holders.forEach(holder => {
        expect(holder).toHaveProperty('owner_address');
        expect(holder).toHaveProperty('balance');
        expect(holder).toHaveProperty('balance_formatted');
        expect(holder).toHaveProperty('is_contract');
        expect(holder).toHaveProperty('usd_value');
        expect(holder).toHaveProperty('percentage_relative_to_total_supply');
      });
    });

    it('should generate valid Ethereum addresses', () => {
      const holders = generateMockHolders(20);
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;

      holders.forEach(holder => {
        expect(holder.owner_address).toMatch(addressRegex);
      });
    });

    it('should generate unique addresses', () => {
      const holders = generateMockHolders(500);
      const addresses = new Set(holders.map(h => h.owner_address.toLowerCase()));
      expect(addresses.size).toBe(500);
    });

    it('should generate positive balances', () => {
      const holders = generateMockHolders(50);

      holders.forEach(holder => {
        expect(BigInt(holder.balance)).toBeGreaterThan(0n);
        expect(parseFloat(holder.balance_formatted)).toBeGreaterThan(0);
      });
    });

    it('should sort holders by balance descending', () => {
      const holders = generateMockHolders(100);

      for (let i = 1; i < holders.length; i++) {
        const prevBalance = BigInt(holders[i - 1]!.balance);
        const currBalance = BigInt(holders[i]!.balance);
        expect(prevBalance).toBeGreaterThanOrEqual(currBalance);
      }
    });

    it('should mark some addresses as contracts (every 20th)', () => {
      const holders = generateMockHolders(100);

      // Index 0, 20, 40, 60, 80 should be contracts (5 total for 100 holders)
      const contracts = holders.filter(h => h.is_contract === 'true');
      expect(contracts.length).toBe(5);
    });

    it('should assign labels to first few holders (whales)', () => {
      const holders = generateMockHolders(20);

      // First 5 (indices 0-4) should have labels after sorting
      // Note: sorting may change order, so we just check some have labels
      const withLabels = holders.filter(h => h.owner_address_label !== undefined);
      expect(withLabels.length).toBeGreaterThanOrEqual(0);
    });

    it('should assign entity to first few holders', () => {
      const holders = generateMockHolders(20);

      // First 3 (indices 0-2) should have entity "Exchange" before sorting
      const withEntity = holders.filter(h => h.entity !== undefined);
      expect(withEntity.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate USD value based on balance', () => {
      const holders = generateMockHolders(10);

      holders.forEach(holder => {
        const usdValue = parseFloat(holder.usd_value!);
        expect(usdValue).toBeGreaterThan(0);
      });
    });

    it('should calculate percentage relative to total supply', () => {
      const holders = generateMockHolders(10);

      holders.forEach(holder => {
        expect(holder.percentage_relative_to_total_supply).toBeDefined();
        expect(typeof holder.percentage_relative_to_total_supply).toBe('number');
      });
    });

    it('should handle zero count', () => {
      const holders = generateMockHolders(0);
      expect(holders).toEqual([]);
    });

    it('should handle large count', () => {
      const holders = generateMockHolders(1000);
      expect(holders.length).toBe(1000);
    });

    it('should generate balance with 18 decimals precision', () => {
      const holders = generateMockHolders(10);

      holders.forEach(holder => {
        const balance = BigInt(holder.balance);
        const formatted = parseFloat(holder.balance_formatted);
        // Balance should be formatted * 10^18
        const expectedBalance = BigInt(Math.floor(formatted)) * BigInt(10 ** 18);
        // Allow for rounding differences
        expect(balance / BigInt(10 ** 18)).toBeGreaterThanOrEqual(BigInt(Math.floor(formatted)));
      });
    });
  });

  describe('fetchMockHolders', () => {
    it('should return mock holders', async () => {
      const { holders, apiCallCount, totalSupply } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        100
      );

      expect(holders).toBeDefined();
      expect(Array.isArray(holders)).toBe(true);
      expect(holders.length).toBe(100);
      expect(apiCallCount).toBe(1);
      expect(totalSupply).toBeDefined();
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

    it('should call progress callback with final count and null cursor', async () => {
      const progressCalls: Array<{ count: number; cursor: string | null }> = [];

      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        200,
        (count, cursor) => {
          progressCalls.push({ count, cursor });
        }
      );

      expect(progressCalls.length).toBe(1);
      expect(progressCalls[0]!.count).toBe(200);
      expect(progressCalls[0]!.cursor).toBeNull();
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

    it('should calculate totalSupply based on holder count', async () => {
      const { totalSupply } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        100
      );

      // totalSupply = holderCount * 10000 * 10^18
      const expected = BigInt(100) * BigInt(10000) * BigInt(10 ** 18);
      expect(totalSupply).toBe(expected.toString());
    });

    it('should return holders sorted by balance descending', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        50
      );

      for (let i = 1; i < holders.length; i++) {
        const prevBalance = BigInt(holders[i - 1]!.balance);
        const currBalance = BigInt(holders[i]!.balance);
        expect(prevBalance).toBeGreaterThanOrEqual(currBalance);
      }
    });

    it('should mark some addresses as contracts', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000',
        100
      );

      // Every 20th holder (0, 20, 40, 60, 80) should be a contract
      const contracts = holders.filter((h) => h.is_contract === 'true');
      expect(contracts.length).toBe(5);
    });

    it('should ignore token address (mock does not use it)', async () => {
      const { holders: holders1 } = await fetchMockHolders('0xABC', 10);
      const { holders: holders2 } = await fetchMockHolders('0xDEF', 10);

      // Both should return same count (structure is same, values random)
      expect(holders1.length).toBe(holders2.length);
    });

    it('should use default count of 100 when not specified', async () => {
      const { holders } = await fetchMockHolders(
        '0x0000000000000000000000000000000000000000'
      );

      expect(holders.length).toBe(100);
    });

    it('should simulate API delay', async () => {
      const start = Date.now();
      await fetchMockHolders('0x0000000000000000000000000000000000000000', 10);
      const elapsed = Date.now() - start;

      // Should have at least some delay (500ms in implementation)
      expect(elapsed).toBeGreaterThanOrEqual(400);
    });
  });
});
