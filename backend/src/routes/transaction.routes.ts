import { Router } from 'express';
import { getTransactions, getTransaction, exportTransactions } from '../controllers/transaction.controller';
import { protect, authorizePermission } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', authorizePermission('transaction.read'), getTransactions);
router.get('/export', authorizePermission('transaction.export'), exportTransactions);
router.get('/:id', authorizePermission('transaction.read'), getTransaction);

export default router;
