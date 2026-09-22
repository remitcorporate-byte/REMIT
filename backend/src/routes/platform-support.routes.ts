import { Router } from 'express';
import {
  getPlatformSupportSummary,
  getPlatformSupportTicket,
  getPlatformSupportTickets,
} from '../controllers/platform-support-query.controller';
import {
  addPlatformSupportMessage,
} from '../controllers/platform-support-response.controller';
import { updatePlatformSupportStatus } from '../controllers/platform-support-status.controller';
import { assignPlatformSupportTicket } from '../controllers/platform-support-assignment.controller';
import { authorizePlatformPermission, protectPlatform } from '../middleware/platform-auth';

const router = Router();

router.use(protectPlatform);
router.get('/summary', authorizePlatformPermission('support.queue.read'), getPlatformSupportSummary);
router.get('/tickets', authorizePlatformPermission('support.queue.read'), getPlatformSupportTickets);
router.get('/tickets/:id', authorizePlatformPermission('support.queue.read'), getPlatformSupportTicket);
router.put('/tickets/:id/assignment', authorizePlatformPermission('support.ticket.assign'), assignPlatformSupportTicket);
router.put('/tickets/:id/status', authorizePlatformPermission('support.ticket.status'), updatePlatformSupportStatus);
router.post('/tickets/:id/messages', authorizePlatformPermission('support.ticket.reply'), addPlatformSupportMessage);

export default router;
