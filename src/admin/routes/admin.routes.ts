import { Router } from 'express';
import { requireAuth, addUserToLocals } from '../middleware/auth.middleware';
import { loginRateLimiter } from '../middleware/rate-limiter';
import * as ctrl from '../controllers/admin.controller';
import * as analyticsCtrl from '../controllers/analytics.controller';

// ═══════════════════════════════════════════════════════════
// Admin Routes
// ═══════════════════════════════════════════════════════════

const router = Router();

// Add user info to all routes
router.use(addUserToLocals);

// Public routes (with rate limiting on login)
router.get('/login', ctrl.showLogin);
router.post('/login', loginRateLimiter, ctrl.handleLogin);
router.get('/logout', ctrl.handleLogout);

// Protected routes (all READ-ONLY)
router.use(requireAuth);

router.get('/dashboard', ctrl.dashboard);
router.get('/snapshots', ctrl.listSnapshots);
router.get('/snapshots/:id', ctrl.snapshotDetail);
router.get('/distributions', ctrl.listDistributions);
router.get('/distributions/:id', ctrl.distributionDetail);
router.get('/recipients', ctrl.listRecipients);
router.get('/batches', ctrl.listBatches);
router.get('/batches/:id', ctrl.batchDetail);
router.get('/search', ctrl.searchByAddress);

// Job triggers (start background jobs)
router.post('/trigger/snapshot', ctrl.triggerSnapshot);
router.post('/trigger/calculate', ctrl.triggerCalculation);
router.post('/trigger/full-flow', ctrl.triggerFullFlow);
router.post('/trigger/airdrop', ctrl.triggerAirdrop);
router.post('/approve-airdrop', ctrl.approveAndExecuteAirdrop);
router.post('/retry-airdrop', ctrl.retryFailedAirdrop);

// Workflow control (manual start for fork mode)
router.post('/workflow/start', ctrl.startWorkflow);

// Job status and logs
router.get('/jobs/status', ctrl.getJobStatusEndpoint);
router.get('/jobs/:jobId/logs', ctrl.getJobLogs);

// Dev tools (only works in development)
router.post('/dev/clear-data', ctrl.clearData);
router.post('/dev/delete-database', ctrl.deleteDatabase);

// ═══════════════════════════════════════════════════════════
// Analytics and Export Routes
// ═══════════════════════════════════════════════════════════

router.get('/analytics', analyticsCtrl.analyticsPage);

// Analytics API endpoints
router.get('/analytics/api/gas', analyticsCtrl.gasAnalytics);
router.get('/analytics/api/distributions', analyticsCtrl.distributionAnalytics);
router.get('/analytics/api/holder-growth', analyticsCtrl.holderGrowthAnalytics);

// CSV Export endpoints
router.get('/analytics/export/summary', analyticsCtrl.exportSummary);
router.get('/analytics/export/gas', analyticsCtrl.exportGas);
router.get('/export/distribution/:distributionId/recipients', analyticsCtrl.exportRecipients);
router.get('/export/distribution/:distributionId/batches', analyticsCtrl.exportBatches);
router.get('/export/snapshot/:snapshotId/holders', analyticsCtrl.exportHolders);

// Batch retry endpoint
router.post('/batches/:id/retry', ctrl.retryBatch);

// Blockchain status endpoint (for pre-flight checks)
router.get('/blockchain/status', ctrl.getBlockchainStatus);

export default router;
