# QUICK SETUP GUIDE

This guide will help you set up the Automated Payroll System from scratch.

---

## PREREQUISITES

Before you start, make sure you have:

- [x] Node.js 20.x or higher installed
- [x] PostgreSQL database (local PostgreSQL, Neon, Supabase, Render, or Railway)
- [x] Paystack account (https://paystack.com)
- [x] Git installed
- [x] Code editor (VS Code recommended)

---

## STEP 1: CREATE ACCOUNTS

### 1.1 PostgreSQL
1. Create a PostgreSQL database locally or with a hosted provider.
2. Create a database user and password.
3. Get the connection string, for example:
   `postgresql://username:password@host:5432/remit?schema=public`
4. Set it as `DATABASE_URL` in `backend/.env`.

### 1.2 Paystack
1. Go to https://dashboard.paystack.com/signup
2. Complete registration
3. Go to Settings → API Keys & Webhooks
4. Copy **Test Secret Key** (starts with `sk_test_`)
5. Copy **Test Public Key** (starts with `pk_test_`)

### 1.3 SendGrid (Email)
1. Go to https://signup.sendgrid.com/
2. Create free account (100 emails/day)
3. Go to Settings → API Keys
4. Create new API key
5. Copy the key (starts with `SG.`)

### 1.4 Twilio (SMS - Optional)
1. Go to https://www.twilio.com/try-twilio
2. Create free account ($15 trial credit)
3. Get Account SID, Auth Token, Phone Number

---

## STEP 2: CLONE & SETUP BACKEND

```bash
# Create project directory
mkdir payroll-system
cd payroll-system

# Initialize Git
git init

# Create backend folder
mkdir backend
cd backend

# Initialize Node.js project
npm init -y

# Install dependencies
pnpm install

# Generate Prisma Client
pnpm prisma:generate

# Run database migrations
pnpm prisma:migrate

# Create .env file
touch .env

# Create folder structure
mkdir config controllers middleware models routes services jobs utils
touch server.js
```

### Create server.js

**File: backend/server.js**

```javascript
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// TODO: Add route imports here
// app.use('/api/v1/auth', require('./routes/auth.routes'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Server Error'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
```

### Create database config

The current backend uses Prisma with PostgreSQL. Configure `DATABASE_URL` in `backend/.env`, then run:

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

### Update package.json scripts

**File: backend/package.json**

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

### Create .env file

Copy contents from `ENV_TEMPLATE.txt` and fill in your actual values.

---

## STEP 3: TEST BACKEND

```bash
# Start server in development mode
npm run dev

# Test health endpoint
curl http://localhost:5000/api/v1/health

# Expected response:
# {
#   "success": true,
#   "message": "Server is running",
#   "timestamp": "2026-02-14T..."
# }
```

If you see this response, your backend is working! ✅

---

## STEP 4: SETUP FRONTEND

```bash
# Go back to root directory
cd ..

# Create React app
npx create-react-app frontend

# Navigate to frontend
cd frontend

# Install dependencies
npm install axios react-router-dom
npm install @mui/material @emotion/react @emotion/styled @mui/icons-material
# OR use Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Create .env file
touch .env
echo "REACT_APP_API_URL=http://localhost:5000/api/v1" > .env

# Start development server
npm start
```

Frontend should open at http://localhost:3000 ✅

---

## STEP 5: UPDATE THE DATA MODEL

The current backend data model lives in `backend/prisma/schema.prisma`.

After changing the schema, run:

```bash
pnpm prisma:migrate
pnpm prisma:generate
```

---

## STEP 6: CREATE YOUR FIRST ROUTE

**File: backend/routes/auth.routes.js**

```javascript
const express = require('express');
const router = express.Router();

// TODO: Create controller
router.post('/register', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Register endpoint - to be implemented' 
  });
});

router.post('/login', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Login endpoint - to be implemented' 
  });
});

module.exports = router;
```

**Update server.js:**

```javascript
// Add this after middleware
app.use('/api/v1/auth', require('./routes/auth.routes'));
```

**Test:**

```bash
curl -X POST http://localhost:5000/api/v1/auth/register
```

---

## STEP 7: SETUP PAYSTACK INTEGRATION

**File: backend/services/paystack.service.js**

```javascript
const axios = require('axios');

class PaystackService {
  constructor() {
    this.baseURL = 'https://api.paystack.co';
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
  }
  
  async getBanksList() {
    try {
      const response = await axios.get(
        `${this.baseURL}/bank?currency=NGN`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`
          }
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('Paystack error:', error.response?.data || error.message);
      throw error;
    }
  }
  
  async verifyAccountNumber(account_number, bank_code) {
    try {
      const response = await axios.get(
        `${this.baseURL}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`
          }
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('Account verification error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new PaystackService();
```

**Test Paystack:**

```javascript
// Create test file: backend/test-paystack.js
const dotenv = require('dotenv');
dotenv.config();

const paystackService = require('./services/paystack.service');

async function testPaystack() {
  try {
    // Test 1: Get banks list
    const banks = await paystackService.getBanksList();
    console.log(`✅ Found ${banks.length} Nigerian banks`);
    console.log('Sample:', banks[0]);
    
    // Test 2: Verify an account
    const accountInfo = await paystackService.verifyAccountNumber(
      '0123456789', // Test account number
      '058' // GTBank code
    );
    console.log('✅ Account verification:', accountInfo);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPaystack();
```

```bash
node test-paystack.js
```

---

## STEP 8: PAYROLL SCHEDULER

The current backend uses an in-process payroll scheduler. No Redis or Bull queue setup is required for local development.

Configure the polling interval only if needed:

```env
PAYROLL_SCHEDULER_INTERVAL_MS=60000
```

---

## STEP 9: GIT SETUP

```bash
# Create .gitignore
cat > .gitignore << EOF
# Dependencies
node_modules/
package-lock.json

# Environment variables
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Build
build/
dist/
EOF

# Initial commit
git add .
git commit -m "Initial project setup"
```

---

## STEP 10: DEPLOYMENT PREP

### Create Render account
1. Go to https://render.com/
2. Sign up with GitHub
3. Connect your repository

### Deploy Backend
1. Create Web Service
2. Select repository
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add all environment variables from .env

### Deploy Frontend
1. Create Static Site
2. Build Command: `npm run build`
3. Publish Directory: `build`

---

## NEXT STEPS

1. Build out all models (Company, Employee, Wallet, etc.)
2. Implement authentication controllers
3. Create employee CRUD endpoints
4. Implement wallet deposit flow
5. Build payroll scheduling logic
6. Create frontend components
7. Test end-to-end flows
8. Deploy to production

---

## HELPFUL COMMANDS

```bash
# Backend
npm run dev              # Start dev server
npm start                # Start production server
npm install <package>    # Add dependency

# Frontend
npm start                # Start dev server
npm run build            # Build for production
npm test                 # Run tests

# Git
git status               # Check changes
git add .                # Stage all changes
git commit -m "message"  # Commit changes
git push                 # Push to remote

# Testing
curl -X GET http://localhost:5000/api/v1/health
curl -X POST http://localhost:5000/api/v1/auth/register -H "Content-Type: application/json" -d '{"email":"test@test.com"}'
```

---

## TROUBLESHOOTING

### PostgreSQL Connection Failed
- Check `DATABASE_URL` format
- Verify username/password
- Confirm the database allows connections from your machine or host
- Run Prisma migrations before starting the API

### Paystack API Error
- Verify you're using correct keys (test vs live)
- Check API key format (starts with sk_test_ or sk_live_)
- Ensure secret key, not public key

### Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>
```

---

## RESOURCES

- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Prisma Docs:** https://www.prisma.io/docs/
- **Paystack API Docs:** https://paystack.com/docs/api/
- **Express.js Docs:** https://expressjs.com/
- **React Docs:** https://react.dev/

---

Good luck building, Ak David! 🚀

If you get stuck, check the full architecture document for detailed implementation guides.
