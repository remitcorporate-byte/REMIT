import { Router } from 'express';
import { getCompany, updateCompany, getDashboard, getAdvancedStats } from '../controllers/company.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', getCompany);
router.put('/', authorize('ADMIN'), updateCompany);
router.get('/dashboard', getDashboard);
router.get('/stats', getAdvancedStats);

export default router;
