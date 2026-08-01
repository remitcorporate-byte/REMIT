import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const requiredRuntimeVars = ['DATABASE_URL', 'JWT_SECRET', 'PAYSTACK_SECRET_KEY'];
const requiredProductionVars = process.env.PAYROLL_QUEUE_MODE === 'in-process'
  ? requiredRuntimeVars
  : [...requiredRuntimeVars, 'REDIS_URL'];

for (const varName of requiredProductionVars) {
  if (isProduction && !process.env[varName]) {
    throw new Error(`${varName} is required in production`);
  }
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
    secret: process.env.JWT_SECRET || (isProduction ? '' : 'fallback-secret-change-me'),
    expire: process.env.JWT_EXPIRE || '30d',
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    baseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  },
};

export default config;
