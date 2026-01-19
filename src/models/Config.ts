// ═══════════════════════════════════════════════════════════
// Config Model - Singleton document for system settings
// ═══════════════════════════════════════════════════════════

export interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
}

export interface DistributionDefaultConfig {
  minBalance: string;
  rewardToken: 'ETH' | 'USDC' | 'AQUARI';
  rewardPool: string;
}

export interface BatchConfig {
  size: number;
  gasLimit: number;
  maxGasPrice: string;
  confirmations: number;
}

export interface ContractsConfig {
  disperse: string;
}

export interface SystemConfig {
  _id: 'settings';
  token: TokenConfig;
  distribution: DistributionDefaultConfig;
  batch: BatchConfig;
  excludedAddresses: string[];
  contracts: ContractsConfig;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════
// Default configuration
// ═══════════════════════════════════════════════════════════

export const DEFAULT_EXCLUDED_ADDRESSES: string[] = [
  // Common LP and system addresses to exclude
  '0x0000000000000000000000000000000000000000', // Burn address
  '0x000000000000000000000000000000000000dead', // Dead address
];

export function createDefaultConfig(): SystemConfig {
  return {
    _id: 'settings',
    token: {
      address: '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA',
      symbol: 'AQUARI',
      decimals: 18,
      chainId: 8453, // Base mainnet
    },
    distribution: {
      minBalance: '1000000000000000000000', // 1000 tokens
      rewardToken: 'ETH',
      rewardPool: '1000000000000000000', // 1 ETH
    },
    batch: {
      size: 100,
      gasLimit: 500000,
      maxGasPrice: '50000000000', // 50 gwei
      confirmations: 3,
    },
    excludedAddresses: DEFAULT_EXCLUDED_ADDRESSES,
    contracts: {
      disperse: '0xD152f549545093347A162Dce210e7293f1452150',
    },
    updatedAt: new Date(),
  };
}
