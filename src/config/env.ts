import 'dotenv/config';

// ═══════════════════════════════════════════════════════════
// Environment Variable Validation
// ═══════════════════════════════════════════════════════════

interface EnvConfig {
  // App
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  LOG_LEVEL: string;
  MOCK_MODE: boolean;
  MOCK_SNAPSHOTS: boolean;  // Use fake holder data (for testing without Moralis API)
  MOCK_TRANSACTIONS: boolean; // Don't send real transactions (safe for testing)

  // Database
  MONGODB_URI: string;
  REDIS_URL: string;

  // Admin
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;

  // Moralis
  MORALIS_API_KEY: string;

  // Blockchain
  BASE_RPC_URL: string;
  PRIVATE_KEY: string;
  DISPERSE_CONTRACT: string;

  // Token
  AQUARI_ADDRESS: string;
  MIN_BALANCE: string;
  REWARD_TOKEN: 'ETH' | 'USDC' | 'AQUARI';

  // Distribution
  REWARD_POOL: string;
  BATCH_SIZE: number;
  MAX_GAS_PRICE: string;
  CONFIRMATIONS: number;
}

function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value ?? '';
}

function getEnvVarAsInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for environment variable: ${key}`);
  }
  return parsed;
}

function getEnvVarAsBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export function validateEnv(): EnvConfig {
  const nodeEnv = getEnvVar('NODE_ENV', false) || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, production, or test');
  }

  const rewardToken = getEnvVar('REWARD_TOKEN', false) || 'ETH';
  if (!['ETH', 'USDC', 'AQUARI'].includes(rewardToken)) {
    throw new Error('REWARD_TOKEN must be ETH, USDC, or AQUARI');
  }

  return {
    NODE_ENV: nodeEnv as EnvConfig['NODE_ENV'],
    PORT: getEnvVarAsInt('PORT', 3000),
    LOG_LEVEL: getEnvVar('LOG_LEVEL', false) || 'info',
    MOCK_MODE: getEnvVarAsBool('MOCK_MODE', true),
    // MOCK_SNAPSHOTS defaults to MOCK_MODE value if not set
    MOCK_SNAPSHOTS: process.env.MOCK_SNAPSHOTS !== undefined
      ? getEnvVarAsBool('MOCK_SNAPSHOTS', true)
      : getEnvVarAsBool('MOCK_MODE', true),
    // MOCK_TRANSACTIONS defaults to true (safe default - never send real tx accidentally)
    MOCK_TRANSACTIONS: getEnvVarAsBool('MOCK_TRANSACTIONS', true),

    MONGODB_URI: getEnvVar('MONGODB_URI'),
    REDIS_URL: getEnvVar('REDIS_URL', false) || 'redis://localhost:6379',

    ADMIN_USERNAME: getEnvVar('ADMIN_USERNAME'),
    ADMIN_PASSWORD: getEnvVar('ADMIN_PASSWORD'),
    SESSION_SECRET: getEnvVar('SESSION_SECRET'),

    MORALIS_API_KEY: getEnvVar('MORALIS_API_KEY'),

    BASE_RPC_URL: getEnvVar('BASE_RPC_URL', false) || 'https://mainnet.base.org',
    PRIVATE_KEY: getEnvVar('PRIVATE_KEY', false),
    DISPERSE_CONTRACT: getEnvVar('DISPERSE_CONTRACT', false) || '0xD152f549545093347A162Dce210e7293f1452150',

    AQUARI_ADDRESS: getEnvVar('AQUARI_ADDRESS', false) || '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA',
    MIN_BALANCE: getEnvVar('MIN_BALANCE', false) || '1000000000000000000000', // 1000 tokens
    REWARD_TOKEN: rewardToken as EnvConfig['REWARD_TOKEN'],

    REWARD_POOL: getEnvVar('REWARD_POOL', false) || '1000000000000000000', // 1 ETH
    BATCH_SIZE: getEnvVarAsInt('BATCH_SIZE', 100),
    MAX_GAS_PRICE: getEnvVar('MAX_GAS_PRICE', false) || '50000000000', // 50 gwei
    CONFIRMATIONS: getEnvVarAsInt('CONFIRMATIONS', 3),
  };
}

// Singleton config instance
let config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!config) {
    config = validateEnv();
  }
  return config;
}

// For testing - reset config
export function resetConfig(): void {
  config = null;
}
