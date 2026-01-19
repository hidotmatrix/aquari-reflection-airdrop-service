import { ethers } from 'ethers';
import { getConfig } from '../config/env';
import { logger } from '../utils/logger';
import { BatchRecipient, BatchExecution } from '../models';

// ═══════════════════════════════════════════════════════════
// Blockchain Service
// ═══════════════════════════════════════════════════════════

// Disperse contract ABI (only the function we need)
const DISPERSE_ABI = [
  'function disperseEther(address[] recipients, uint256[] values) external payable',
  'function disperseToken(address token, address[] recipients, uint256[] values) external',
];

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let disperseContract: ethers.Contract | null = null;

/**
 * Initialize blockchain connection
 */
export function initializeBlockchain(): void {
  const config = getConfig();

  if (config.MOCK_MODE) {
    logger.info('[MOCK] Blockchain service initialized in mock mode');
    return;
  }

  provider = new ethers.JsonRpcProvider(config.BASE_RPC_URL);

  if (config.PRIVATE_KEY) {
    wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
    disperseContract = new ethers.Contract(
      config.DISPERSE_CONTRACT,
      DISPERSE_ABI,
      wallet
    );
    logger.info(`Blockchain service initialized, wallet: ${wallet.address}`);
  } else {
    logger.warn('No private key configured - blockchain transactions disabled');
  }
}

/**
 * Get current gas price
 */
export async function getCurrentGasPrice(): Promise<bigint> {
  const config = getConfig();

  if (config.MOCK_MODE || !provider) {
    return BigInt(config.MAX_GAS_PRICE);
  }

  const feeData = await provider.getFeeData();
  return feeData.gasPrice ?? BigInt(config.MAX_GAS_PRICE);
}

/**
 * Check if gas price is acceptable
 */
export async function isGasPriceAcceptable(): Promise<boolean> {
  const config = getConfig();
  const currentGasPrice = await getCurrentGasPrice();
  const maxGasPrice = BigInt(config.MAX_GAS_PRICE);

  return currentGasPrice <= maxGasPrice;
}

/**
 * Get wallet balance
 */
export async function getWalletBalance(): Promise<string> {
  const config = getConfig();

  if (config.MOCK_MODE || !wallet || !provider) {
    return '10000000000000000000'; // 10 ETH mock
  }

  const balance = await provider.getBalance(wallet.address);
  return balance.toString();
}

/**
 * Execute batch airdrop using Disperse contract
 */
export async function executeBatchAirdrop(
  recipients: BatchRecipient[]
): Promise<BatchExecution> {
  const config = getConfig();

  if (config.MOCK_MODE) {
    return executeMockAirdrop(recipients);
  }

  if (!wallet || !disperseContract || !provider) {
    throw new Error('Blockchain not initialized or private key not configured');
  }

  // Type guard - contract is definitely not null after this point
  const contract = disperseContract;

  // Check gas price
  if (!(await isGasPriceAcceptable())) {
    const currentPrice = await getCurrentGasPrice();
    throw new Error(
      `Gas price too high: ${currentPrice} > ${config.MAX_GAS_PRICE}`
    );
  }

  // Prepare transaction data
  const addresses = recipients.map(r => r.address);
  const amounts = recipients.map(r => BigInt(r.amount));
  const totalAmount = amounts.reduce((a, b) => a + b, 0n);

  logger.info(
    `Executing batch airdrop: ${recipients.length} recipients, total: ${totalAmount}`
  );

  // Execute transaction based on reward token
  let tx: ethers.TransactionResponse;

  if (config.REWARD_TOKEN === 'ETH') {
    // Use getFunction to get typed function reference
    const disperseEther = contract.getFunction('disperseEther');
    tx = await disperseEther(addresses, amounts, {
      value: totalAmount,
      gasLimit: config.BATCH_SIZE * 30000, // ~30k gas per recipient
    });
  } else {
    // For ERC20 tokens (USDC, AQUARI)
    // Note: Token approval must be done separately
    const tokenAddress =
      config.REWARD_TOKEN === 'AQUARI'
        ? config.AQUARI_ADDRESS
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base

    const disperseToken = contract.getFunction('disperseToken');
    tx = await disperseToken(
      tokenAddress,
      addresses,
      amounts,
      { gasLimit: config.BATCH_SIZE * 50000 }
    );
  }

  logger.info(`Transaction submitted: ${tx.hash}`);

  // Wait for confirmation
  const receipt = await tx.wait(config.CONFIRMATIONS);

  if (!receipt) {
    throw new Error('Transaction receipt is null');
  }

  if (receipt.status === 0) {
    throw new Error('Transaction reverted');
  }

  logger.info(
    `Transaction confirmed: ${receipt.hash}, block: ${receipt.blockNumber}, gas: ${receipt.gasUsed}`
  );

  return {
    txHash: receipt.hash,
    gasUsed: receipt.gasUsed.toString(),
    gasPrice: receipt.gasPrice?.toString() ?? '0',
    blockNumber: receipt.blockNumber,
    confirmedAt: new Date(),
  };
}

// ═══════════════════════════════════════════════════════════
// Mock Implementation
// ═══════════════════════════════════════════════════════════

let mockTxCounter = 0;

/**
 * Execute mock airdrop for testing
 */
async function executeMockAirdrop(
  recipients: BatchRecipient[]
): Promise<BatchExecution> {
  logger.info(
    `[MOCK] Executing batch airdrop: ${recipients.length} recipients`
  );

  // Simulate transaction delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  mockTxCounter++;
  const mockTxHash = `0x${'0'.repeat(63)}${mockTxCounter.toString(16)}`;

  logger.info(`[MOCK] Transaction confirmed: ${mockTxHash}`);

  return {
    txHash: mockTxHash,
    gasUsed: (recipients.length * 25000).toString(),
    gasPrice: '1000000000', // 1 gwei
    blockNumber: 10000000 + mockTxCounter,
    confirmedAt: new Date(),
  };
}

/**
 * Estimate gas for a batch
 */
export async function estimateBatchGas(
  recipientCount: number
): Promise<bigint> {
  // Approximate gas: 21000 base + ~30000 per recipient for ETH
  // For tokens: 21000 base + ~50000 per recipient
  const config = getConfig();
  const perRecipient = config.REWARD_TOKEN === 'ETH' ? 30000n : 50000n;
  return 21000n + perRecipient * BigInt(recipientCount);
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  txHash: string
): Promise<'pending' | 'confirmed' | 'failed' | 'not_found'> {
  const config = getConfig();

  if (config.MOCK_MODE) {
    return 'confirmed';
  }

  if (!provider) {
    throw new Error('Provider not initialized');
  }

  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt) {
    const tx = await provider.getTransaction(txHash);
    return tx ? 'pending' : 'not_found';
  }

  return receipt.status === 1 ? 'confirmed' : 'failed';
}

// For testing - reset mock counter
export function resetMockCounter(): void {
  mockTxCounter = 0;
}
