import { Router } from 'express';
import { getTransactions, getTransaction, exportTransactions } from '../controllers/transaction.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);
router.use(authorize('OWNER', 'ADMIN', 'FINANCE', 'VIEWER'));

router.get('/', getTransactions);
router.get('/export', exportTransactions);
router.get('/:id', getTransaction);

export default router;
