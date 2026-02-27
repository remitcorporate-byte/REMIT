# CRITICAL CODE SNIPPETS

Essential code snippets for implementing the automated payroll system.

---

## 1. PAYROLL SCHEDULING JOB

This is the HEART of your system - it runs daily and schedules payrolls for processing.

**File: backend/jobs/payroll-scheduler.job.js**

```javascript
const cron = require('node-cron');
const Payroll = require('../models/payroll.model');
const Employee = require('../models/employee.model');
const payrollQueue = require('../queues/payroll.queue');

// Schedule to run every day at 12:00 AM (midnight)
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('[Payroll Scheduler] Running daily check...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Find all employees whose nextPaymentDate is today
    const employeesDueToday = await Employee.find({
      nextPaymentDate: { $gte: today, $lt: tomorrow },
      isActive: true
    }).populate('companyId');
    
    if (employeesDueToday.length === 0) {
      console.log('[Payroll Scheduler] No employees due for payment today');
      return;
    }
    
    // Group employees by company
    const companiesMap = new Map();
    
    for (const employee of employeesDueToday) {
      const companyId = employee.companyId._id.toString();
      
      if (!companiesMap.has(companyId)) {
        companiesMap.set(companyId, {
          company: employee.companyId,
          employees: [],
          totalAmount: 0
        });
      }
      
      const companyData = companiesMap.get(companyId);
      companyData.employees.push(employee);
      companyData.totalAmount += employee.salaryAmount;
    }
    
    // Create payroll records for each company
    for (const [companyId, data] of companiesMap) {
      // Create payroll record
      const payroll = await Payroll.create({
        companyId: data.company._id,
        scheduledDate: today,
        paymentFrequency: data.employees[0].paymentFrequency,
        status: 'scheduled',
        totalAmount: data.totalAmount,
        employeeCount: data.employees.length,
        employeeIds: data.employees.map(e => e._id)
      });
      
      // Schedule for 9:00 AM
      const nineAM = new Date(today);
      nineAM.setHours(9, 0, 0, 0);
      
      const delay = nineAM.getTime() - Date.now();
      
      // Add to Bull queue
      await payrollQueue.add('process-payroll', {
        payrollId: payroll._id.toString(),
        companyId: companyId
      }, {
        delay: delay > 0 ? delay : 0, // Process immediately if past 9 AM
        jobId: `payroll-${payroll._id}`,
        priority: 1
      });
      
      console.log(`[Payroll Scheduler] Scheduled payroll ${payroll._id} for company ${data.company.name}`);
    }
    
    console.log(`[Payroll Scheduler] Scheduled ${companiesMap.size} payrolls`);
    
  } catch (error) {
    console.error('[Payroll Scheduler] Error:', error);
  }
});

console.log('[Payroll Scheduler] Job initialized - runs daily at midnight');
```

---

## 2. PAYROLL PROCESSING JOB

This processes the actual payment when the scheduled time arrives.

**File: backend/jobs/process-payroll.job.js**

```javascript
const payrollQueue = require('../queues/payroll.queue');
const Payroll = require('../models/payroll.model');
const Wallet = require('../models/wallet.model');
const Employee = require('../models/employee.model');
const Transaction = require('../models/transaction.model');
const paystackService = require('../services/paystack.service');
const notificationService = require('../services/notification.service');

payrollQueue.process('process-payroll', async (job) => {
  const { payrollId, companyId } = job.data;
  
  console.log(`[Payroll Processor] Processing payroll ${payrollId}`);
  
  try {
    // 1. Get payroll details
    const payroll = await Payroll.findById(payrollId).populate('employeeIds');
    
    if (!payroll) {
      throw new Error('Payroll not found');
    }
    
    if (payroll.status !== 'scheduled') {
      console.log(`[Payroll Processor] Payroll ${payrollId} already processed (status: ${payroll.status})`);
      return { skipped: true, reason: 'Already processed' };
    }
    
    // Update status to processing
    await Payroll.findByIdAndUpdate(payrollId, { status: 'processing' });
    
    // 2. Get wallet
    const wallet = await Wallet.findOne({ companyId });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // 3. Check sufficient funds
    if (wallet.balance < payroll.totalAmount) {
      await Payroll.findByIdAndUpdate(payrollId, {
        status: 'paused',
        failureReason: 'Insufficient wallet balance'
      });
      
      // Notify employer
      await notificationService.sendLowBalanceAlert(companyId, {
        required: payroll.totalAmount,
        available: wallet.balance,
        shortfall: payroll.totalAmount - wallet.balance
      });
      
      throw new Error(`Insufficient funds. Required: ${payroll.totalAmount}, Available: ${wallet.balance}`);
    }
    
    // 4. Prepare Paystack transfers
    const transfers = [];
    
    for (const employee of payroll.employeeIds) {
      // Create transfer recipient if not exists
      if (!employee.paystackRecipientCode) {
        console.log(`[Payroll Processor] Creating Paystack recipient for ${employee.firstName} ${employee.lastName}`);
        
        const recipient = await paystackService.createTransferRecipient({
          type: 'nuban',
          name: `${employee.firstName} ${employee.lastName}`,
          account_number: employee.bankAccountNumber,
          bank_code: employee.bankCode,
          currency: 'NGN'
        });
        
        // Save recipient code
        employee.paystackRecipientCode = recipient.recipient_code;
        await employee.save();
      }
      
      // Add to transfers array
      transfers.push({
        amount: employee.salaryAmount, // In kobo
        recipient: employee.paystackRecipientCode,
        reference: `PAY-${payrollId}-${employee._id}-${Date.now()}`,
        reason: `Salary - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      });
    }
    
    // 5. Initiate bulk transfer via Paystack
    console.log(`[Payroll Processor] Initiating bulk transfer of ${transfers.length} payments`);
    
    const bulkTransferResponse = await paystackService.initiateBulkTransfer({
      source: 'balance',
      transfers
    });
    
    console.log(`[Payroll Processor] Bulk transfer initiated: ${bulkTransferResponse.message}`);
    
    // 6. Deduct from wallet
    const balanceBefore = wallet.balance;
    const balanceAfter = wallet.balance - payroll.totalAmount;
    
    await Wallet.findByIdAndUpdate(wallet._id, {
      balance: balanceAfter
    });
    
    // 7. Create transaction records for each employee
    const transactionPromises = payroll.employeeIds.map((employee, index) => {
      const transferData = bulkTransferResponse.data[index];
      
      return Transaction.create({
        companyId,
        walletId: wallet._id,
        employeeId: employee._id,
        payrollId,
        type: 'disbursement',
        amount: employee.salaryAmount,
        currency: 'NGN',
        balanceBefore,
        balanceAfter,
        status: 'success',
        paymentGateway: 'paystack',
        paystackTransferId: transferData?.id,
        transferCode: transferData?.transfer_code,
        paystackReference: transfers[index].reference,
        metadata: {
          employeeName: `${employee.firstName} ${employee.lastName}`,
          bankAccountNumber: employee.bankAccountNumber,
          bankName: employee.bankName,
          paymentMonth: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
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
        employee.paymentDay,
        employee.nextPaymentDate
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
    
    console.log(`[Payroll Processor] Payroll ${payrollId} completed successfully`);
    
    return { 
      success: true, 
      payrollId,
      employeeCount: payroll.employeeIds.length,
      totalAmount: payroll.totalAmount
    };
    
  } catch (error) {
    console.error(`[Payroll Processor] Error processing payroll ${payrollId}:`, error);
    
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

// Helper function to calculate next payment date
function calculateNextPaymentDate(frequency, paymentDay, currentDate) {
  const nextDate = new Date(currentDate);
  
  switch (frequency) {
    case 'monthly':
      // Move to next month, same day
      nextDate.setMonth(nextDate.getMonth() + 1);
      nextDate.setDate(paymentDay);
      break;
      
    case 'bi-weekly':
      // Add 14 days
      nextDate.setDate(nextDate.getDate() + 14);
      break;
      
    case 'weekly':
      // Add 7 days
      nextDate.setDate(nextDate.getDate() + 7);
      break;
      
    case 'custom':
      // For custom, you'd need additional logic
      // For now, default to monthly
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }
  
  return nextDate;
}

console.log('[Payroll Processor] Job handler initialized');
```

---

## 3. START ALL JOBS IN SERVER

Add this to your **server.js** to initialize all jobs when the server starts:

```javascript
// server.js

const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/database');

dotenv.config();
connectDB();

const app = express();

// ... middleware setup ...

// Initialize Bull queue processors
require('./jobs/payroll-scheduler.job');
require('./jobs/process-payroll.job');

// ... routes ...

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Payroll scheduler and processors active');
});
```

---

## 4. WALLET DEPOSIT CONTROLLER

**File: backend/controllers/wallet.controller.js**

```javascript
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const paystackService = require('../services/paystack.service');

// Initialize deposit
exports.initiateDeposit = async (req, res) => {
  try {
    const { amount, email } = req.body;
    const companyId = req.user.companyId._id;
    
    // Validate amount (minimum 1000 naira = 100,000 kobo)
    if (!amount || amount < 100000) {
      return res.status(400).json({
        success: false,
        error: 'Minimum deposit amount is ₦1,000'
      });
    }
    
    // Generate reference
    const reference = `DEP-${companyId}-${Date.now()}`;
    
    // Initialize transaction with Paystack
    const paystackResponse = await paystackService.initializeTransaction({
      email: email || req.user.email,
      amount,
      reference
    });
    
    // Create pending transaction record
    const wallet = await Wallet.findOne({ companyId });
    
    await Transaction.create({
      companyId,
      walletId: wallet._id,
      type: 'deposit',
      amount,
      currency: 'NGN',
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // Will be updated on verification
      status: 'pending',
      paymentGateway: 'paystack',
      paystackReference: reference
    });
    
    res.status(200).json({
      success: true,
      data: {
        authorizationUrl: paystackResponse.data.authorization_url,
        reference: paystackResponse.data.reference,
        accessCode: paystackResponse.data.access_code
      }
    });
    
  } catch (error) {
    console.error('Deposit initiation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize deposit'
    });
  }
};

// Verify deposit
exports.verifyDeposit = async (req, res) => {
  try {
    const { reference } = req.params;
    const companyId = req.user.companyId._id;
    
    // Verify with Paystack
    const paystackResponse = await paystackService.verifyTransaction(reference);
    
    if (paystackResponse.data.status !== 'success') {
      return res.status(400).json({
        success: false,
        error: 'Payment verification failed'
      });
    }
    
    // Get transaction
    const transaction = await Transaction.findOne({
      paystackReference: reference,
      companyId
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    if (transaction.status === 'success') {
      return res.status(200).json({
        success: true,
        message: 'Deposit already verified',
        data: { transaction }
      });
    }
    
    // Update wallet balance
    const wallet = await Wallet.findOne({ companyId });
    const newBalance = wallet.balance + transaction.amount;
    
    await Wallet.findByIdAndUpdate(wallet._id, {
      balance: newBalance,
      lastDepositAmount: transaction.amount,
      lastDepositDate: new Date()
    });
    
    // Update transaction
    await Transaction.findByIdAndUpdate(transaction._id, {
      status: 'success',
      balanceAfter: newBalance,
      processedAt: new Date()
    });
    
    res.status(200).json({
      success: true,
      message: 'Deposit verified successfully',
      data: {
        amount: transaction.amount,
        amountFormatted: `₦${(transaction.amount / 100).toLocaleString()}`,
        newBalance: newBalance,
        newBalanceFormatted: `₦${(newBalance / 100).toLocaleString()}`
      }
    });
    
  } catch (error) {
    console.error('Deposit verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify deposit'
    });
  }
};

// Get wallet balance
exports.getWalletBalance = async (req, res) => {
  try {
    const companyId = req.user.companyId._id;
    
    const wallet = await Wallet.findOne({ companyId });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        balanceFormatted: `₦${(wallet.balance / 100).toLocaleString()}`,
        currency: wallet.currency,
        lastDepositAmount: wallet.lastDepositAmount,
        lastDepositDate: wallet.lastDepositDate
      }
    });
    
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet'
    });
  }
};
```

---

## 5. EMPLOYEE CONTROLLER

**File: backend/controllers/employee.controller.js**

```javascript
const Employee = require('../models/employee.model');
const paystackService = require('../services/paystack.service');

// Create employee
exports.createEmployee = async (req, res) => {
  try {
    const companyId = req.user.companyId._id;
    
    const {
      firstName,
      lastName,
      email,
      phone,
      bankAccountNumber,
      bankCode,
      bankName,
      salaryAmount,
      paymentFrequency,
      paymentDay
    } = req.body;
    
    // Verify bank account with Paystack
    const accountVerification = await paystackService.verifyAccountNumber(
      bankAccountNumber,
      bankCode
    );
    
    if (!accountVerification.account_name) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bank account details'
      });
    }
    
    // Calculate first payment date
    const firstPaymentDate = calculateFirstPaymentDate(paymentFrequency, paymentDay);
    
    // Create employee
    const employee = await Employee.create({
      companyId,
      firstName,
      lastName,
      email,
      phone,
      bankAccountNumber,
      bankCode,
      bankName,
      salaryAmount,
      paymentFrequency,
      paymentDay,
      nextPaymentDate: firstPaymentDate
    });
    
    res.status(201).json({
      success: true,
      data: { employee },
      message: `Employee added successfully. Next payment: ${firstPaymentDate.toLocaleDateString()}`
    });
    
  } catch (error) {
    console.error('Create employee error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Employee with this bank account already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create employee'
    });
  }
};

// Helper function
function calculateFirstPaymentDate(frequency, paymentDay) {
  const today = new Date();
  const nextDate = new Date();
  
  switch (frequency) {
    case 'monthly':
      // If today's date is past payment day, schedule for next month
      if (today.getDate() >= paymentDay) {
        nextDate.setMonth(today.getMonth() + 1);
      }
      nextDate.setDate(paymentDay);
      break;
      
    case 'bi-weekly':
      // Schedule for 14 days from now
      nextDate.setDate(today.getDate() + 14);
      break;
      
    case 'weekly':
      // Schedule for 7 days from now
      nextDate.setDate(today.getDate() + 7);
      break;
      
    default:
      // Default to next month
      nextDate.setMonth(today.getMonth() + 1);
      nextDate.setDate(paymentDay || 28);
  }
  
  return nextDate;
}

// Get all employees
exports.getEmployees = async (req, res) => {
  try {
    const companyId = req.user.companyId._id;
    const { page = 1, limit = 50, search = '', isActive = true } = req.query;
    
    const query = { companyId };
    
    if (isActive !== 'all') {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const employees = await Employee.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .lean();
    
    const total = await Employee.countDocuments(query);
    
    // Format salary amounts
    const formattedEmployees = employees.map(emp => ({
      ...emp,
      salaryFormatted: `₦${(emp.salaryAmount / 100).toLocaleString()}`
    }));
    
    res.status(200).json({
      success: true,
      data: {
        employees: formattedEmployees,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employees'
    });
  }
};
```

---

## 6. NOTIFICATION SERVICE

**File: backend/services/notification.service.js**

```javascript
const nodemailer = require('nodemailer');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');

class NotificationService {
  constructor() {
    this.emailTransporter = nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  }
  
  async sendPayrollSuccessNotification(companyId, data) {
    try {
      const users = await User.find({ companyId, isActive: true });
      
      for (const user of users) {
        // Send email
        await this.sendEmail({
          to: user.email,
          subject: 'Payroll Successfully Processed',
          html: this.getSuccessEmailTemplate(data)
        });
        
        // Create in-app notification
        await Notification.create({
          companyId,
          userId: user._id,
          type: 'in-app',
          channel: 'payment_success',
          title: 'Payroll Completed',
          message: `Successfully paid ${data.employeeCount} employees - Total: ₦${(data.totalAmount / 100).toLocaleString()}`,
          status: 'sent'
        });
      }
      
      console.log(`[Notification] Sent success notifications for company ${companyId}`);
    } catch (error) {
      console.error('[Notification] Error sending success notification:', error);
    }
  }
  
  async sendLowBalanceAlert(companyId, data) {
    try {
      const admins = await User.find({ 
        companyId, 
        role: 'admin', 
        isActive: true 
      });
      
      for (const admin of admins) {
        // Send email
        await this.sendEmail({
          to: admin.email,
          subject: '⚠️ Insufficient Wallet Balance',
          html: this.getLowBalanceEmailTemplate(data)
        });
        
        // Create in-app notification
        await Notification.create({
          companyId,
          userId: admin._id,
          type: 'in-app',
          channel: 'low_balance',
          title: 'Action Required: Low Balance',
          message: `Payroll paused. Deposit ₦${(data.shortfall / 100).toLocaleString()} to continue.`,
          status: 'sent'
        });
      }
      
      console.log(`[Notification] Sent low balance alert for company ${companyId}`);
    } catch (error) {
      console.error('[Notification] Error sending low balance alert:', error);
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
      console.error('[Notification] Email error:', error);
      return false;
    }
  }
  
  getSuccessEmailTemplate(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .amount { font-size: 24px; font-weight: bold; color: #4CAF50; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Payroll Completed</h1>
          </div>
          <div class="content">
            <p>Your payroll has been successfully processed!</p>
            <p><strong>Details:</strong></p>
            <ul>
              <li>Employees Paid: ${data.employeeCount}</li>
              <li>Total Amount: <span class="amount">₦${(data.totalAmount / 100).toLocaleString()}</span></li>
              <li>Date: ${new Date(data.processedAt).toLocaleString()}</li>
            </ul>
            <p>All payments have been sent to employee bank accounts via Paystack.</p>
          </div>
          <div class="footer">
            <p>Automated Payroll System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  getLowBalanceEmailTemplate(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f44336; color: white; padding: 20px; text-align: center; }
          .content { background: #fff3cd; padding: 20px; border-left: 4px solid #f44336; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .warning { font-size: 20px; font-weight: bold; color: #f44336; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #4CAF50; 
            color: white; 
            text-decoration: none; 
            border-radius: 4px; 
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Action Required</h1>
          </div>
          <div class="content">
            <p class="warning">Insufficient Wallet Balance</p>
            <p>Your payroll could not be processed due to insufficient funds.</p>
            <p><strong>Details:</strong></p>
            <ul>
              <li>Required Amount: ₦${(data.required / 100).toLocaleString()}</li>
              <li>Current Balance: ₦${(data.available / 100).toLocaleString()}</li>
              <li>Shortfall: ₦${(data.shortfall / 100).toLocaleString()}</li>
            </ul>
            <p>Please deposit funds to your wallet to resume payroll processing.</p>
            <a href="${process.env.FRONTEND_URL}/wallet" class="button">Deposit Funds Now</a>
          </div>
          <div class="footer">
            <p>Automated Payroll System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new NotificationService();
```

---

## 7. WEBHOOK HANDLER

**File: backend/controllers/webhook.controller.js**

```javascript
const crypto = require('crypto');
const Transaction = require('../models/transaction.model');
const Wallet = require('../models/wallet.model');

exports.handlePaystackWebhook = async (req, res) => {
  try {
    // Verify Paystack signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (hash !== req.headers['x-paystack-signature']) {
      console.error('[Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const event = req.body;
    console.log(`[Webhook] Received event: ${event.event}`);
    
    switch (event.event) {
      case 'charge.success':
        await handleDepositSuccess(event.data);
        break;
      
      case 'transfer.success':
        await handleTransferSuccess(event.data);
        break;
      
      case 'transfer.failed':
        await handleTransferFailure(event.data);
        break;
      
      case 'transfer.reversed':
        await handleTransferReversed(event.data);
        break;
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

async function handleDepositSuccess(data) {
  try {
    console.log(`[Webhook] Processing deposit success: ${data.reference}`);
    
    // Transaction should already be verified via API call
    // This is a backup confirmation
    
    const transaction = await Transaction.findOne({
      paystackReference: data.reference
    });
    
    if (transaction && transaction.status === 'pending') {
      // Update transaction
      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'success',
        processedAt: new Date()
      });
      
      // Update wallet
      await Wallet.findByIdAndUpdate(transaction.walletId, {
        $inc: { balance: transaction.amount }
      });
      
      console.log(`[Webhook] Deposit confirmed: ${data.reference}`);
    }
  } catch (error) {
    console.error('[Webhook] Deposit success handling error:', error);
  }
}

async function handleTransferSuccess(data) {
  try {
    console.log(`[Webhook] Transfer success: ${data.transfer_code}`);
    
    await Transaction.findOneAndUpdate(
      { transferCode: data.transfer_code },
      { 
        status: 'success',
        processedAt: new Date()
      }
    );
  } catch (error) {
    console.error('[Webhook] Transfer success handling error:', error);
  }
}

async function handleTransferFailure(data) {
  try {
    console.log(`[Webhook] Transfer failed: ${data.transfer_code}`);
    
    const transaction = await Transaction.findOneAndUpdate(
      { transferCode: data.transfer_code },
      { 
        status: 'failed',
        failureReason: data.message || 'Transfer failed'
      }
    );
    
    if (transaction) {
      // Refund to wallet
      await Wallet.findByIdAndUpdate(transaction.walletId, {
        $inc: { balance: transaction.amount }
      });
      
      console.log(`[Webhook] Refunded ${transaction.amount} to wallet`);
    }
  } catch (error) {
    console.error('[Webhook] Transfer failure handling error:', error);
  }
}

async function handleTransferReversed(data) {
  try {
    console.log(`[Webhook] Transfer reversed: ${data.transfer_code}`);
    
    const transaction = await Transaction.findOneAndUpdate(
      { transferCode: data.transfer_code },
      { 
        status: 'failed',
        failureReason: 'Transfer reversed by Paystack'
      }
    );
    
    if (transaction) {
      // Refund to wallet
      await Wallet.findByIdAndUpdate(transaction.walletId, {
        $inc: { balance: transaction.amount }
      });
    }
  } catch (error) {
    console.error('[Webhook] Transfer reversed handling error:', error);
  }
}
```

---

These are the CRITICAL pieces that make your automated payroll system work. Focus on implementing these first, then build out the rest of the features.

Remember:
1. Test with Paystack sandbox/test keys first
2. Monitor the Bull queue dashboard
3. Check logs for any errors
4. Test insufficient funds scenario
5. Verify webhooks are working

Good luck, Ak David! 🚀
