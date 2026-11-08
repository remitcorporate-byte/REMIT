import { prisma } from '../lib/prisma';
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
import supportRoutes from './support.routes';
import { payrollQueue } from '../queues/payroll.queue';

const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'REMIT API is running',
    timestamp: new Date().toISOString(),
  });
});

// Production readiness check: do not accept traffic unless both durable
// dependencies needed for payroll processing are reachable.
router.get('/ready', async (_req: Request, res: Response) => {
  const databaseStartedAt = Date.now();
  let databaseConnected = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseConnected = true;
  } catch (error) {
    console.error(
      '[Readiness] Database check failed:',
      error instanceof Error ? error.message : error
    );
  }

  const queue = await payrollQueue.health();
  const ready = databaseConnected && queue.connected;

  res.status(ready ? 200 : 503).json({
    success: ready,
    data: {
      database: {
        connected: databaseConnected,
        responseTimeMs: Date.now() - databaseStartedAt,
      },
      queue,
    },
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
router.use('/support', supportRoutes);

export default router;
