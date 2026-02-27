import { Router } from 'express';
import { getTransactions, getTransaction } from '../controllers/transaction.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);
router.use(authorize('ADMIN'));

router.get('/', getTransactions);
router.get('/:id', getTransaction);

export default router;
