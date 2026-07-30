import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '../controllers/notification.controller';
import { protect, authorizePermission } from '../middleware/auth';

const router = Router();

router.use(protect);
router.use(authorizePermission('notification.read'));

router.get('/', getNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);

export default router;
