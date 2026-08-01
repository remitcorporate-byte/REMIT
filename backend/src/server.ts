import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimit';
import { startPayrollScheduler, stopPayrollScheduler } from './jobs/payroll-scheduler.job';
import { payrollQueue } from './queues/payroll.queue';

const app = express();

// Cloud Run terminates TLS and forwards the original client address.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.frontendUrls.length > 0
    ? config.frontendUrls
    : config.env === 'development'
      ? true
      : false,
}));

// Preserve the raw JSON payload for Paystack HMAC verification.
app.use('/api/v1/webhooks', express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (config.env === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting
app.use('/api/', generalLimiter);

// Routes
app.use('/api/v1', routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Global error handler
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`[Server] REMIT API running in ${config.env} mode on port ${config.port}`);
  console.log(`[Server] Health check: http://localhost:${config.port}/api/v1/health`);

  // The scheduler only discovers due payrolls and enqueues them. In Redis mode,
  // a separate worker process owns execution.
  startPayrollScheduler();
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal} received, shutting down gracefully...`);
  stopPayrollScheduler();
  server.close(async () => {
    await payrollQueue.close();
    console.log('[Server] Process terminated');
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;
