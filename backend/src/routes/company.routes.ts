import { Router } from 'express';
import {
  getCompany,
  updateCompany,
  getDashboard,
  getAdvancedStats,
  getSystemStatus,
  getAuditLog,
} from '../controllers/company.controller';
import { protect, authorizePermission } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', authorizePermission('company.read'), getCompany);
router.put('/', authorizePermission('company.manage'), updateCompany);
router.get('/dashboard', authorizePermission('dashboard.read'), getDashboard);
router.get('/stats', authorizePermission('dashboard.read'), getAdvancedStats);
router.get('/system-status', authorizePermission('system.read'), getSystemStatus);
router.get('/audit-log', authorizePermission('audit.read'), getAuditLog);

export default router;
