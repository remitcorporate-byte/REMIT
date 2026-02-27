import { Router } from 'express';
import { handlePaystackWebhook } from '../controllers/webhook.controller';

const router = Router();

// No auth middleware - Paystack verifies via HMAC signature
router.post('/paystack', handlePaystackWebhook);

export default router;
