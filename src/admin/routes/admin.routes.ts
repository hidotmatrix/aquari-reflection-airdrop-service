import { Router } from 'express';
import { requireAuth, addUserToLocals } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/admin.controller';

// ═══════════════════════════════════════════════════════════
// Admin Routes
// ═══════════════════════════════════════════════════════════

const router = Router();

// Add user info to all routes
router.use(addUserToLocals);

// Public routes
router.get('/login', ctrl.showLogin);
router.post('/login', ctrl.handleLogin);
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

// Workflow control (manual start for fork mode)
router.post('/workflow/start', ctrl.startWorkflow);

// Job status and logs
router.get('/jobs/status', ctrl.getJobStatusEndpoint);
router.get('/jobs/:jobId/logs', ctrl.getJobLogs);

// Dev tools (only works in development)
router.post('/dev/clear-data', ctrl.clearData);
router.post('/dev/delete-database', ctrl.deleteDatabase);

export default router;
