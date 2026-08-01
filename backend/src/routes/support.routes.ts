import { Router } from 'express';
import {
  closeSupportTicket,
  createSupportTicket,
  getSupportTicket,
  getSupportTickets,
  replyToSupportTicket,
} from '../controllers/support.controller';
import { authorizePermission, protect } from '../middleware/auth';

const router = Router();

router.use(protect);
router.get('/tickets', authorizePermission('support.read'), getSupportTickets);
router.post('/tickets', authorizePermission('support.create'), createSupportTicket);
router.get('/tickets/:id', authorizePermission('support.read'), getSupportTicket);
router.post('/tickets/:id/messages', authorizePermission('support.reply'), replyToSupportTicket);
router.put('/tickets/:id/close', authorizePermission('support.close'), closeSupportTicket);

export default router;
