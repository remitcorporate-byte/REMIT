import { Router } from 'express';
import {
  getWallet,
  initializeDeposit,
  verifyDeposit,
  getTransactions,
} from '../controllers/wallet.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);
router.use(authorize('OWNER', 'ADMIN', 'FINANCE'));

router.get('/', getWallet);
router.post('/deposit', initializeDeposit);
router.get('/verify/:reference', verifyDeposit);
router.get('/transactions', getTransactions);

export default router;
