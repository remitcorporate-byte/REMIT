import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const isTest = env === 'test';
const requiredRuntimeVars = ['DATABASE_URL', 'JWT_SECRET', 'PAYSTACK_SECRET_KEY'];
const requiredProductionVars = process.env.PAYROLL_QUEUE_MODE === 'in-process'
  ? [...requiredRuntimeVars, 'FIELD_ENCRYPTION_KEY']
  : [...requiredRuntimeVars, 'REDIS_URL', 'FIELD_ENCRYPTION_KEY'];

for (const varName of requiredProductionVars) {
  if (isProduction && !process.env[varName]) {
    throw new Error(`${varName} is required in production`);
  }
}

if (!process.env.JWT_SECRET && !isTest) {
  throw new Error('JWT_SECRET is required in every non-test environment');
}

if (!isProduction) {
  for (const varName of requiredRuntimeVars) {
    if (!process.env[varName]) {
      console.warn(`Warning: ${varName} is not set in environment variables`);
    }
  }
  if (process.env.PAYROLL_QUEUE_MODE === 'redis' && !process.env.REDIS_URL) {
    console.warn('Warning: REDIS_URL is required when PAYROLL_QUEUE_MODE is redis');
  }
}

if (isProduction && !process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is required in production so email codes are not logged');
}

const config = {
  env,
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || '',
  frontendUrls: (process.env.FRONTEND_URL || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),

  database: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'test-only-jwt-secret',
    expire: process.env.JWT_EXPIRE || '15m',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
  },

  auth: {
    refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),
    cookieCrossSite: process.env.COOKIE_CROSS_SITE === 'true',
    appUrl: process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
    requireApprovalOtp: process.env.REQUIRE_APPROVAL_OTP
      ? process.env.REQUIRE_APPROVAL_OTP === 'true'
      : isProduction,
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'REMIT <no-reply@remit.local>',
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    baseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  },
};

export default config;
