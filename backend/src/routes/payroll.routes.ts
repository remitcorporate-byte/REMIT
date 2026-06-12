import { Router } from 'express';
import {
  createPayrollDraft,
  schedulePayroll,
  getPayrolls,
  getPayroll,
  updatePayrollDraft,
  submitPayroll,
  approvePayroll,
  cancelPayroll,
  retryPayroll,
  exportPayroll,
} from '../controllers/payroll.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);

router.post('/schedule', authorize('OWNER', 'ADMIN', 'FINANCE'), schedulePayroll);
router.post('/drafts', authorize('OWNER', 'ADMIN', 'FINANCE'), createPayrollDraft);
router.get('/', authorize('OWNER', 'ADMIN', 'FINANCE', 'VIEWER'), getPayrolls);
router.get('/:id/export', authorize('OWNER', 'ADMIN', 'FINANCE', 'VIEWER'), exportPayroll);
router.get('/:id', authorize('OWNER', 'ADMIN', 'FINANCE', 'VIEWER'), getPayroll);
router.put('/:id', authorize('OWNER', 'ADMIN', 'FINANCE'), updatePayrollDraft);
router.put('/:id/submit', authorize('OWNER', 'ADMIN', 'FINANCE'), submitPayroll);
router.put('/:id/approve', authorize('OWNER', 'ADMIN', 'FINANCE'), approvePayroll);
router.put('/:id/cancel', authorize('OWNER', 'ADMIN', 'FINANCE'), cancelPayroll);
router.put('/:id/retry', authorize('OWNER', 'ADMIN', 'FINANCE'), retryPayroll);

export default router;
