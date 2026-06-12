import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import companyRoutes from './company.routes';
import employeeRoutes from './employee.routes';
import walletRoutes from './wallet.routes';
import payrollRoutes from './payroll.routes';
import transactionRoutes from './transaction.routes';
import notificationRoutes from './notification.routes';
import webhookRoutes from './webhook.routes';
import teamRoutes from './team.routes';

const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'REMIT API is running',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/company', companyRoutes);
router.use('/employees', employeeRoutes);
router.use('/wallet', walletRoutes);
router.use('/payrolls', payrollRoutes);
router.use('/transactions', transactionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/team', teamRoutes);

export default router;
