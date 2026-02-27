import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import config from '../config';
import { notificationService } from '../services/notification.service';

const prisma = new PrismaClient();

// @desc    Handle Paystack webhooks
// @route   POST /api/v1/webhooks/paystack
export const handlePaystackWebhook = async (req: Request, res: Response, _next: NextFunction) => {
  // Verify signature
  const hash = crypto
    .createHmac('sha512', config.paystack.secretKey)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    res.status(400).json({ success: false, error: 'Invalid signature' });
    return;
  }

  const event = req.body;

  try {
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data);
        break;
      case 'transfer.success':
        await handleTransferSuccess(event.data);
        break;
      case 'transfer.failed':
        await handleTransferFailed(event.data);
        break;
      case 'transfer.reversed':
        await handleTransferReversed(event.data);
        break;
      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
  }

  // Always return 200 to acknowledge receipt
  res.status(200).json({ success: true });
};

async function handleChargeSuccess(data: any) {
  const reference = data.reference;

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
  });

  if (!transaction || transaction.status === 'SUCCESS') return;

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SUCCESS' },
    });

    if (transaction.type === 'DEPOSIT') {
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: transaction.amount } },
      });
    }
  });

  await notificationService.notifyCompanyAdmins({
    companyId: transaction.companyId,
    type: 'DEPOSIT_SUCCESS',
    title: 'Deposit Successful',
    message: `Your deposit of ${transaction.amount / 100} NGN has been confirmed.`,
  });
}

async function handleTransferSuccess(data: any) {
  const reference = data.reference;

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
    include: { employee: true },
  });

  if (!transaction || transaction.status === 'SUCCESS') return;

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: 'SUCCESS',
      paystackTransferId: data.transfer_code,
    },
  });

  // Update PayrollEmployee status if linked
  if (transaction.employeeId) {
    await prisma.payrollEmployee.updateMany({
      where: {
        employeeId: transaction.employeeId,
        status: 'PENDING',
      },
      data: { status: 'SUCCESS' },
    });
  }
}

async function handleTransferFailed(data: any) {
  const reference = data.reference;

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
  });

  if (!transaction) return;

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' },
    });

    // Refund wallet
    if (transaction.type === 'PAYROLL_DEBIT') {
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: transaction.amount } },
      });

      // Create refund transaction record
      await tx.transaction.create({
        data: {
          companyId: transaction.companyId,
          walletId: transaction.walletId,
          employeeId: transaction.employeeId,
          type: 'REFUND',
          amount: transaction.amount,
          status: 'SUCCESS',
          description: `Refund for failed transfer: ${reference}`,
        },
      });
    }
  });

  if (transaction.employeeId) {
    await prisma.payrollEmployee.updateMany({
      where: {
        employeeId: transaction.employeeId,
        status: 'PENDING',
      },
      data: { status: 'FAILED' },
    });
  }

  await notificationService.notifyCompanyAdmins({
    companyId: transaction.companyId,
    type: 'PAYROLL_FAILED',
    title: 'Transfer Failed',
    message: `A transfer of ${transaction.amount / 100} NGN has failed. The amount has been refunded to your wallet.`,
  });
}

async function handleTransferReversed(data: any) {
  const reference = data.reference;

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
  });

  if (!transaction) return;

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'REVERSED' },
    });

    // Refund wallet
    await tx.wallet.update({
      where: { id: transaction.walletId },
      data: { balance: { increment: transaction.amount } },
    });

    await tx.transaction.create({
      data: {
        companyId: transaction.companyId,
        walletId: transaction.walletId,
        employeeId: transaction.employeeId,
        type: 'REFUND',
        amount: transaction.amount,
        status: 'SUCCESS',
        description: `Refund for reversed transfer: ${reference}`,
      },
    });
  });

  await notificationService.notifyCompanyAdmins({
    companyId: transaction.companyId,
    type: 'PAYROLL_FAILED',
    title: 'Transfer Reversed',
    message: `A transfer of ${transaction.amount / 100} NGN has been reversed. The amount has been refunded to your wallet.`,
  });
}
