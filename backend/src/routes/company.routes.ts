import { Router } from 'express';
import {
  getCompany,
  updateCompany,
  getDashboard,
  getAdvancedStats,
  getSystemStatus,
  getAuditLog,
} from '../controllers/company.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', getCompany);
router.put('/', authorize('OWNER', 'ADMIN'), updateCompany);
router.get('/dashboard', getDashboard);
router.get('/stats', getAdvancedStats);
router.get('/system-status', getSystemStatus);
router.get('/audit-log', authorize('OWNER', 'ADMIN'), getAuditLog);

export default router;
