import { Router } from 'express';
import {
  getWallet,
  initializeDeposit,
  verifyDeposit,
  getTransactions,
} from '../controllers/wallet.controller';
import { protect, authorizePermission } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', authorizePermission('wallet.read'), getWallet);
router.post('/deposit', authorizePermission('wallet.fund'), initializeDeposit);
router.get('/verify/:reference', authorizePermission('wallet.fund'), verifyDeposit);
router.get('/transactions', authorizePermission('transaction.read'), getTransactions);

export default router;
