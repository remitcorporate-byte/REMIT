import { Router } from 'express';
import {
  createPlatformStaff,
  deactivatePlatformStaff,
  getPlatformMe,
  listPlatformStaff,
  platformLogin,
} from '../controllers/platform-auth.controller';
import { authLimiter } from '../middleware/rateLimit';
import { authorizePlatformPermission, protectPlatform } from '../middleware/platform-auth';

const router = Router();

router.post('/login', authLimiter, platformLogin);
router.get('/me', protectPlatform, getPlatformMe);
router.get('/staff', protectPlatform, authorizePlatformPermission('support.queue.read'), listPlatformStaff);
router.post('/staff', protectPlatform, authorizePlatformPermission('support.staff.manage'), createPlatformStaff);
router.put('/staff/:id/deactivate', protectPlatform, authorizePlatformPermission('support.staff.manage'), deactivatePlatformStaff);

export default router;
