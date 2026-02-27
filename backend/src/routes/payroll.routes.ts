import { Router } from 'express';
import {
  schedulePayroll,
  getPayrolls,
  getPayroll,
  cancelPayroll,
  retryPayroll,
} from '../controllers/payroll.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);
router.use(authorize('ADMIN'));

router.post('/schedule', schedulePayroll);
router.get('/', getPayrolls);
router.get('/:id', getPayroll);
router.put('/:id/cancel', cancelPayroll);
router.put('/:id/retry', retryPayroll);

export default router;
