import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.GENERAL_RATE_LIMIT_MAX || 100),
  skip: (req) => req.originalUrl.includes('/webhooks'),
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  message: {
    success: false,
    error: 'Too many auth attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
