import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import expressLayouts from 'express-ejs-layouts';
import path from 'path';
import { ethers } from 'ethers';
import { getConfig, getModeName, getTokenSymbol, getTokenDecimals, getRpcUrl } from './config/env';
import { connectDatabase, createIndexes, closeDatabase, getDatabaseStatus, checkDatabaseHealth } from './config/database';
import { closeRedis, getRedisStatus, checkRedisHealth, isRedisRequired, getRedisConnection } from './config/redis';
import { initializeJobs, stopAllJobs, startWorker, stopWorker } from './jobs';
import { initializeBlockchain, getWalletEthBalance, getWalletTokenBalance, getWalletAddress } from './services/blockchain.service';
import { getGasPrices } from './utils/gas-oracle';
import { initializeJobLogService, createJobLogIndexes } from './services/job-log.service';
import adminRoutes from './admin/routes/admin.routes';
import { logger } from './utils/logger';

// ═══════════════════════════════════════════════════════════
// Main Application Entry Point
// ═══════════════════════════════════════════════════════════

// Minimum recommended balances
const MIN_ETH_BALANCE = 0.01; // 0.01 ETH for gas
const MIN_TOKEN_BALANCE = 1000; // Minimum tokens to airdrop

let isShuttingDown = false;

/**
 * Check connectivity to all required services before startup
 */
async function checkConnectivity(config: ReturnType<typeof getConfig>): Promise<void> {
  logger.info('');
  logger.info('CONNECTIVITY CHECKS:');

  const results = {
    mongodb: false,
    redis: false,
    rpc: false,
  };

  // Check MongoDB
  try {
    logger.info('  [1/3] Checking MongoDB...');
    const db = await connectDatabase();
    await db.command({ ping: 1 });
    results.mongodb = true;
    logger.info('        MongoDB: Connected');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`        MongoDB: FAILED - ${msg}`);
  }

  // Check Redis
  try {
    logger.info('  [2/3] Checking Redis...');
    getRedisConnection(); // Initialize connection
    // Wait a moment for connection to establish
    await new Promise(resolve => setTimeout(resolve, 1000));
    const healthy = await checkRedisHealth();
    if (healthy) {
      results.redis = true;
      logger.info('        Redis: Connected');
    } else {
      throw new Error('Health check failed');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isRedisRequired()) {
      logger.error(`        Redis: FAILED - ${msg}`);
    } else {
      logger.warn(`        Redis: Not available (optional in dev mode) - ${msg}`);
      results.redis = true; // Not required in dev
    }
  }

  // Check RPC/Blockchain
  try {
    logger.info('  [3/3] Checking RPC...');
    const rpcUrl = getRpcUrl();
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    results.rpc = true;
    logger.info(`        RPC: Connected (Chain ${network.chainId}, Block #${blockNumber})`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (config.MOCK_TRANSACTIONS) {
      logger.warn(`        RPC: Not available (MOCK_TRANSACTIONS=true) - ${msg}`);
      results.rpc = true; // Mock mode doesn't need RPC
    } else {
      logger.error(`        RPC: FAILED - ${msg}`);
    }
  }

  logger.info('');

  // Fail startup if critical services unavailable
  if (!results.mongodb) {
    throw new Error('MongoDB connection required - check MONGODB_URI');
  }
  if (!results.redis && isRedisRequired()) {
    throw new Error('Redis connection required - check REDIS_URL');
  }
  if (!results.rpc && !config.MOCK_TRANSACTIONS) {
    throw new Error('RPC connection required - check RPC_URL');
  }

  logger.info('All connectivity checks passed');
}

/**
 * Log wallet balances on startup with warnings if low
 */
async function logWalletBalances(config: ReturnType<typeof getConfig>): Promise<void> {
  logger.info('───────────────────────────────────────────────────────────');
  logger.info('WALLET BALANCES:');

  try {
    const [ethBalance, tokenBalance] = await Promise.all([
      getWalletEthBalance(),
      getWalletTokenBalance(),
    ]);

    const tokenSymbol = getTokenSymbol();
    const tokenDecimals = getTokenDecimals();
    const divisor = Math.pow(10, tokenDecimals);

    const ethBalanceNum = Number(ethBalance) / 1e18;
    const tokenBalanceNum = Number(tokenBalance) / divisor;

    // Log ETH balance
    if (ethBalanceNum < MIN_ETH_BALANCE) {
      logger.warn(`  ETH Balance: ${ethBalanceNum.toFixed(6)} ETH ⚠️  LOW - Fund wallet for gas fees!`);
    } else {
      logger.info(`  ETH Balance: ${ethBalanceNum.toFixed(6)} ETH ✓`);
    }

    // Log token balance
    if (tokenBalanceNum < MIN_TOKEN_BALANCE) {
      logger.warn(`  ${tokenSymbol} Balance: ${tokenBalanceNum.toLocaleString()} ${tokenSymbol} ⚠️  LOW - Fund wallet with tokens to airdrop!`);
    } else {
      logger.info(`  ${tokenSymbol} Balance: ${tokenBalanceNum.toLocaleString()} ${tokenSymbol} ✓`);
    }

    // Show wallet address for easy funding
    const walletAddress = getWalletAddress();
    if (walletAddress && (ethBalanceNum < MIN_ETH_BALANCE || tokenBalanceNum < MIN_TOKEN_BALANCE)) {
      logger.warn('───────────────────────────────────────────────────────────');
      logger.warn('⚠️  WALLET NEEDS FUNDING:');
      logger.warn(`  Address: ${walletAddress}`);
      if (ethBalanceNum < MIN_ETH_BALANCE) {
        logger.warn(`  → Send ETH for gas fees (recommended: ${MIN_ETH_BALANCE}+ ETH)`);
      }
      if (tokenBalanceNum < MIN_TOKEN_BALANCE) {
        logger.warn(`  → Send ${tokenSymbol} tokens to airdrop`);
      }
    }
  } catch (error) {
    if (config.MOCK_TRANSACTIONS) {
      logger.info('  [MOCK MODE] Wallet balances simulated');
    } else {
      logger.error('  Failed to fetch wallet balances:', error);
    }
  }
}

async function main(): Promise<void> {
  try {
    // Validate environment
    const config = getConfig();

    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('  AQUARI Weekly Airdrop System');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info(`Environment: ${config.NODE_ENV}`);
    logger.info(`Mode: ${config.MODE} (${getModeName()})`);
    logger.info('───────────────────────────────────────────────────────────');
    logger.info(`Network: ${config.NETWORK.chainName} (Chain ID: ${config.NETWORK.chainId})`);
    logger.info(`RPC URL: ${config.NETWORK.rpcUrl}`);
    logger.info(`Token: ${config.REWARD_TOKEN} (${config.NETWORK.tokenAddress})`);
    logger.info(`Disperse: ${config.NETWORK.disperseAddress}`);

    // Derive and display wallet address from private key
    const wallet = new ethers.Wallet(config.PRIVATE_KEY);
    logger.info(`Airdrop Wallet: ${wallet.address}`);
    logger.info('───────────────────────────────────────────────────────────');
    logger.info(`Mock Snapshots: ${config.MOCK_SNAPSHOTS}`);
    logger.info(`Mock Transactions: ${config.MOCK_TRANSACTIONS}`);
    logger.info(`Batch Size: ${config.BATCH_SIZE}`);
    logger.info(`Min Balance: ${config.MIN_BALANCE} wei`);
    logger.info(`Port: ${config.PORT}`);

    // Run connectivity checks
    await checkConnectivity(config);

    // Get database connection (already connected from check)
    const db = await connectDatabase();

    // Create database indexes
    await createIndexes(db);

    // Initialize job log service
    initializeJobLogService(db);
    await createJobLogIndexes();

    // Initialize blockchain service
    initializeBlockchain();

    // Log wallet balances on startup
    await logWalletBalances(config);

    // Initialize cron jobs (this also initializes Redis)
    try {
      await initializeJobs(db);

      // Start the background worker for job processing
      // In production, this would run as a separate process
      if (config.NODE_ENV === 'development') {
        logger.info('Starting background worker for job processing...');
        startWorker();
      }
    } catch (error) {
      if (isRedisRequired()) {
        throw error;
      }
      logger.warn('Redis not available - cron jobs disabled (development mode)');
    }

    // Create Express app
    const app = express();
    app.locals.db = db;

    // Trust proxy for secure cookies behind reverse proxy
    if (config.NODE_ENV === 'production') {
      app.set('trust proxy', 1);
    }

    // Middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Session configuration
    app.use(
      session({
        secret: config.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: config.NODE_ENV === 'production',
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          sameSite: 'lax',
        },
      })
    );

    // View engine
    app.set('view engine', 'ejs');
    // Views are in src/admin/views - resolve from project root
    const viewsPath = path.join(__dirname, '..', 'src', 'admin', 'views');
    app.set('views', viewsPath);
    logger.debug(`Views path: ${viewsPath}`);

    // Layout engine
    app.use(expressLayouts);
    app.set('layout', 'layout');

    // Add mockMode to all views
    app.use((_req, res, next) => {
      res.locals.mockMode = config.MOCK_TRANSACTIONS;
      res.locals.mockSnapshots = config.MOCK_SNAPSHOTS;
      next();
    });

    // Health check endpoint with detailed status
    app.get('/health', async (_req, res) => {
      const dbStatus = getDatabaseStatus();
      const redisStatus = getRedisStatus();

      // Perform actual health checks
      const [dbHealthy, redisHealthy] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
      ]);

      // Get blockchain status
      let blockchainStatus: {
        healthy: boolean;
        walletAddress: string | null;
        ethBalance?: string;
        tokenBalance?: string;
        gasPrice?: string;
      } = { healthy: false, walletAddress: null };

      try {
        const [ethBalance, tokenBalance, gasPrices] = await Promise.all([
          getWalletEthBalance(),
          getWalletTokenBalance(),
          getGasPrices(),
        ]);

        const tokenDecimals = getTokenDecimals();
        const divisor = Math.pow(10, tokenDecimals);
        blockchainStatus = {
          healthy: true,
          walletAddress: getWalletAddress(),
          ethBalance: (Number(ethBalance) / 1e18).toFixed(4) + ' ETH',
          tokenBalance: (Number(tokenBalance) / divisor).toLocaleString() + ' ' + getTokenSymbol(),
          gasPrice: (Number(gasPrices.current) / 1e9).toFixed(2) + ' gwei',
        };
      } catch {
        blockchainStatus.healthy = config.MOCK_TRANSACTIONS;
      }

      // Get last snapshot info from DB
      let lastSnapshot: { weekId: string; status: string; timestamp: Date } | null = null;
      try {
        const snapshot = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
        if (snapshot) {
          lastSnapshot = {
            weekId: snapshot.weekId,
            status: snapshot.status,
            timestamp: snapshot.timestamp,
          };
        }
      } catch {
        // Ignore
      }

      // Get pending batches count
      let pendingBatches = 0;
      try {
        pendingBatches = await db.collection('batches').countDocuments({
          status: { $in: ['pending', 'processing'] },
        });
      } catch {
        // Ignore
      }

      const isHealthy = dbHealthy && (redisHealthy || !isRedisRequired());

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: config.NODE_ENV,
        mode: config.MODE,
        mockSnapshots: config.MOCK_SNAPSHOTS,
        mockTransactions: config.MOCK_TRANSACTIONS,
        services: {
          database: {
            ...dbStatus,
            healthy: dbHealthy,
          },
          redis: {
            ...redisStatus,
            healthy: redisHealthy,
            required: isRedisRequired(),
          },
          blockchain: blockchainStatus,
        },
        airdrop: {
          lastSnapshot,
          pendingBatches,
        },
      });
    });

    // Simple readiness probe
    app.get('/ready', async (_req, res) => {
      const dbHealthy = await checkDatabaseHealth();
      if (dbHealthy && !isShuttingDown) {
        res.status(200).json({ status: 'ready' });
      } else {
        res.status(503).json({ status: 'not ready' });
      }
    });

    // Liveness probe
    app.get('/live', (_req, res) => {
      if (!isShuttingDown) {
        res.status(200).json({ status: 'alive' });
      } else {
        res.status(503).json({ status: 'shutting down' });
      }
    });

    // Admin routes
    app.use('/admin', adminRoutes);

    // Redirect root to admin dashboard
    app.get('/', (_req, res) => {
      res.redirect('/admin/dashboard');
    });

    // 404 handler
    app.use((_req, res) => {
      res.status(404).render('error', { message: 'Page not found', layout: false });
    });

    // Global error handler
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error:', err);

      // Don't expose error details in production
      const message = config.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;

      res.status(500).render('error', { message, layout: false });
    });

    // Start server
    const server = app.listen(config.PORT, () => {
      logger.info('───────────────────────────────────────────────────────────');
      logger.info(`Server running on port ${config.PORT}`);
      logger.info(`Admin dashboard: http://localhost:${config.PORT}/admin`);
      logger.info(`Health check: http://localhost:${config.PORT}/health`);
      logger.info('───────────────────────────────────────────────────────────');
    });

    // Configure server timeouts
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Graceful shutdown handler
    const shutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress...');
        return;
      }

      isShuttingDown = true;
      logger.info(`\n${signal} received - starting graceful shutdown...`);

      // Set a hard timeout for shutdown
      const shutdownTimeout = setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);

      try {
        // Stop accepting new connections
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        logger.info('HTTP server closed');

        // Stop cron jobs
        stopAllJobs();
        logger.info('Cron jobs stopped');

        // Stop background worker
        await stopWorker();
        logger.info('Background worker stopped');

        // Close Redis connection
        await closeRedis();

        // Close database connection
        await closeDatabase();

        clearTimeout(shutdownTimeout);
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        clearTimeout(shutdownTimeout);
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('UNCAUGHT_EXCEPTION').catch(() => process.exit(1));
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    });

  } catch (error) {
    logger.error('Fatal error during startup:', error);

    // Attempt cleanup
    try {
      await closeRedis();
      await closeDatabase();
    } catch {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run the application
main();
