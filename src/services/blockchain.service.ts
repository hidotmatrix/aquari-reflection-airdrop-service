import { ethers } from 'ethers';
import { getConfig, getActiveNetwork, getRpcUrl, getDisperseAddress, getTokenAddress } from '../config/env';
import { logger } from '../utils/logger';
import { BatchRecipient, BatchExecution } from '../models';

// ═══════════════════════════════════════════════════════════
// Blockchain Service
// Handles real blockchain transactions for AQUARI token airdrops
// ═══════════════════════════════════════════════════════════

// Disperse contract ABI
const DISPERSE_ABI = [
  'function disperseEther(address[] recipients, uint256[] values) external payable',
  'function disperseToken(address token, address[] recipients, uint256[] values) external',
  'function disperseTokenSimple(address token, address[] recipients, uint256[] values) external',
];

// ERC20 token ABI (for approval and balance)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let disperseContract: ethers.Contract | null = null;
let tokenContract: ethers.Contract | null = null;

/**
 * Initialize blockchain connection
 */
export function initializeBlockchain(): void {
  const config = getConfig();
  const network = getActiveNetwork();

  if (config.MOCK_TRANSACTIONS) {
    logger.info('[MOCK] Blockchain service initialized in mock mode');
    return;
  }

  const rpcUrl = getRpcUrl();
  const disperseAddress = getDisperseAddress();
  const tokenAddress = getTokenAddress();

  provider = new ethers.JsonRpcProvider(rpcUrl);

  if (config.PRIVATE_KEY) {
    wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);

    // Initialize Disperse contract
    disperseContract = new ethers.Contract(
      disperseAddress,
      DISPERSE_ABI,
      wallet
    );

    // Initialize Token contract (for approvals and balance checks)
    if (tokenAddress) {
      tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        wallet
      );
    }

    logger.info(`Blockchain service initialized:`);
    logger.info(`  Network: ${network.chainName} (${network.chainId})`);
    logger.info(`  RPC: ${rpcUrl}`);
    logger.info(`  Wallet: ${wallet.address}`);
    logger.info(`  Token: ${tokenAddress || 'Not configured'}`);
    logger.info(`  Disperse: ${disperseAddress}`);
  } else {
    logger.warn('No private key configured - blockchain transactions disabled');
  }
}

/**
 * Check if blockchain is properly initialized
 */
export function isBlockchainReady(): boolean {
  const config = getConfig();
  if (config.MOCK_TRANSACTIONS) return true;
  return wallet !== null && disperseContract !== null && tokenContract !== null;
}

/**
 * Get current gas price
 */
export async function getCurrentGasPrice(): Promise<bigint> {
  const config = getConfig();

  if (config.MOCK_TRANSACTIONS || !provider) {
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
 * Get wallet ETH balance (for gas)
 */
export async function getWalletEthBalance(): Promise<string> {
  const config = getConfig();

  if (config.MOCK_TRANSACTIONS || !wallet || !provider) {
    return '10000000000000000000'; // 10 ETH mock
  }

  const balance = await provider.getBalance(wallet.address);
  return balance.toString();
}

/**
 * Get wallet token balance (AQUARI)
 */
export async function getWalletTokenBalance(): Promise<string> {
  const config = getConfig();

  if (config.MOCK_TRANSACTIONS || !tokenContract || !wallet) {
    return '100000000000000000000000'; // 100,000 AQUARI mock
  }

  const balanceOf = tokenContract.getFunction('balanceOf');
  const balance = await balanceOf(wallet.address);
  return balance.toString();
}

/**
 * Get current token allowance for Disperse contract
 */
export async function getDisperseAllowance(): Promise<string> {
  const config = getConfig();

  if (config.MOCK_TRANSACTIONS || !tokenContract || !wallet) {
    return '115792089237316195423570985008687907853269984665640564039457584007913129639935'; // Max uint256
  }

  const disperseAddress = getDisperseAddress();
  const allowanceFn = tokenContract.getFunction('allowance');
  const allowance = await allowanceFn(wallet.address, disperseAddress);
  return allowance.toString();
}

/**
 * Approve Disperse contract to spend tokens
 */
export async function approveDisperse(amount: string): Promise<string> {
  const config = getConfig();

  if (config.MOCK_TRANSACTIONS) {
    logger.info(`[MOCK] Approved Disperse to spend ${amount} tokens`);
    return '0x' + 'mock'.repeat(16);
  }

  if (!tokenContract || !wallet) {
    throw new Error('Token contract not initialized');
  }

  const disperseAddress = getDisperseAddress();
  logger.info(`Approving Disperse contract to spend ${amount} tokens...`);

  const approveFn = tokenContract.getFunction('approve');
  const tx = await approveFn(disperseAddress, amount);
  const receipt = await tx.wait(config.CONFIRMATIONS);

  if (!receipt || receipt.status === 0) {
    throw new Error('Approval transaction failed');
  }

  logger.info(`Approval confirmed: ${receipt.hash}`);
  return receipt.hash;
}

/**
 * Ensure Disperse has sufficient allowance, approve if needed
 */
export async function ensureAllowance(requiredAmount: string): Promise<void> {
  const currentAllowance = BigInt(await getDisperseAllowance());
  const required = BigInt(requiredAmount);

  if (currentAllowance < required) {
    logger.info(`Current allowance (${currentAllowance}) < required (${required}), approving...`);
    // Approve max uint256 to avoid repeated approvals
    const maxApproval = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
    await approveDisperse(maxApproval);
  } else {
    logger.info(`Sufficient allowance: ${currentAllowance}`);
  }
}

// Legacy alias for backward compatibility
export const getWalletBalance = getWalletEthBalance;

/**
 * Execute batch airdrop using Disperse contract
 * For AQUARI tokens, uses disperseTokenSimple which transfers directly from sender
 */
export async function executeBatchAirdrop(
  recipients: BatchRecipient[]
): Promise<BatchExecution> {
  const config = getConfig();

  if (config.MOCK_TRANSACTIONS) {
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
    `Executing batch airdrop: ${recipients.length} recipients, total: ${totalAmount} AQUARI`
  );

  // Ensure we have sufficient token balance
  const tokenBalance = BigInt(await getWalletTokenBalance());
  if (tokenBalance < totalAmount) {
    throw new Error(
      `Insufficient token balance: ${tokenBalance} < ${totalAmount}`
    );
  }

  // Ensure Disperse contract has approval to spend our tokens
  await ensureAllowance(totalAmount.toString());

  // Get token address for the active network
  const tokenAddress = getTokenAddress();
  if (!tokenAddress) {
    throw new Error('Token address not configured for the active network');
  }

  // Execute token distribution using disperseTokenSimple
  // This transfers tokens directly from our wallet to recipients
  const disperseTokenSimple = contract.getFunction('disperseTokenSimple');
  const tx = await disperseTokenSimple(
    tokenAddress,
    addresses,
    amounts,
    { gasLimit: config.BATCH_SIZE * 65000 } // ~65k gas per recipient for tokens
  );

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
  // Approximate gas: 21000 base + ~65000 per recipient for tokens
  return 21000n + 65000n * BigInt(recipientCount);
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  txHash: string
): Promise<'pending' | 'confirmed' | 'failed' | 'not_found'> {
  const config = getConfig();

  if (config.MOCK_TRANSACTIONS) {
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

/**
 * Get wallet address
 */
export function getWalletAddress(): string | null {
  return wallet?.address ?? null;
}

/**
 * Get blockchain info for dashboard display
 */
export async function getBlockchainInfo(): Promise<{
  network: string;
  walletAddress: string | null;
  ethBalance: string;
  tokenBalance: string;
  allowance: string;
  isReady: boolean;
}> {
  const network = getActiveNetwork();

  return {
    network: network.chainName,
    walletAddress: getWalletAddress(),
    ethBalance: await getWalletEthBalance(),
    tokenBalance: await getWalletTokenBalance(),
    allowance: await getDisperseAllowance(),
    isReady: isBlockchainReady(),
  };
}

// For testing - reset mock counter
export function resetMockCounter(): void {
  mockTxCounter = 0;
}
