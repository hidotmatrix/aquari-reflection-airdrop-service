import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import expressLayouts from 'express-ejs-layouts';
import path from 'path';
import { getConfig } from './config/env';
import { connectDatabase, createIndexes, closeDatabase, getDatabaseStatus, checkDatabaseHealth } from './config/database';
import { closeRedis, getRedisStatus, checkRedisHealth, isRedisRequired } from './config/redis';
import { initializeJobs, stopAllJobs, startWorker, stopWorker } from './jobs';
import { initializeBlockchain } from './services/blockchain.service';
import adminRoutes from './admin/routes/admin.routes';
import { logger } from './utils/logger';

// ═══════════════════════════════════════════════════════════
// Main Application Entry Point
// ═══════════════════════════════════════════════════════════

let isShuttingDown = false;

async function main(): Promise<void> {
  try {
    // Validate environment
    const config = getConfig();

    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('  AQUARI Weekly Airdrop System');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info(`Environment: ${config.NODE_ENV}`);
    logger.info(`Mock Mode: ${config.MOCK_MODE}`);
    logger.info(`Port: ${config.PORT}`);

    // Connect to MongoDB
    const db = await connectDatabase();

    // Create database indexes
    await createIndexes(db);

    // Initialize blockchain service
    initializeBlockchain();

    // Initialize cron jobs (this also initializes Redis)
    try {
      initializeJobs(db);

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
      res.locals.mockMode = config.MOCK_MODE;
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

      const isHealthy = dbHealthy && (redisHealthy || !isRedisRequired());

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: config.NODE_ENV,
        mockMode: config.MOCK_MODE,
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
