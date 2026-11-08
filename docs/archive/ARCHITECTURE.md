# AUTOMATED PAYROLL SYSTEM - HIGH-LEVEL ARCHITECTURE
**Project:** Payroll Management System with Paystack Integration  
**Stack:** MERN (MongoDB, Express.js, React, Node.js)  
**Author:** Ak David  
**Date:** February 14, 2026

---

## TABLE OF CONTENTS
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Technology Stack](#technology-stack)
4. [Database Schema Design](#database-schema-design)
5. [API Structure](#api-structure)
6. [Bull Queue Jobs & Scheduling](#bull-queue-jobs--scheduling)
7. [Paystack Integration Flow](#paystack-integration-flow)
8. [Authentication & Authorization](#authentication--authorization)
9. [Notification System](#notification-system)
10. [Security Considerations](#security-considerations)
11. [Deployment Strategy](#deployment-strategy)
12. [Scalability & Performance](#scalability--performance)
13. [Error Handling & Recovery](#error-handling--recovery)

---

## 1. SYSTEM OVERVIEW

### Purpose
Automate payroll management for employers by:
- Managing employee payment details
- Scheduling automated salary disbursements
- Processing payments through Paystack
- Tracking payment history and reporting
- Managing company wallet/funding system

### Key Features (MVP)
✅ Employer authentication (Email/Password + Google OAuth)  
✅ Role-based access control (Admin, Viewer roles)  
✅ Employee management (10-50 employees per company)  
✅ Flexible wallet system (deposit anytime, auto-deduct on payday)  
✅ Multiple payment frequencies (Monthly, Bi-weekly, Weekly, Custom)  
✅ Automated payment scheduling via Bull/Redis  
✅ Paystack bulk transfer integration  
✅ Payment history & reporting  
✅ Multi-channel notifications (Email, SMS, In-app)  
✅ Insufficient funds handling (Notify + Pause)

### User Roles
- **Admin:** Full access - manage employees, payments, settings, view reports
- **Viewer:** Read-only access - view employees, payment history, reports only
- **No employee accounts** - Employees are just data entries, not users

---

## 2. ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              React Frontend (Deployed on Vercel)              │  │
│  │  • Dashboard • Employee Management • Wallet • Reports         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS/REST API
┌───────────────────────────────▼─────────────────────────────────────┐
│                        APPLICATION LAYER                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │         Express.js API Server (Deployed on Render)           │  │
│  │  • Authentication • Authorization • Business Logic           │  │
│  │  • Paystack Integration • Webhook Handlers                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────┬───────────────────────────┬─────────────────────────┘
                │                           │
                │                           │
    ┌───────────▼──────────┐    ┌──────────▼──────────┐
    │  PostgreSQL          │    │  Redis               │
    │  (Database)          │    │  (Bull Queue + Cache)│
    │  • Users             │    │  • Scheduled Jobs    │
    │  • Companies         │    │  • Payment Queue     │
    │  • Employees         │    │  • Session Store     │
    │  • Transactions      │    └─────────────────────┘
    │  • Wallets           │
    └──────────────────────┘
                │
    ┌───────────▼──────────────────────────────────────┐
    │          EXTERNAL SERVICES                        │
    │                                                   │
    │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
    │  │  Paystack   │  │  SendGrid   │  │ Twilio   │ │
    │  │  (Payments) │  │  (Email)    │  │  (SMS)   │ │
    │  └─────────────┘  └─────────────┘  └──────────┘ │
    └───────────────────────────────────────────────────┘
```

---

## 3. TECHNOLOGY STACK

### Frontend
- **Framework:** React 18.x
- **UI Library:** Material-UI (MUI) or Tailwind CSS + shadcn/ui
- **State Management:** React Context API + useReducer (or Redux Toolkit for complex state)
- **Form Handling:** React Hook Form + Zod validation
- **HTTP Client:** Axios
- **Date Handling:** date-fns or Day.js
- **Charts/Reports:** Recharts or Chart.js

### Backend
- **Runtime:** Node.js 20.x LTS
- **Framework:** Express.js 4.x
- **Authentication:** Passport.js (Local Strategy + Google OAuth2.0)
- **Session Management:** express-session + connect-redis
- **Validation:** Joi or express-validator
- **Job Queue:** Bull (backed by Redis)
- **Scheduling:** node-cron (for triggering Bull jobs)
- **API Documentation:** Swagger/OpenAPI

### Database
- **Primary Database:** postgres
- **ODM:** Prisma
- **Caching/Queue:** Redis Cloud (30MB free tier)

### External Services
- **Payment Gateway:** Paystack API
- **Email Service:** SendGrid or Resend
- **SMS Service:** Twilio or Africa's Talking
- **File Storage:** Cloudinary (for company logos, reports)

### DevOps
- **Hosting:** Render (Web Service for backend, Static Site for frontend)
- **Environment Variables:** dotenv
- **Logging:** Winston + Morgan
- **Monitoring:** Render's built-in monitoring + Sentry (error tracking)
- **CI/CD:** GitHub Actions (optional for automated deployments)

---

## 4. DATABASE SCHEMA DESIGN

### Collection: `users`
```javascript
{
  _id: ObjectId,
  email: String (unique, required),
  password: String (hashed, required if not OAuth),
  authProvider: String (enum: ['local', 'google']),
  googleId: String (unique, sparse),
  firstName: String (required),
  lastName: String (required),
  companyId: ObjectId (ref: 'companies', required),
  role: String (enum: ['admin', 'viewer'], default: 'admin'),
  isActive: Boolean (default: true),
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
users.index({ email: 1 }, { unique: true })
users.index({ companyId: 1 })
users.index({ googleId: 1 }, { unique: true, sparse: true })
```

### Collection: `companies`
```javascript
{
  _id: ObjectId,
  name: String (required),
  email: String (required),
  phone: String,
  address: String,
  logo: String (URL),
  ownerId: ObjectId (ref: 'users', required),
  paystackSubaccountCode: String (unique, sparse),
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}

// Indexes
companies.index({ ownerId: 1 })
companies.index({ paystackSubaccountCode: 1 }, { unique: true, sparse: true })
```

### Collection: `wallets`
```javascript
{
  _id: ObjectId,
  companyId: ObjectId (ref: 'companies', required, unique),
  balance: Number (default: 0, min: 0), // In kobo (smallest currency unit)
  currency: String (default: 'NGN'),
  lastDepositAmount: Number,
  lastDepositDate: Date,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
wallets.index({ companyId: 1 }, { unique: true })
```

### Collection: `employees`
```javascript
{
  _id: ObjectId,
  companyId: ObjectId (ref: 'companies', required),
  firstName: String (required),
  lastName: String (required),
  email: String (optional, for notifications),
  phone: String (optional),
  bankAccountNumber: String (required, 10 digits),
  bankCode: String (required), // Nigerian bank code (e.g., 058 for GTBank)
  bankName: String (required),
  salaryAmount: Number (required, min: 0), // In kobo
  paymentFrequency: String (enum: ['monthly', 'bi-weekly', 'weekly', 'custom'], required),
  paymentDay: Number (1-31 for monthly, 1-7 for weekly, custom date for others),
  nextPaymentDate: Date (required, indexed),
  paystackRecipientCode: String (unique, sparse), // Paystack transfer recipient ID
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}

// Indexes
employees.index({ companyId: 1 })
employees.index({ nextPaymentDate: 1 })
employees.index({ paystackRecipientCode: 1 }, { unique: true, sparse: true })
employees.index({ companyId: 1, bankAccountNumber: 1 }, { unique: true })
```

### Collection: `payrolls`
```javascript
{
  _id: ObjectId,
  companyId: ObjectId (ref: 'companies', required),
  scheduledDate: Date (required, indexed),
  paymentFrequency: String (enum: ['monthly', 'bi-weekly', 'weekly', 'custom']),
  status: String (enum: ['scheduled', 'processing', 'completed', 'failed', 'paused'], default: 'scheduled'),
  totalAmount: Number (required), // Total salary to be disbursed (in kobo)
  employeeCount: Number (required),
  employeeIds: [ObjectId] (ref: 'employees'),
  processedAt: Date,
  failureReason: String,
  createdBy: ObjectId (ref: 'users'),
  createdAt: Date,
  updatedAt: Date
}

// Indexes
payrolls.index({ companyId: 1 })
payrolls.index({ scheduledDate: 1 })
payrolls.index({ status: 1 })
payrolls.index({ companyId: 1, scheduledDate: 1 })
```

### Collection: `transactions`
```javascript
{
  _id: ObjectId,
  companyId: ObjectId (ref: 'companies', required),
  walletId: ObjectId (ref: 'wallets', required),
  employeeId: ObjectId (ref: 'employees', nullable), // null for deposits
  payrollId: ObjectId (ref: 'payrolls', nullable),
  type: String (enum: ['deposit', 'disbursement', 'refund'], required),
  amount: Number (required), // In kobo
  currency: String (default: 'NGN'),
  balanceBefore: Number (required),
  balanceAfter: Number (required),
  status: String (enum: ['pending', 'success', 'failed'], default: 'pending'),
  paymentGateway: String (enum: ['paystack'], default: 'paystack'),
  paystackReference: String (unique, sparse),
  paystackTransferId: String (unique, sparse),
  transferCode: String (unique, sparse), // Paystack transfer code
  metadata: Object, // Additional info (bank details, etc.)
  failureReason: String,
  processedAt: Date,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
transactions.index({ companyId: 1 })
transactions.index({ walletId: 1 })
transactions.index({ employeeId: 1 })
transactions.index({ payrollId: 1 })
transactions.index({ status: 1 })
transactions.index({ createdAt: -1 })
transactions.index({ paystackReference: 1 }, { unique: true, sparse: true })
transactions.index({ companyId: 1, createdAt: -1 })
```

### Collection: `notifications`
```javascript
{
  _id: ObjectId,
  companyId: ObjectId (ref: 'companies', required),
  userId: ObjectId (ref: 'users', nullable),
  type: String (enum: ['email', 'sms', 'in-app'], required),
  channel: String (enum: ['payment_success', 'payment_failed', 'low_balance', 'deposit_received', 'payroll_scheduled'], required),
  title: String (required),
  message: String (required),
  status: String (enum: ['pending', 'sent', 'failed'], default: 'pending'),
  recipientEmail: String,
  recipientPhone: String,
  isRead: Boolean (default: false), // For in-app notifications
  sentAt: Date,
  failureReason: String,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
notifications.index({ companyId: 1 })
notifications.index({ userId: 1 })
notifications.index({ status: 1 })
notifications.index({ createdAt: -1 })
notifications.index({ companyId: 1, isRead: 1 })
```

---

## 5. API STRUCTURE

### Base URL
```
Production: https://api.yourapp.com/api/v1
Development: http://localhost:5000/api/v1
```

### Authentication Endpoints

#### POST `/auth/register`
**Description:** Register new employer account  
**Body:**
```json
{
  "email": "employer@company.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "companyName": "Tech Corp Ltd"
}
```
**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "email": "...", "role": "admin" },
    "company": { "_id": "...", "name": "Tech Corp Ltd" },
    "token": "jwt_token_here"
  }
}
```

#### POST `/auth/login`
**Description:** Login with email/password  
**Body:**
```json
{
  "email": "employer@company.com",
  "password": "SecurePass123!"
}
```
**Response:** `200 OK`

#### GET `/auth/google`
**Description:** Initiate Google OAuth login  
**Response:** Redirects to Google OAuth consent screen

#### GET `/auth/google/callback`
**Description:** Google OAuth callback handler  
**Response:** Redirects to frontend with JWT token

#### POST `/auth/logout`
**Description:** Logout user  
**Headers:** `Authorization: Bearer <token>`  
**Response:** `200 OK`

#### GET `/auth/me`
**Description:** Get current authenticated user  
**Headers:** `Authorization: Bearer <token>`  
**Response:** `200 OK`

---

### Company/Profile Endpoints

#### GET `/company/profile`
**Description:** Get company details  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`

#### PUT `/company/profile`
**Description:** Update company details  
**Auth:** Required (Admin only)  
**Body:**
```json
{
  "name": "Updated Company Name",
  "email": "new@company.com",
  "phone": "08012345678",
  "address": "123 Lagos Street"
}
```
**Response:** `200 OK`

---

### Wallet Endpoints

#### GET `/wallet`
**Description:** Get company wallet balance and details  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "balance": 500000000, // 5,000,000 NGN in kobo
    "balanceFormatted": "₦5,000,000.00",
    "currency": "NGN",
    "lastDepositAmount": 200000000,
    "lastDepositDate": "2026-02-10T10:30:00Z"
  }
}
```

#### POST `/wallet/deposit`
**Description:** Initialize Paystack deposit transaction  
**Auth:** Required (Admin only)  
**Body:**
```json
{
  "amount": 1000000, // Amount in kobo (10,000 NGN)
  "email": "employer@company.com"
}
```
**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/...",
    "reference": "PSK_12345abcde",
    "accessCode": "abc123xyz"
  }
}
```

#### GET `/wallet/verify-deposit/:reference`
**Description:** Verify Paystack deposit payment  
**Auth:** Required (Admin only)  
**Response:** `200 OK`

#### GET `/wallet/transactions`
**Description:** Get wallet transaction history  
**Auth:** Required (Admin/Viewer)  
**Query Params:** `?page=1&limit=20&type=deposit|disbursement|all&startDate=&endDate=`  
**Response:** `200 OK`

---

### Employee Endpoints

#### GET `/employees`
**Description:** Get all employees for company  
**Auth:** Required (Admin/Viewer)  
**Query Params:** `?page=1&limit=50&search=&isActive=true`  
**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "_id": "...",
        "firstName": "Jane",
        "lastName": "Smith",
        "bankAccountNumber": "0123456789",
        "bankName": "GTBank",
        "salaryAmount": 15000000, // 150,000 NGN in kobo
        "salaryFormatted": "₦150,000.00",
        "paymentFrequency": "monthly",
        "nextPaymentDate": "2026-02-28T00:00:00Z",
        "isActive": true
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 50,
      "pages": 1
    }
  }
}
```

#### POST `/employees`
**Description:** Add new employee  
**Auth:** Required (Admin only)  
**Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@email.com",
  "phone": "08098765432",
  "bankAccountNumber": "0123456789",
  "bankCode": "058", // GTBank code
  "bankName": "GTBank",
  "salaryAmount": 15000000, // 150,000 NGN in kobo
  "paymentFrequency": "monthly",
  "paymentDay": 28 // 28th of every month
}
```
**Response:** `201 Created`

#### GET `/employees/:id`
**Description:** Get single employee details  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`

#### PUT `/employees/:id`
**Description:** Update employee details  
**Auth:** Required (Admin only)  
**Response:** `200 OK`

#### DELETE `/employees/:id`
**Description:** Deactivate employee (soft delete)  
**Auth:** Required (Admin only)  
**Response:** `200 OK`

#### POST `/employees/bulk-import`
**Description:** Bulk import employees via CSV  
**Auth:** Required (Admin only)  
**Body:** `multipart/form-data` with CSV file  
**Response:** `201 Created`

---

### Payroll Endpoints

#### GET `/payrolls`
**Description:** Get all payroll schedules  
**Auth:** Required (Admin/Viewer)  
**Query Params:** `?page=1&limit=20&status=scheduled|processing|completed|failed`  
**Response:** `200 OK`

#### POST `/payrolls/schedule`
**Description:** Manually schedule a payroll run  
**Auth:** Required (Admin only)  
**Body:**
```json
{
  "scheduledDate": "2026-02-28T09:00:00Z",
  "paymentFrequency": "monthly",
  "employeeIds": ["emp_id_1", "emp_id_2"] // Optional, defaults to all active employees
}
```
**Response:** `201 Created`

#### GET `/payrolls/:id`
**Description:** Get payroll details  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`

#### POST `/payrolls/:id/cancel`
**Description:** Cancel scheduled payroll (before processing)  
**Auth:** Required (Admin only)  
**Response:** `200 OK`

#### POST `/payrolls/:id/retry`
**Description:** Retry failed payroll  
**Auth:** Required (Admin only)  
**Response:** `200 OK`

---

### Transaction Endpoints

#### GET `/transactions`
**Description:** Get all transactions (deposits + disbursements)  
**Auth:** Required (Admin/Viewer)  
**Query Params:** `?page=1&limit=20&type=deposit|disbursement&status=success|failed&startDate=&endDate=`  
**Response:** `200 OK`

#### GET `/transactions/:id`
**Description:** Get single transaction details  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`

#### GET `/transactions/export`
**Description:** Export transactions as CSV  
**Auth:** Required (Admin only)  
**Query Params:** `?startDate=&endDate=&type=`  
**Response:** `200 OK` (CSV file download)

---

### Reports Endpoints

#### GET `/reports/dashboard`
**Description:** Get dashboard summary stats  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "totalEmployees": 45,
    "activeEmployees": 43,
    "walletBalance": 500000000,
    "monthlyPayrollCost": 6750000000, // Total monthly salaries
    "nextPayrollDate": "2026-02-28T09:00:00Z",
    "recentTransactions": [...],
    "upcomingPayrolls": [...]
  }
}
```

#### GET `/reports/payroll-history`
**Description:** Get historical payroll data  
**Auth:** Required (Admin/Viewer)  
**Query Params:** `?startDate=&endDate=&frequency=monthly`  
**Response:** `200 OK`

#### GET `/reports/employee-payment-history/:employeeId`
**Description:** Get payment history for specific employee  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`

---

### Notification Endpoints

#### GET `/notifications`
**Description:** Get in-app notifications  
**Auth:** Required (Admin/Viewer)  
**Query Params:** `?page=1&limit=20&isRead=false`  
**Response:** `200 OK`

#### PUT `/notifications/:id/read`
**Description:** Mark notification as read  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`

#### PUT `/notifications/mark-all-read`
**Description:** Mark all notifications as read  
**Auth:** Required (Admin/Viewer)  
**Response:** `200 OK`

---

### Webhook Endpoints

#### POST `/webhooks/paystack`
**Description:** Paystack webhook handler (for payment confirmations)  
**Auth:** None (validated via Paystack signature)  
**Body:** Paystack webhook payload  
**Response:** `200 OK`

---

## 6. BULL QUEUE JOBS & SCHEDULING

### Bull Queue Architecture

```javascript
// Queue Definition: queues/payroll.queue.js

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
      delay: 60000 // 1 minute
    },
    removeOnComplete: false, // Keep completed jobs for history
    removeOnFail: false
  }
});

module.exports = payrollQueue;
```

### Job Types

#### 1. **Payroll Scheduler Job** (Runs Daily)
**Purpose:** Check for payrolls scheduled for today and add them to processing queue

```javascript
// jobs/payroll-scheduler.job.js

const cron = require('node-cron');
const Payroll = require('../models/payroll.model');
const payrollQueue = require('../queues/payroll.queue');

// Runs every day at 12:00 AM
cron.schedule('0 0 * * *', async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Find all payrolls scheduled for today
    const scheduledPayrolls = await Payroll.find({
      scheduledDate: { $gte: today, $lt: tomorrow },
      status: 'scheduled'
    }).populate('companyId');
    
    // Add each payroll to Bull queue for processing at 9:00 AM
    for (const payroll of scheduledPayrolls) {
      const nineAM = new Date(today);
      nineAM.setHours(9, 0, 0, 0);
      
      await payrollQueue.add('process-payroll', {
        payrollId: payroll._id.toString(),
        companyId: payroll.companyId._id.toString()
      }, {
        delay: nineAM.getTime() - Date.now(), // Schedule for 9 AM
        jobId: `payroll-${payroll._id}`,
        priority: 1
      });
      
      // Update payroll status
      await Payroll.findByIdAndUpdate(payroll._id, {
        status: 'processing'
      });
    }
    
    console.log(`Scheduled ${scheduledPayrolls.length} payrolls for processing`);
  } catch (error) {
    console.error('Payroll scheduler error:', error);
  }
});
```

#### 2. **Payroll Processing Job** (Triggered by Scheduler)
**Purpose:** Process individual payroll - validate funds, create transactions, call Paystack API

```javascript
// jobs/process-payroll.job.js

const payrollQueue = require('../queues/payroll.queue');
const Payroll = require('../models/payroll.model');
const Wallet = require('../models/wallet.model');
const Employee = require('../models/employee.model');
const Transaction = require('../models/transaction.model');
const paystackService = require('../services/paystack.service');
const notificationService = require('../services/notification.service');

payrollQueue.process('process-payroll', async (job) => {
  const { payrollId, companyId } = job.data;
  
  try {
    // 1. Get payroll details
    const payroll = await Payroll.findById(payrollId).populate('employeeIds');
    if (!payroll) throw new Error('Payroll not found');
    
    // 2. Get wallet balance
    const wallet = await Wallet.findOne({ companyId });
    if (!wallet) throw new Error('Wallet not found');
    
    // 3. Check if sufficient funds
    if (wallet.balance < payroll.totalAmount) {
      // Insufficient funds - pause payroll and notify
      await Payroll.findByIdAndUpdate(payrollId, {
        status: 'paused',
        failureReason: 'Insufficient wallet balance'
      });
      
      // Send notification
      await notificationService.sendLowBalanceAlert(companyId, {
        required: payroll.totalAmount,
        available: wallet.balance
      });
      
      throw new Error('Insufficient wallet balance');
    }
    
    // 4. Prepare bulk transfer data for Paystack
    const transfers = [];
    for (const employee of payroll.employeeIds) {
      // Create transfer recipient in Paystack if not exists
      if (!employee.paystackRecipientCode) {
        const recipient = await paystackService.createTransferRecipient({
          type: 'nuban',
          name: `${employee.firstName} ${employee.lastName}`,
          account_number: employee.bankAccountNumber,
          bank_code: employee.bankCode,
          currency: 'NGN'
        });
        
        employee.paystackRecipientCode = recipient.recipient_code;
        await employee.save();
      }
      
      transfers.push({
        amount: employee.salaryAmount, // In kobo
        recipient: employee.paystackRecipientCode,
        reference: `PAY-${payrollId}-${employee._id}-${Date.now()}`,
        reason: `Salary payment for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      });
    }
    
    // 5. Initiate bulk transfer via Paystack
    const bulkTransferResponse = await paystackService.initiateBulkTransfer({
      source: 'balance',
      transfers
    });
    
    // 6. Deduct from wallet
    const newBalance = wallet.balance - payroll.totalAmount;
    await Wallet.findByIdAndUpdate(wallet._id, {
      balance: newBalance
    });
    
    // 7. Create transaction records
    const transactionPromises = payroll.employeeIds.map((employee, index) => {
      return Transaction.create({
        companyId,
        walletId: wallet._id,
        employeeId: employee._id,
        payrollId,
        type: 'disbursement',
        amount: employee.salaryAmount,
        currency: 'NGN',
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        status: 'success',
        paymentGateway: 'paystack',
        paystackTransferId: bulkTransferResponse.data[index]?.id,
        transferCode: bulkTransferResponse.data[index]?.transfer_code,
        metadata: {
          bankAccountNumber: employee.bankAccountNumber,
          bankName: employee.bankName
        },
        processedAt: new Date()
      });
    });
    
    await Promise.all(transactionPromises);
    
    // 8. Update payroll status
    await Payroll.findByIdAndUpdate(payrollId, {
      status: 'completed',
      processedAt: new Date()
    });
    
    // 9. Update next payment dates for employees
    for (const employee of payroll.employeeIds) {
      const nextDate = calculateNextPaymentDate(
        employee.paymentFrequency,
        employee.paymentDay
      );
      await Employee.findByIdAndUpdate(employee._id, {
        nextPaymentDate: nextDate
      });
    }
    
    // 10. Send success notifications
    await notificationService.sendPayrollSuccessNotification(companyId, {
      totalAmount: payroll.totalAmount,
      employeeCount: payroll.employeeIds.length,
      processedAt: new Date()
    });
    
    return { success: true, payrollId };
    
  } catch (error) {
    // Update payroll status to failed
    await Payroll.findByIdAndUpdate(payrollId, {
      status: 'failed',
      failureReason: error.message
    });
    
    // Send failure notification
    await notificationService.sendPayrollFailureNotification(companyId, {
      payrollId,
      error: error.message
    });
    
    throw error;
  }
});

// Helper function
function calculateNextPaymentDate(frequency, paymentDay) {
  const today = new Date();
  let nextDate = new Date();
  
  switch (frequency) {
    case 'monthly':
      nextDate.setMonth(today.getMonth() + 1);
      nextDate.setDate(paymentDay);
      break;
    case 'bi-weekly':
      nextDate.setDate(today.getDate() + 14);
      break;
    case 'weekly':
      nextDate.setDate(today.getDate() + 7);
      break;
    // Handle custom dates
  }
  
  return nextDate;
}
```

#### 3. **Notification Queue Job**
**Purpose:** Handle email/SMS notifications asynchronously

```javascript
// queues/notification.queue.js

const notificationQueue = new Queue('notifications', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 30000 // 30 seconds
    }
  }
});

notificationQueue.process('send-email', async (job) => {
  const { to, subject, body, companyId } = job.data;
  // Send email via SendGrid
  await sendGridService.sendEmail({ to, subject, body });
});

notificationQueue.process('send-sms', async (job) => {
  const { to, message, companyId } = job.data;
  // Send SMS via Twilio
  await twilioService.sendSMS({ to, message });
});
```

### Queue Monitoring Dashboard

Bull Board can be used to monitor queues:

```javascript
// server.js

const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(payrollQueue),
    new BullAdapter(notificationQueue)
  ],
  serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());
```

Access at: `https://yourapp.com/admin/queues` (protected with admin auth middleware)

---

## 7. PAYSTACK INTEGRATION FLOW

### Paystack Services Architecture

```javascript
// services/paystack.service.js

const axios = require('axios');

class PaystackService {
  constructor() {
    this.baseURL = 'https://api.paystack.co';
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
  }
  
  // Initialize deposit transaction
  async initializeTransaction({ email, amount, reference }) {
    const response = await axios.post(
      `${this.baseURL}/transaction/initialize`,
      {
        email,
        amount, // In kobo
        reference,
        callback_url: `${process.env.FRONTEND_URL}/wallet/verify`
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  }
  
  // Verify transaction
  async verifyTransaction(reference) {
    const response = await axios.get(
      `${this.baseURL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`
        }
      }
    );
    return response.data;
  }
  
  // Create transfer recipient (employee bank account)
  async createTransferRecipient({ type, name, account_number, bank_code, currency }) {
    const response = await axios.post(
      `${this.baseURL}/transferrecipient`,
      {
        type, // 'nuban' for Nigerian accounts
        name,
        account_number,
        bank_code,
        currency
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.data;
  }
  
  // Initiate bulk transfer
  async initiateBulkTransfer({ source, transfers }) {
    const response = await axios.post(
      `${this.baseURL}/transfer/bulk`,
      {
        source, // 'balance' to use Paystack balance
        transfers
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  }
  
  // Get Nigerian banks list
  async getBanksList() {
    const response = await axios.get(
      `${this.baseURL}/bank?currency=NGN`,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`
        }
      }
    );
    return response.data.data;
  }
  
  // Verify account number
  async verifyAccountNumber(account_number, bank_code) {
    const response = await axios.get(
      `${this.baseURL}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`
        }
      }
    );
    return response.data.data;
  }
}

module.exports = new PaystackService();
```

### Deposit Flow

```
1. Employer clicks "Deposit Funds"
   ↓
2. Frontend: POST /api/v1/wallet/deposit { amount: 1000000 }
   ↓
3. Backend: Call Paystack Initialize Transaction API
   ↓
4. Backend: Return authorization URL
   ↓
5. Frontend: Redirect user to Paystack checkout
   ↓
6. User completes payment on Paystack
   ↓
7. Paystack redirects to: /wallet/verify?reference=PSK_xxx
   ↓
8. Frontend: GET /api/v1/wallet/verify-deposit/:reference
   ↓
9. Backend: Call Paystack Verify Transaction API
   ↓
10. Backend: Update wallet balance
    ↓
11. Backend: Create transaction record
    ↓
12. Frontend: Show success message + updated balance
```

### Disbursement Flow

```
1. Scheduler adds payroll to Bull queue at 9 AM
   ↓
2. Bull job: Fetch payroll + employees
   ↓
3. Check wallet balance >= total payroll amount
   ↓
4. For each employee without paystackRecipientCode:
   - Call Paystack Create Transfer Recipient API
   - Save recipient_code to employee record
   ↓
5. Prepare bulk transfer array
   ↓
6. Call Paystack Bulk Transfer API
   ↓
7. Deduct total amount from wallet
   ↓
8. Create transaction records for each employee
   ↓
9. Update payroll status to 'completed'
   ↓
10. Update employee nextPaymentDate
    ↓
11. Send notifications (email/SMS/in-app)
```

### Webhook Handling

```javascript
// controllers/webhook.controller.js

const crypto = require('crypto');
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');

exports.handlePaystackWebhook = async (req, res) => {
  try {
    // Verify Paystack signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const event = req.body;
    
    // Handle different event types
    switch (event.event) {
      case 'charge.success':
        // Deposit successful
        await handleDepositSuccess(event.data);
        break;
      
      case 'transfer.success':
        // Transfer to employee successful
        await handleTransferSuccess(event.data);
        break;
      
      case 'transfer.failed':
        // Transfer failed
        await handleTransferFailure(event.data);
        break;
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

async function handleDepositSuccess(data) {
  // Update transaction status
  await Transaction.findOneAndUpdate(
    { paystackReference: data.reference },
    { 
      status: 'success',
      processedAt: new Date()
    }
  );
  
  // Send notification
  // ... notification logic
}

async function handleTransferSuccess(data) {
  // Update transaction status
  await Transaction.findOneAndUpdate(
    { transferCode: data.transfer_code },
    { 
      status: 'success',
      processedAt: new Date()
    }
  );
}

async function handleTransferFailure(data) {
  // Update transaction status
  await Transaction.findOneAndUpdate(
    { transferCode: data.transfer_code },
    { 
      status: 'failed',
      failureReason: data.message
    }
  );
  
  // Refund to wallet
  // ... refund logic
}
```

---

## 8. AUTHENTICATION & AUTHORIZATION

### Passport.js Configuration

```javascript
// config/passport.js

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');

// Local Strategy (Email/Password)
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
    try {
      const user = await User.findOne({ email }).populate('companyId');
      
      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      
      if (!user.isActive) {
        return done(null, false, { message: 'Account is deactivated' });
      }
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Google OAuth Strategy
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/v1/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let user = await User.findOne({ googleId: profile.id }).populate('companyId');
      
      if (user) {
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }
      
      // Check if email exists (link accounts)
      user = await User.findOne({ email: profile.emails[0].value });
      
      if (user) {
        // Link Google account
        user.googleId = profile.id;
        user.authProvider = 'google';
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }
      
      // Create new user + company
      const Company = require('../models/company.model');
      const Wallet = require('../models/wallet.model');
      
      const company = await Company.create({
        name: `${profile.displayName}'s Company`,
        email: profile.emails[0].value,
        ownerId: null // Temporarily null
      });
      
      user = await User.create({
        email: profile.emails[0].value,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        googleId: profile.id,
        authProvider: 'google',
        companyId: company._id,
        role: 'admin',
        lastLogin: new Date()
      });
      
      // Update company ownerId
      company.ownerId = user._id;
      await company.save();
      
      // Create wallet
      await Wallet.create({
        companyId: company._id,
        balance: 0
      });
      
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).populate('companyId');
    done(null, user);
  } catch (error) {
    done(error);
  }
});

module.exports = passport;
```

### JWT Strategy

```javascript
// middleware/auth.middleware.js

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    req.user = await User.findById(decoded.id).populate('companyId');
    
    if (!req.user || !req.user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User no longer exists or is inactive'
      });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }
};

// Role-based authorization
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};
```

### Usage in Routes

```javascript
// routes/employee.routes.js

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const employeeController = require('../controllers/employee.controller');

// All routes require authentication
router.use(protect);

// Viewers can GET
router.get('/', employeeController.getEmployees);
router.get('/:id', employeeController.getEmployee);

// Only Admins can POST/PUT/DELETE
router.post('/', authorize('admin'), employeeController.createEmployee);
router.put('/:id', authorize('admin'), employeeController.updateEmployee);
router.delete('/:id', authorize('admin'), employeeController.deleteEmployee);

module.exports = router;
```

---

## 9. NOTIFICATION SYSTEM

### Notification Service

```javascript
// services/notification.service.js

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');

class NotificationService {
  constructor() {
    // Email transporter (SendGrid/Gmail)
    this.emailTransporter = nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
    
    // Twilio client
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  
  async sendPayrollSuccessNotification(companyId, data) {
    const users = await User.find({ companyId, isActive: true });
    
    for (const user of users) {
      // Email notification
      await this.sendEmail({
        to: user.email,
        subject: 'Payroll Successfully Processed',
        html: `
          <h2>Payroll Completed</h2>
          <p>Your payroll has been successfully processed.</p>
          <ul>
            <li>Amount: ₦${(data.totalAmount / 100).toLocaleString()}</li>
            <li>Employees Paid: ${data.employeeCount}</li>
            <li>Date: ${new Date(data.processedAt).toLocaleDateString()}</li>
          </ul>
        `
      });
      
      // In-app notification
      await Notification.create({
        companyId,
        userId: user._id,
        type: 'in-app',
        channel: 'payment_success',
        title: 'Payroll Successfully Processed',
        message: `${data.employeeCount} employees have been paid ₦${(data.totalAmount / 100).toLocaleString()}`,
        status: 'sent'
      });
    }
  }
  
  async sendLowBalanceAlert(companyId, data) {
    const admins = await User.find({ companyId, role: 'admin', isActive: true });
    
    for (const admin of admins) {
      // Email
      await this.sendEmail({
        to: admin.email,
        subject: 'Insufficient Wallet Balance',
        html: `
          <h2>Action Required: Insufficient Funds</h2>
          <p>Your payroll could not be processed due to insufficient wallet balance.</p>
          <ul>
            <li>Required: ₦${(data.required / 100).toLocaleString()}</li>
            <li>Available: ₦${(data.available / 100).toLocaleString()}</li>
            <li>Shortfall: ₦${((data.required - data.available) / 100).toLocaleString()}</li>
          </ul>
          <p>Please deposit funds to resume payroll processing.</p>
        `
      });
      
      // SMS (if phone available)
      if (admin.phone) {
        await this.sendSMS({
          to: admin.phone,
          message: `Payroll paused: Insufficient funds. Deposit ₦${((data.required - data.available) / 100).toLocaleString()} to continue.`
        });
      }
      
      // In-app
      await Notification.create({
        companyId,
        userId: admin._id,
        type: 'in-app',
        channel: 'low_balance',
        title: 'Insufficient Wallet Balance',
        message: `Payroll requires ₦${(data.required / 100).toLocaleString()}. Current balance: ₦${(data.available / 100).toLocaleString()}`,
        status: 'sent'
      });
    }
  }
  
  async sendEmail({ to, subject, html }) {
    try {
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html
      });
      return true;
    } catch (error) {
      console.error('Email send error:', error);
      return false;
    }
  }
  
  async sendSMS({ to, message }) {
    try {
      await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });
      return true;
    } catch (error) {
      console.error('SMS send error:', error);
      return false;
    }
  }
}

module.exports = new NotificationService();
```

---

## 10. SECURITY CONSIDERATIONS

### 1. **Environment Variables**
```env
# .env file
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/payroll-db

# Redis
REDIS_HOST=redis-12345.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_EXPIRE=30d

# Paystack
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxxx

# OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Email
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxx
EMAIL_FROM=noreply@yourapp.com

# SMS
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Frontend
FRONTEND_URL=https://yourapp.com
```

### 2. **Password Hashing**
```javascript
// models/user.model.js

const bcrypt = require('bcryptjs');

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
```

### 3. **Input Validation**
```javascript
// middleware/validation.middleware.js

const Joi = require('joi');

exports.validateEmployee = (req, res, next) => {
  const schema = Joi.object({
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().optional(),
    bankAccountNumber: Joi.string().length(10).pattern(/^[0-9]+$/).required(),
    bankCode: Joi.string().length(3).required(),
    salaryAmount: Joi.number().min(0).required(),
    paymentFrequency: Joi.string().valid('monthly', 'bi-weekly', 'weekly', 'custom').required()
  });
  
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  
  next();
};
```

### 4. **Rate Limiting**
```javascript
// middleware/rateLimit.middleware.js

const rateLimit = require('express-rate-limit');

exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Limit login attempts
  message: 'Too many login attempts, please try again after 15 minutes.'
});
```

### 5. **Helmet & CORS**
```javascript
// server.js

const helmet = require('helmet');
const cors = require('cors');

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
```

### 6. **Data Encryption**
```javascript
// utils/encryption.js

const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

exports.encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

exports.decrypt = (text) => {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
```

---

## 11. DEPLOYMENT STRATEGY

### Render Deployment

#### Backend Deployment (Web Service)
1. **Create Web Service on Render**
   - Connect GitHub repository
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
   - Plan: Free tier (upgradeable)

2. **Environment Variables**
   - Add all variables from `.env` file
   - Set `NODE_ENV=production`

3. **Redis Setup**
   - Use Redis Cloud free tier (30MB)
   - Add Redis connection strings to env vars

4. **MongoDB Setup**
   - Use MongoDB Atlas M0 free tier (512MB)
   - Whitelist Render IPs in Atlas network access

#### Frontend Deployment (Static Site)
1. **Create Static Site on Render**
   - Build Command: `npm run build`
   - Publish Directory: `build` or `dist`

2. **Environment Variables**
   - `REACT_APP_API_URL=https://your-backend.onrender.com/api/v1`

### Deployment Checklist

- [ ] Set all environment variables
- [ ] Configure MongoDB Atlas IP whitelist
- [ ] Setup Redis Cloud instance
- [ ] Configure Paystack webhook URL
- [ ] Test all API endpoints in production
- [ ] Setup error monitoring (Sentry)
- [ ] Configure custom domain (optional)
- [ ] Setup SSL/HTTPS (automatic on Render)
- [ ] Test authentication flows
- [ ] Test payment flows (sandbox first)
- [ ] Monitor Bull queue dashboard

---

## 12. SCALABILITY & PERFORMANCE

### Database Optimization

1. **Indexes** (Already covered in schema)
   - Compound indexes on frequently queried fields
   - Sparse indexes on optional unique fields

2. **Query Optimization**
```javascript
// Bad: Loading all fields
const employees = await Employee.find({ companyId });

// Good: Select only needed fields
const employees = await Employee.find({ companyId })
  .select('firstName lastName salaryAmount nextPaymentDate')
  .lean(); // Returns plain JS objects (faster)
```

3. **Pagination**
```javascript
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 50;
const skip = (page - 1) * limit;

const employees = await Employee.find({ companyId })
  .limit(limit)
  .skip(skip);

const total = await Employee.countDocuments({ companyId });
```

### Caching Strategy

```javascript
// services/cache.service.js

const redis = require('../config/redis');

class CacheService {
  async get(key) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }
  
  async set(key, value, ttl = 3600) {
    await redis.setex(key, ttl, JSON.stringify(value));
  }
  
  async del(key) {
    await redis.del(key);
  }
  
  // Cache wallet balance (1 minute TTL)
  async getWalletBalance(companyId) {
    const cacheKey = `wallet:${companyId}`;
    let balance = await this.get(cacheKey);
    
    if (!balance) {
      const wallet = await Wallet.findOne({ companyId });
      balance = wallet.balance;
      await this.set(cacheKey, balance, 60); // 1 minute
    }
    
    return balance;
  }
}

module.exports = new CacheService();
```

### Load Balancing (Future)

When scaling beyond Render free tier:
- Use Render's paid plan with multiple instances
- Add Redis session store for session sharing
- Use MongoDB connection pooling
- Consider CDN for static assets (Cloudflare)

---

## 13. ERROR HANDLING & RECOVERY

### Global Error Handler

```javascript
// middleware/errorHandler.middleware.js

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  
  // Log error
  console.error(err);
  
  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { statusCode: 404, message };
  }
  
  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { statusCode: 400, message };
  }
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = { statusCode: 400, message };
  }
  
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error'
  });
};

module.exports = errorHandler;
```

### Retry Logic for Failed Payments

```javascript
// jobs/retry-failed-payments.job.js

const cron = require('node-cron');
const Payroll = require('../models/payroll.model');
const payrollQueue = require('../queues/payroll.queue');

// Run every hour
cron.schedule('0 * * * *', async () => {
  const failedPayrolls = await Payroll.find({
    status: 'failed',
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
  });
  
  for (const payroll of failedPayrolls) {
    // Retry failed payrolls
    await payrollQueue.add('process-payroll', {
      payrollId: payroll._id.toString(),
      companyId: payroll.companyId.toString()
    }, {
      attempts: 1,
      priority: 2
    });
  }
});
```

---

## PROJECT STRUCTURE

```
payroll-system/
│
├── backend/
│   ├── config/
│   │   ├── database.js
│   │   ├── passport.js
│   │   └── redis.js
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── employee.controller.js
│   │   ├── payroll.controller.js
│   │   ├── transaction.controller.js
│   │   ├── wallet.controller.js
│   │   ├── notification.controller.js
│   │   └── webhook.controller.js
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── errorHandler.middleware.js
│   │   ├── validation.middleware.js
│   │   └── rateLimit.middleware.js
│   │
│   ├── models/
│   │   ├── user.model.js
│   │   ├── company.model.js
│   │   ├── wallet.model.js
│   │   ├── employee.model.js
│   │   ├── payroll.model.js
│   │   ├── transaction.model.js
│   │   └── notification.model.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── company.routes.js
│   │   ├── employee.routes.js
│   │   ├── payroll.routes.js
│   │   ├── transaction.routes.js
│   │   ├── wallet.routes.js
│   │   ├── notification.routes.js
│   │   └── webhook.routes.js
│   │
│   ├── services/
│   │   ├── paystack.service.js
│   │   ├── notification.service.js
│   │   └── cache.service.js
│   │
│   ├── queues/
│   │   ├── payroll.queue.js
│   │   └── notification.queue.js
│   │
│   ├── jobs/
│   │   ├── payroll-scheduler.job.js
│   │   ├── process-payroll.job.js
│   │   └── retry-failed-payments.job.js
│   │
│   ├── utils/
│   │   ├── encryption.js
│   │   ├── dateHelpers.js
│   │   └── formatters.js
│   │
│   ├── .env
│   ├── .gitignore
│   ├── package.json
│   └── server.js
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── employees/
│   │   │   ├── wallet/
│   │   │   ├── payroll/
│   │   │   └── shared/
│   │   │
│   │   ├── context/
│   │   │   ├── AuthContext.js
│   │   │   └── NotificationContext.js
│   │   │
│   │   ├── services/
│   │   │   └── api.service.js
│   │   │
│   │   ├── utils/
│   │   │   ├── formatters.js
│   │   │   └── validators.js
│   │   │
│   │   ├── App.js
│   │   └── index.js
│   │
│   ├── .env
│   ├── package.json
│   └── README.md
│
└── README.md
```

---

## NEXT STEPS

### Phase 1: Setup (Week 1)
1. Initialize Git repository
2. Setup MongoDB Atlas cluster
3. Setup Redis Cloud instance
4. Create Paystack test account
5. Initialize Node.js backend project
6. Initialize React frontend project
7. Setup basic Express server
8. Configure database connection

### Phase 2: Core Backend (Weeks 2-3)
1. Implement database models
2. Setup authentication (Local + Google OAuth)
3. Create API endpoints (CRUD for employees, companies)
4. Implement wallet deposit flow
5. Setup Paystack integration service
6. Add input validation middleware

### Phase 3: Job Scheduling (Week 4)
1. Setup Bull queue with Redis
2. Implement payroll scheduler job
3. Implement payroll processing job
4. Test scheduled payments with Paystack sandbox
5. Add error handling and retry logic

### Phase 4: Frontend (Weeks 5-6)
1. Create authentication pages (login, register)
2. Build dashboard with wallet balance
3. Implement employee management UI
4. Create payroll history view
5. Add transaction reports
6. Integrate with backend API

### Phase 5: Notifications (Week 7)
1. Setup SendGrid/email service
2. Setup Twilio/SMS service
3. Implement notification queue
4. Create notification templates
5. Build in-app notification center

### Phase 6: Testing & Deployment (Week 8)
1. Test all flows end-to-end
2. Fix bugs and edge cases
3. Deploy backend to Render
4. Deploy frontend to Render
5. Configure production environment variables
6. Test with Paystack live keys
7. Monitor and optimize

---

## CONCLUSION

This architecture provides a solid foundation for building a scalable, secure automated payroll system. Key strengths:

✅ **Scalable:** Bull queue handles high-volume processing  
✅ **Reliable:** Redis-backed job queue with retry logic  
✅ **Secure:** JWT auth, password hashing, input validation  
✅ **Flexible:** Supports multiple payment frequencies  
✅ **User-friendly:** Role-based access, multi-channel notifications  
✅ **Production-ready:** Proper error handling, logging, monitoring

Remember: Start with MVP features, test thoroughly, then iterate based on user feedback.

Good luck building, Ak David! 🚀
