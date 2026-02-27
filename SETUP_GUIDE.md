# QUICK SETUP GUIDE

This guide will help you set up the Automated Payroll System from scratch.

---

## PREREQUISITES

Before you start, make sure you have:

- [x] Node.js 20.x or higher installed
- [x] MongoDB account (free tier at https://mongodb.com/atlas)
- [x] Redis account (free tier at https://redis.com)
- [x] Paystack account (https://paystack.com)
- [x] Git installed
- [x] Code editor (VS Code recommended)

---

## STEP 1: CREATE ACCOUNTS

### 1.1 MongoDB Atlas
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create free account
3. Create a new cluster (M0 Free tier)
4. Create database user (username + password)
5. Whitelist IP: 0.0.0.0/0 (allow all) for development
6. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/payroll-db`

### 1.2 Redis Cloud
1. Go to https://redis.com/try-free/
2. Create free account
3. Create new subscription (30MB free)
4. Create database
5. Get: Host, Port, Password

### 1.3 Paystack
1. Go to https://dashboard.paystack.com/signup
2. Complete registration
3. Go to Settings → API Keys & Webhooks
4. Copy **Test Secret Key** (starts with `sk_test_`)
5. Copy **Test Public Key** (starts with `pk_test_`)

### 1.4 SendGrid (Email)
1. Go to https://signup.sendgrid.com/
2. Create free account (100 emails/day)
3. Go to Settings → API Keys
4. Create new API key
5. Copy the key (starts with `SG.`)

### 1.5 Twilio (SMS - Optional)
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
npm install express mongoose dotenv cors helmet morgan
npm install passport passport-local passport-google-oauth20 bcryptjs jsonwebtoken
npm install express-session connect-redis redis
npm install bull node-cron
npm install joi express-validator
npm install express-rate-limit
npm install nodemailer twilio
npm install axios

# Install dev dependencies
npm install --save-dev nodemon

# Create .env file
touch .env

# Create folder structure
mkdir config controllers middleware models routes services queues jobs utils
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

**File: backend/config/database.js**

```javascript
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
```

### Create Redis config

**File: backend/config/redis.js**

```javascript
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

module.exports = redis;
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

## STEP 5: CREATE YOUR FIRST MODEL

**File: backend/models/user.model.js**

```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: function() {
      return this.authProvider === 'local';
    },
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  firstName: {
    type: String,
    required: [true, 'Please provide first name'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Please provide last name'],
    trim: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'viewer'],
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
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

## STEP 8: SETUP BULL QUEUE

**File: backend/queues/payroll.queue.js**

```javascript
const Queue = require('bull');
const redis = require('../config/redis');

const payrollQueue = new Queue('payroll-processing', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000
    }
  }
});

// Test job
payrollQueue.process('test-job', async (job) => {
  console.log('Processing test job:', job.data);
  return { success: true };
});

payrollQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

payrollQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

module.exports = payrollQueue;
```

**Test Queue:**

```javascript
// Create test file: backend/test-queue.js
const dotenv = require('dotenv');
dotenv.config();

const payrollQueue = require('./queues/payroll.queue');

async function testQueue() {
  try {
    const job = await payrollQueue.add('test-job', {
      message: 'Hello from Bull queue!',
      timestamp: new Date()
    });
    
    console.log('✅ Job added to queue:', job.id);
  } catch (error) {
    console.error('❌ Queue test failed:', error);
  }
}

testQueue();
```

```bash
node test-queue.js
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

### MongoDB Connection Failed
- Check connection string format
- Verify username/password
- Check IP whitelist (use 0.0.0.0/0 for development)

### Redis Connection Failed
- Verify host, port, password
- Check firewall settings
- Ensure Redis Cloud instance is active

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

- **MongoDB Atlas Docs:** https://docs.atlas.mongodb.com/
- **Redis Cloud Docs:** https://docs.redis.com/
- **Paystack API Docs:** https://paystack.com/docs/api/
- **Express.js Docs:** https://expressjs.com/
- **Mongoose Docs:** https://mongoosejs.com/
- **Bull Queue Docs:** https://github.com/OptimalBits/bull
- **React Docs:** https://react.dev/

---

Good luck building, Ak David! 🚀

If you get stuck, check the full architecture document for detailed implementation guides.
