// ═══════════════════════════════════════════════════════════
// Configuration Presets
// ═══════════════════════════════════════════════════════════
//
// MODE=fork       → Fast test cycles (~20 min) on Anvil
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

  // Fast cycle timing (fork mode only)
  snapshotIntervalMinutes: number;  // Time between START and END snapshots
  calculateDelayMinutes: number;    // Time after END snapshot to calculate
  airdropDelayMinutes: number;      // Time after calculation to airdrop
  autoApprove: boolean;             // Auto-approve airdrop or wait for manual

  // Defaults
  batchSize: number;
  minBalance: string;
  maxGasPrice: string;
  confirmations: number;
}

// ═══════════════════════════════════════════════════════════
// FORK MODE - Fast test cycles on Anvil
// ═══════════════════════════════════════════════════════════
//
// Timeline (~20 minutes total):
//   0:00  - Snapshot START (immediately on server start)
//   10:00 - Snapshot END
//   15:00 - Calculate rewards
//   20:00 - Airdrop (auto or manual)
//
// ═══════════════════════════════════════════════════════════
export const FORK_PRESET: Preset = {
  rpcUrl: 'http://localhost:8545',
  mockSnapshots: false,              // Real Moralis API data
  mockTransactions: false,           // Real transactions (on fork)

  useFastCycles: true,               // Use interval-based scheduling
  snapshotIntervalMinutes: 10,       // 10 min between START and END
  calculateDelayMinutes: 5,          // 5 min after END snapshot
  airdropDelayMinutes: 5,            // 5 min after calculation
  autoApprove: false,                // Manual approval (set true for full auto)

  batchSize: 500,                    // Max batch size for Base
  minBalance: '1000000000000000000000',  // 1000 AQUARI
  maxGasPrice: '50000000000',        // 50 gwei
  confirmations: 1,                  // Fast confirmations on fork
};

// ═══════════════════════════════════════════════════════════
// PRODUCTION MODE - Weekly cron schedule
// ═══════════════════════════════════════════════════════════
//
// Weekly Schedule (UTC):
//   Sunday  23:59 - Snapshot
//   Monday  00:30 - Calculate rewards
//   Manual        - Airdrop approval
//
// ═══════════════════════════════════════════════════════════
export const PRODUCTION_PRESET: Preset = {
  rpcUrl: 'https://mainnet.base.org',
  mockSnapshots: false,              // Real Moralis API data
  mockTransactions: false,           // Real transactions

  useFastCycles: false,              // Use weekly cron schedule
  snapshotIntervalMinutes: 0,        // Not used in production
  calculateDelayMinutes: 0,          // Not used in production
  airdropDelayMinutes: 0,            // Not used in production
  autoApprove: false,                // Always manual in production

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
