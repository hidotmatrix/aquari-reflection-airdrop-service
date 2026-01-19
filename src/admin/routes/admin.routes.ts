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

// Test triggers (manual execution)
router.post('/trigger/snapshot', ctrl.triggerSnapshot);
router.post('/trigger/calculate', ctrl.triggerCalculation);
router.post('/trigger/full-flow', ctrl.triggerFullFlow);

export default router;
