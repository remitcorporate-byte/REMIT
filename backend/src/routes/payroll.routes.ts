import { Router } from 'express';
import {
  createPayrollDraft,
  schedulePayroll,
  getPayrolls,
  getPayroll,
  updatePayrollDraft,
  submitPayroll,
  approvePayroll,
  issueApprovalCode,
  cancelPayroll,
  retryPayroll,
  exportPayroll,
} from '../controllers/payroll.controller';
import { protect, authorizePermission } from '../middleware/auth';

const router = Router();

router.use(protect);

router.post('/schedule', authorizePermission('payroll.create'), schedulePayroll);
router.post('/drafts', authorizePermission('payroll.create'), createPayrollDraft);
router.get('/', authorizePermission('payroll.read'), getPayrolls);
router.get('/:id/export', authorizePermission('payroll.export'), exportPayroll);
router.get('/:id', authorizePermission('payroll.read'), getPayroll);
router.put('/:id', authorizePermission('payroll.update'), updatePayrollDraft);
router.put('/:id/submit', authorizePermission('payroll.submit'), submitPayroll);
router.put('/:id/approve', authorizePermission('payroll.approve'), approvePayroll);
router.post('/:id/approval-code', authorizePermission('payroll.approve'), issueApprovalCode);
router.put('/:id/cancel', authorizePermission('payroll.cancel'), cancelPayroll);
router.put('/:id/retry', authorizePermission('payroll.retry'), retryPayroll);

export default router;
