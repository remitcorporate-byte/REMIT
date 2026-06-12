import { Router } from 'express';
import {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  listBanks,
  verifyBank,
} from '../controllers/employee.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/banks', authorize('OWNER', 'ADMIN', 'FINANCE'), listBanks);
router.post('/verify-bank', authorize('OWNER', 'ADMIN', 'FINANCE'), verifyBank);
router.route('/')
  .get(authorize('OWNER', 'ADMIN', 'FINANCE', 'VIEWER'), getEmployees)
  .post(authorize('OWNER', 'ADMIN'), createEmployee);
router.route('/:id')
  .get(authorize('OWNER', 'ADMIN', 'FINANCE', 'VIEWER'), getEmployee)
  .put(authorize('OWNER', 'ADMIN'), updateEmployee)
  .delete(authorize('OWNER', 'ADMIN'), deleteEmployee);

export default router;
