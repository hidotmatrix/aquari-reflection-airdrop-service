import 'dotenv/config';
import { getPreset, CONTRACTS, TEST_PRIVATE_KEY, Mode, Preset } from './presets';

// ═══════════════════════════════════════════════════════════
// Environment Configuration
// ═══════════════════════════════════════════════════════════
//
// MODE=fork       → Fast test cycles (~20 min) on Anvil
// MODE=production → Weekly cron schedule on Base mainnet
//
// ═══════════════════════════════════════════════════════════

interface NetworkConfig {
  rpcUrl: string;
  chainId: number;
  chainName: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  disperseAddress: string;
  moralisChain: string;
}

interface ScheduleConfig {
  useFastCycles: boolean;
  // Cron-based scheduling - 3 separate cron jobs
  snapshotCron: string | null;        // Step 1: Take snapshot (uses previous as baseline)
  calculateCron: string | null;       // Step 2: Calculate rewards (if 2+ snapshots exist)
  airdropCron: string | null;         // Step 3: Auto-airdrop (100% wallet balance)
}

interface EnvConfig {
  // App
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  LOG_LEVEL: string;

  // Mode
  MODE: Mode;

  // Flags
  MOCK_SNAPSHOTS: boolean;
  MOCK_TRANSACTIONS: boolean;

  // Schedule
  SCHEDULE: ScheduleConfig;

  // Network
  NETWORK: NetworkConfig;

  // Database
  MONGODB_URI: string;
  REDIS_URL: string;

  // Admin
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;

  // APIs
  MORALIS_API_KEY: string;

  // Blockchain
  PRIVATE_KEY: string;

  // Token
  MIN_BALANCE: string;
  REWARD_TOKEN: string;

  // Distribution
  BATCH_SIZE: number;
  MAX_GAS_PRICE: string;
  CONFIRMATIONS: number;
}

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

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
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

function getEnvVarAsBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

// ═══════════════════════════════════════════════════════════
// Validate and Build Config
// ═══════════════════════════════════════════════════════════

export function validateEnv(): EnvConfig {
  // Get mode from .env (defaults to 'fork' for safety)
  const mode = (getEnvVar('MODE', false) || 'fork') as Mode;
  if (!['fork', 'production'].includes(mode)) {
    throw new Error('MODE must be fork or production');
  }

  // Get preset for this mode
  const preset: Preset = getPreset(mode);

  // Node environment
  const nodeEnv = getEnvVar('NODE_ENV', false) || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, production, or test');
  }

  // Private key: Use from .env, or test key for fork mode
  let privateKey = getEnvVar('PRIVATE_KEY', false);
  if (!privateKey && mode === 'fork') {
    privateKey = TEST_PRIVATE_KEY;
    console.log('Using test private key for fork mode');
  }
  if (!privateKey && mode === 'production') {
    throw new Error('PRIVATE_KEY is required for production mode');
  }

  // Network config (TOKEN_ADDRESS can be overridden via env)
  const tokenAddress = getEnvVar('TOKEN_ADDRESS', false) || CONTRACTS.AQUARI_TOKEN;
  const tokenSymbol = getEnvVar('TOKEN_SYMBOL', false) || 'AQUARI';
  const tokenDecimals = getEnvVarAsInt('TOKEN_DECIMALS', 18);

  const network: NetworkConfig = {
    // Accept both BASE_RPC_URL (preferred) and RPC_URL (legacy)
    rpcUrl: getEnvVar('BASE_RPC_URL', false) || getEnvVar('RPC_URL', false) || preset.rpcUrl,
    chainId: CONTRACTS.CHAIN_ID,
    chainName: CONTRACTS.CHAIN_NAME,
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    disperseAddress: CONTRACTS.DISPERSE,
    moralisChain: CONTRACTS.MORALIS_CHAIN,
  };

  // Schedule config - 3 separate cron jobs:
  //   SNAPSHOT_CRON → CALCULATE_CRON → AIRDROP_CRON
  const snapshotCron = getEnvVar('SNAPSHOT_CRON', false) || null;
  const calculateCron = getEnvVar('CALCULATE_CRON', false) || null;
  const airdropCron = getEnvVar('AIRDROP_CRON', false) || null;

  const schedule: ScheduleConfig = {
    useFastCycles: preset.useFastCycles,
    snapshotCron,
    calculateCron,
    airdropCron,
  };

  return {
    NODE_ENV: nodeEnv as EnvConfig['NODE_ENV'],
    PORT: getEnvVarAsInt('PORT', 3000),
    LOG_LEVEL: getEnvVar('LOG_LEVEL', false) || 'debug',

    MODE: mode,

    MOCK_SNAPSHOTS: getEnvVarAsBool('MOCK_SNAPSHOTS', preset.mockSnapshots),
    MOCK_TRANSACTIONS: getEnvVarAsBool('MOCK_TRANSACTIONS', preset.mockTransactions),

    SCHEDULE: schedule,
    NETWORK: network,

    MONGODB_URI: getEnvVar('MONGODB_URI'),
    REDIS_URL: getEnvVar('REDIS_URL', false) || 'redis://localhost:6379',

    ADMIN_USERNAME: getEnvVar('ADMIN_USERNAME'),
    ADMIN_PASSWORD: getEnvVar('ADMIN_PASSWORD'),
    SESSION_SECRET: getEnvVar('SESSION_SECRET'),

    MORALIS_API_KEY: getEnvVar('MORALIS_API_KEY'),

    PRIVATE_KEY: privateKey,

    MIN_BALANCE: getEnvVar('MIN_BALANCE', false) || preset.minBalance,
    REWARD_TOKEN: 'AQUARI',

    BATCH_SIZE: getEnvVarAsInt('BATCH_SIZE', preset.batchSize),
    MAX_GAS_PRICE: getEnvVar('MAX_GAS_PRICE', false) || preset.maxGasPrice,
    CONFIRMATIONS: getEnvVarAsInt('CONFIRMATIONS', preset.confirmations),
  };
}

// ═══════════════════════════════════════════════════════════
// Singleton Config
// ═══════════════════════════════════════════════════════════

let config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!config) {
    config = validateEnv();
  }
  return config;
}

export function resetConfig(): void {
  config = null;
}

// ═══════════════════════════════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════

export function getActiveNetwork(): NetworkConfig {
  return getConfig().NETWORK;
}

export function isForkMode(): boolean {
  return getConfig().MODE === 'fork';
}

export function isProductionMode(): boolean {
  return getConfig().MODE === 'production';
}

export function useFastCycles(): boolean {
  return getConfig().SCHEDULE.useFastCycles;
}

export function getModeName(): string {
  const cfg = getConfig();

  if (cfg.MOCK_TRANSACTIONS) {
    return cfg.MOCK_SNAPSHOTS ? 'MOCK (No API/TX)' : 'SIMULATED (Real API, Mock TX)';
  }

  if (cfg.MODE === 'fork') {
    return 'FORK (Fast Cycles)';
  }

  return 'PRODUCTION (Weekly)';
}

export function getMoralisChain(): string {
  return getActiveNetwork().moralisChain;
}

export function getTokenAddress(): string {
  return getActiveNetwork().tokenAddress;
}

export function getTokenSymbol(): string {
  return getActiveNetwork().tokenSymbol;
}

export function getTokenDecimals(): number {
  return getActiveNetwork().tokenDecimals;
}

export function getDisperseAddress(): string {
  return getActiveNetwork().disperseAddress;
}

export function getRpcUrl(): string {
  return getActiveNetwork().rpcUrl;
}

export type { NetworkConfig, ScheduleConfig, EnvConfig };
