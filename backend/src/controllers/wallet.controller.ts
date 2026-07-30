import { Request, Response, NextFunction } from 'express';
import {
  Prisma,
  PrismaClient,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { paystackService } from '../services/paystack.service';
import { generateReference, getPaginationParams, paginatedResponse } from '../utils/formatters';
import config from '../config';
import { auditService } from '../services/audit.service';
import { notificationService } from '../services/notification.service';

const prisma = new PrismaClient();

// @desc    Get wallet balance
// @route   GET /api/v1/wallet
export const getWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const wallet = await prisma.wallet.findUnique({
      where: { companyId: req.user.companyId },
    });

    if (!wallet) {
      throw new AppError('Wallet not found', 404);
    }

    res.json({
      success: true,
      data: {
        ...wallet,
        availableBalance: wallet.balance - wallet.reservedBalance,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Initialize deposit (Paystack checkout)
// @route   POST /api/v1/wallet/deposit
export const initializeDeposit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const { amount } = req.body; // amount in kobo
    if (!Number.isSafeInteger(amount) || amount < 10000) {
      // Minimum 100 NGN (10000 kobo)
      throw new AppError('Deposit amount must be a whole number of kobo and at least 100 NGN', 400);
    }

    const reference = generateReference('DEP');

    const wallet = await prisma.wallet.findUnique({
      where: { companyId: req.user.companyId },
    });
    if (!wallet) {
      throw new AppError('Wallet not found', 404);
    }

    // Create pending transaction
    await prisma.transaction.create({
      data: {
        companyId: req.user.companyId,
        walletId: wallet.id,
        type: 'DEPOSIT',
        amount,
        status: 'PENDING',
        description: 'Wallet deposit via Paystack',
        paystackReference: reference,
      },
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'DEPOSIT_INITIALIZED',
      entityType: 'Transaction',
      entityId: reference,
      metadata: { amount },
    });

    // Initialize Paystack transaction
    const response = await paystackService.initializeTransaction({
      email: req.user.email,
      amount,
      reference,
      callbackUrl: config.frontendUrl
        ? `${config.frontendUrl}/?view=wallet&depositReference=${reference}`
        : undefined,
      metadata: {
        companyId: req.user.companyId,
        walletId: wallet.id,
        type: 'wallet_deposit',
      },
    });

    res.json({
      success: true,
      data: {
        authorizationUrl: response.data.authorization_url,
        accessCode: response.data.access_code,
        reference: response.data.reference,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify deposit
// @route   GET /api/v1/wallet/verify/:reference
export const verifyDeposit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const reference = req.params.reference as string;

    // Find the pending transaction
    const transaction = await prisma.transaction.findUnique({
      where: { paystackReference: reference },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    if (transaction.companyId !== req.user.companyId) {
      throw new AppError('Not authorized', 403);
    }

    if (transaction.type !== 'DEPOSIT') {
      throw new AppError('Reference is not a wallet deposit', 400);
    }

    if (transaction.status === 'SUCCESS') {
      const wallet = await prisma.wallet.findUnique({
        where: { companyId: req.user.companyId },
        select: { balance: true },
      });

      return res.json({
        success: true,
        message: 'Transaction already verified',
        data: {
          transaction,
          newBalance: wallet?.balance || 0,
        },
      });
    }

    const verification = await paystackService.verifyTransaction(reference);
    const verificationStatus = String(verification.data.status || '').toLowerCase();

    if (verificationStatus === 'success') {
      if (process.env.USE_PAYSTACK_MOCK !== 'true') {
        const verifiedAmount = Number(verification.data.amount);
        const verifiedCurrency = String(verification.data.currency || '').toUpperCase();

        if (!Number.isSafeInteger(verifiedAmount) || verifiedAmount !== transaction.amount) {
          throw new AppError('Verified payment amount does not match the deposit', 400);
        }
        if (verifiedCurrency && verifiedCurrency !== 'NGN') {
          throw new AppError('Verified payment currency does not match the wallet', 400);
        }
      }

      // Only the request that atomically transitions this deposit may credit the wallet.
      const result = await prisma.$transaction(async (tx) => {
        const transition = await tx.transaction.updateMany({
          where: {
            id: transaction.id,
            type: 'DEPOSIT',
            status: { in: ['PENDING', 'FAILED'] },
          },
          data: { status: 'SUCCESS' },
        });

        const updatedWallet = transition.count === 1
          ? await tx.wallet.update({
              where: { companyId: req.user!.companyId! },
              data: { balance: { increment: transaction.amount } },
            })
          : await tx.wallet.findUnique({
              where: { companyId: req.user!.companyId! },
            });

        const updatedTransaction = await tx.transaction.findUnique({
          where: { id: transaction.id },
        });

        return {
          credited: transition.count === 1,
          transaction: updatedTransaction,
          wallet: updatedWallet,
        };
      });

      if (result.credited) {
        await Promise.all([
          auditService.record({
            companyId: req.user!.companyId!,
            userId: req.user!.id,
            action: 'DEPOSIT_VERIFIED',
            entityType: 'Transaction',
            entityId: transaction.id,
            metadata: { reference, amount: transaction.amount },
          }),
          notificationService.notifyCompanyAdmins({
            companyId: req.user!.companyId!,
            type: 'DEPOSIT_SUCCESS',
            title: 'Deposit Successful',
            message: `Your deposit of ${transaction.amount / 100} NGN has been confirmed.`,
          }),
        ]);
      }

      res.json({
        success: true,
        message: result.credited ? 'Deposit verified successfully' : 'Transaction already verified',
        data: {
          transaction: result.transaction,
          newBalance: result.wallet?.balance || 0,
        },
      });
    } else {
      const terminalFailureStatuses = new Set(['abandoned', 'failed', 'reversed']);
      if (terminalFailureStatuses.has(verificationStatus)) {
        await prisma.transaction.updateMany({
          where: { id: transaction.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      }

      throw new AppError(`Payment is not complete (${verificationStatus || 'unknown'})`, 400);
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get transaction history
// @route   GET /api/v1/wallet/transactions
export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const { skip, take, page, limit } = getPaginationParams(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 10
    );

    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    if (type && !Object.values(TransactionType).includes(type as TransactionType)) {
      throw new AppError('Invalid transaction type filter', 400);
    }
    if (status && !Object.values(TransactionStatus).includes(status as TransactionStatus)) {
      throw new AppError('Invalid transaction status filter', 400);
    }

    const where: Prisma.TransactionWhereInput = {
      companyId: req.user.companyId,
      ...(type && { type: type as TransactionType }),
      ...(status && { status: status as TransactionStatus }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json(paginatedResponse(transactions, total, page, limit));
  } catch (error) {
    next(error);
  }
};
