import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { getConfig } from './config/env';
import { connectDatabase, createIndexes, closeDatabase } from './config/database';
import { initializeJobs, stopAllJobs } from './jobs';
import { initializeBlockchain } from './services/blockchain.service';
import adminRoutes from './admin/routes/admin.routes';
import { logger } from './utils/logger';

// ═══════════════════════════════════════════════════════════
// Main Application Entry Point
// ═══════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // Validate environment
  const config = getConfig();
  logger.info(`Starting AQUARI Airdrop System (${config.NODE_ENV})`);
  logger.info(`Mock mode: ${config.MOCK_MODE}`);

  // Connect to MongoDB
  const db = await connectDatabase();

  // Create database indexes
  await createIndexes(db);

  // Initialize blockchain service
  initializeBlockchain();

  // Initialize cron jobs
  initializeJobs(db);

  // Create Express app
  const app = express();
  app.locals.db = db;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
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
      },
    })
  );

  // View engine
  app.set('view engine', 'ejs');
  // Views are in src/admin/views - resolve from project root
  const viewsPath = path.join(__dirname, '..', 'src', 'admin', 'views');
  app.set('views', viewsPath);
  logger.debug(`Views path: ${viewsPath}`);

  // Routes
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mockMode: config.MOCK_MODE,
    });
  });

  app.use('/admin', adminRoutes);

  // Redirect root to admin dashboard
  app.get('/', (_req, res) => {
    res.redirect('/admin/dashboard');
  });

  // 404 handler
  app.use((_req, res) => {
    res.status(404).render('error', { message: 'Page not found' });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).render('error', { message: 'Internal server error' });
  });

  // Start server
  const server = app.listen(config.PORT, () => {
    logger.info(`Server running on port ${config.PORT}`);
    logger.info(`Admin dashboard: http://localhost:${config.PORT}/admin`);
    logger.info(`Health check: http://localhost:${config.PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      stopAllJobs();
      await closeDatabase();

      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Run the application
main().catch((err) => {
  logger.error('Fatal error during startup:', err);
  process.exit(1);
});
