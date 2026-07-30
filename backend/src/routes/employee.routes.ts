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
import { protect, authorizePermission } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/banks', authorizePermission('bank.verify'), listBanks);
router.post('/verify-bank', authorizePermission('bank.verify'), verifyBank);
router.route('/')
  .get(authorizePermission('employee.read'), getEmployees)
  .post(authorizePermission('employee.manage'), createEmployee);
router.route('/:id')
  .get(authorizePermission('employee.read'), getEmployee)
  .put(authorizePermission('employee.manage'), updateEmployee)
  .delete(authorizePermission('employee.manage'), deleteEmployee);

export default router;
