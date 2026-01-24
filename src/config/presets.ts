// ═══════════════════════════════════════════════════════════
// Configuration Presets
// ═══════════════════════════════════════════════════════════
//
// MODE=fork       → Fast test cycles on Anvil (cron-based)
// MODE=production → Weekly cron schedule on Base mainnet
//
// ═══════════════════════════════════════════════════════════

export type Mode = 'fork' | 'production';

export interface Preset {
  // RPC
  rpcUrl: string;

  // Flags
  mockSnapshots: boolean;
  mockTransactions: boolean;

  // Schedule type
  useFastCycles: boolean;

  // Defaults
  batchSize: number;
  minBalance: string;
  maxGasPrice: string;
  confirmations: number;
}

// ═══════════════════════════════════════════════════════════
// FORK MODE - Cron-based test cycles on Anvil
// ═══════════════════════════════════════════════════════════
//
// Configure via .env:
//   START_SNAPSHOT_CRON=00 17 * * *   (5:00 PM)
//   END_SNAPSHOT_CRON=05 17 * * *     (5:05 PM)
//   CALCULATE_CRON=10 17 * * *        (5:10 PM)
//   AIRDROP_CRON=15 17 * * *          (5:15 PM)
//
// ═══════════════════════════════════════════════════════════
export const FORK_PRESET: Preset = {
  rpcUrl: 'http://localhost:8545',
  mockSnapshots: false,              // Real Moralis API data
  mockTransactions: false,           // Real transactions (on fork)

  useFastCycles: true,               // For display purposes

  batchSize: 500,                    // Max batch size for Base
  minBalance: '1000000000000000000000',  // 1000 AQUARI
  maxGasPrice: '50000000000',        // 50 gwei
  confirmations: 1,                  // Fast confirmations on fork
};

// ═══════════════════════════════════════════════════════════
// PRODUCTION MODE - Weekly cron schedule
// ═══════════════════════════════════════════════════════════
//
// Configure via .env:
//   START_SNAPSHOT_CRON=30 23 * * 0   (Sunday 23:30 UTC)
//   END_SNAPSHOT_CRON=40 23 * * 0     (Sunday 23:40 UTC)
//   CALCULATE_CRON=50 23 * * 0        (Sunday 23:50 UTC)
//   AIRDROP_CRON=00 00 * * 1          (Monday 00:00 UTC)
//
// ═══════════════════════════════════════════════════════════
export const PRODUCTION_PRESET: Preset = {
  rpcUrl: 'https://mainnet.base.org',
  mockSnapshots: false,              // Real Moralis API data
  mockTransactions: false,           // Real transactions

  useFastCycles: false,              // For display purposes

  batchSize: 500,                    // Max batch size for Base
  minBalance: '1000000000000000000000',  // 1000 AQUARI
  maxGasPrice: '50000000000',        // 50 gwei
  confirmations: 3,                  // Wait for 3 blocks
};

// ═══════════════════════════════════════════════════════════
// Get preset by mode
// ═══════════════════════════════════════════════════════════
export function getPreset(mode: Mode): Preset {
  switch (mode) {
    case 'fork':
      return FORK_PRESET;
    case 'production':
      return PRODUCTION_PRESET;
    default:
      throw new Error(`Invalid mode: ${mode}. Use 'fork' or 'production'`);
  }
}

// ═══════════════════════════════════════════════════════════
// Contract Addresses (Same for fork and production - Base mainnet)
// ═══════════════════════════════════════════════════════════
export const CONTRACTS = {
  // Default token (can be overridden with TOKEN_ADDRESS env var)
  AQUARI_TOKEN: '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA',
  DISPERSE: '0xD152f549545093347A162Dce210e7293f1452150',
  CHAIN_ID: 8453,
  CHAIN_NAME: 'Base',
  MORALIS_CHAIN: 'base',
};

// ═══════════════════════════════════════════════════════════
// Supported Tokens (for quick switching via TOKEN_ADDRESS env)
// ═══════════════════════════════════════════════════════════
export const SUPPORTED_TOKENS: Record<string, { address: string; symbol: string; decimals: number }> = {
  AQUARI: {
    address: '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA',
    symbol: 'AQUARI',
    decimals: 18,
  },
  // Add more tokens here as needed:
  // USDC: {
  //   address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  //   symbol: 'USDC',
  //   decimals: 6,
  // },
};

// ═══════════════════════════════════════════════════════════
// Test Wallet (For fork testing only - DO NOT USE IN PRODUCTION)
// ═══════════════════════════════════════════════════════════
// This is Anvil's default test account #9
// Address: 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199
export const TEST_PRIVATE_KEY = 'df57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e';
