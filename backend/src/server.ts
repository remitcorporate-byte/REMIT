import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimit';
import { startPayrollScheduler } from './jobs/payroll-scheduler.job';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.frontendUrl
    ? config.frontendUrl
    : config.env === 'development'
      ? true
      : false,
}));

// Body parsing - raw body needed for webhook signature verification
app.use('/api/v1/webhooks', express.json({ limit: '1mb' }));
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

  // Start the in-process payroll scheduler
  startPayrollScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Process terminated');
    process.exit(0);
  });
});

export default app;
