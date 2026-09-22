import { PrismaClient } from '@prisma/client';
import { paystackService } from '../services/paystack.service';
import { notificationService } from '../services/notification.service';
import { generateReference } from '../utils/formatters';
import { getNextPaymentDate } from '../utils/dateHelpers';
import { auditService } from '../services/audit.service';

const prisma = new PrismaClient();

interface ProcessPayrollData {
  payrollId: string;
  companyId: string;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getErrorDetail(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response
  ) {
    return error.response.data;
  }

  return getErrorMessage(error);
}

/**
 * True only when Paystack definitively rejected the transfer request: an HTTP
 * 4xx other than 409 duplicate-reference. Everything else — timeouts,
 * connection resets, provider 5xx, duplicate references — is ambiguous: the
 * transfer may still exist at Paystack, so it must stay PENDING for the
 * webhook or the reconciliation job to verify.
 */
function isDefinitiveTransferRejection(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null
  ) {
    const status = (error.response as { status?: unknown }).status;
    return typeof status === 'number' && status >= 400 && status < 409;
  }
  return false;
}

export async function processPayroll(data: ProcessPayrollData) {
  const { payrollId, companyId } = data;

  console.log(`[ProcessPayroll] Starting payroll ${payrollId}`);

  try {
    const started = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const claim = await tx.payroll.updateMany({
        where: {
          id: payrollId,
          companyId,
          status: 'SCHEDULED',
          scheduledDate: { lte: now },
        },
        data: {
          status: 'PROCESSING',
          processingStartedAt: now,
          processingHeartbeatAt: now,
          processingAttempt: { increment: 1 },
          failureReason: null,
        },
      });

      if (claim.count !== 1) {
        console.log(`[ProcessPayroll] Payroll ${payrollId} was already claimed or is not due`);
        return false;
      }

      const payroll = await tx.payroll.findUnique({
        where: { id: payrollId },
        include: {
          payrollEmployees: {
            where: { status: 'PENDING' },
            select: { amount: true },
          },
        },
      });

      if (!payroll) {
        throw new Error('Payroll not found');
      }

      const pendingAmount = payroll.payrollEmployees.reduce((sum: number, pe: { amount: number }) => sum + pe.amount, 0);

      if (!payroll.reservationReleasedAt) {
        const wallet = await tx.wallet.findUnique({
          where: { companyId },
        });

        if (wallet && wallet.reservedBalance > 0) {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              reservedBalance: {
                decrement: Math.min(wallet.reservedBalance, pendingAmount),
              },
            },
          });
        }

        await tx.payroll.update({
          where: { id: payrollId },
          data: { reservationReleasedAt: now },
        });
      }

      return true;
    });

    if (!started) return;

    // Get payroll with employees
    const payroll = await prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        payrollEmployees: {
          where: { status: 'PENDING' },
          include: { employee: true },
        },
      },
    });

    if (!payroll) {
      throw new Error('Payroll not found');
    }

    const pendingAmount = payroll.payrollEmployees.reduce((sum: number, pe: { amount: number }) => sum + pe.amount, 0);

    if (pendingAmount === 0) {
      await prisma.payroll.update({
        where: { id: payrollId },
        data: { status: 'COMPLETED', processedDate: new Date() },
      });
      return;
    }

    // Check wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: { companyId },
    });

    const availableBalance = wallet ? wallet.balance - wallet.reservedBalance : 0;

    if (!wallet || availableBalance < pendingAmount) {
      throw new Error(
        `Insufficient balance. Required: ${pendingAmount}, Available: ${availableBalance}`
      );
    }

    let successCount = 0;
    let failCount = 0;

    // Process each employee
    for (const pe of payroll.payrollEmployees) {
      const employee = pe.employee;

      try {
        await heartbeatPayroll(payrollId);
        console.log(`[ProcessPayroll] Processing employee: ${employee.firstName} ${employee.lastName} (${employee.id})`);

        // Ensure employee has a Paystack recipient code
        let recipientCode: string = employee.paystackRecipientCode || '';
        if (!recipientCode) {
          console.log(`[ProcessPayroll] Creating Paystack recipient for ${employee.id}...`);
          const recipient = await paystackService.createTransferRecipient({
            name: employee.accountName,
            accountNumber: employee.accountNumber,
            bankCode: employee.bankCode,
          });
          recipientCode = recipient.data.recipient_code;
          console.log(`[ProcessPayroll] Recipient created: ${recipientCode}`);

          await prisma.employee.update({
            where: { id: employee.id },
            data: { paystackRecipientCode: recipientCode },
          });
        }

        const reference = generateReference('PAY');
        console.log(`[ProcessPayroll] Initiating transfer with reference: ${reference}`);

        // Deduct from wallet and create (or reset) the transaction. The
        // transaction row is unique per payroll employee, so a retry after a
        // definitive transfer failure reuses the existing FAILED/REVERSED row
        // with a fresh reference instead of creating a second one (which would
        // violate the unique constraint on Transaction.payrollEmployeeId).
        await prisma.$transaction(async (tx) => {
          const existing = await tx.transaction.findUnique({
            where: { payrollEmployeeId: pe.id },
            select: { id: true, status: true },
          });

          if (existing && existing.status !== 'FAILED' && existing.status !== 'REVERSED') {
            throw new Error(
              `Payroll employee ${pe.id} already has a ${existing.status} transaction; refusing to create a duplicate`
            );
          }

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: pe.amount } },
          });

          if (existing) {
            await tx.transaction.updateMany({
              where: { id: existing.id, status: { in: ['FAILED', 'REVERSED'] } },
              data: {
                status: 'PENDING',
                paystackReference: reference,
                paystackTransferId: null,
                reconciliationStartedAt: null,
                reconciliationCheckedAt: null,
                reconciliationError: null,
                reconciliationAttempt: 0,
              },
            });
          } else {
            await tx.transaction.create({
              data: {
                companyId,
                walletId: wallet.id,
                employeeId: employee.id,
                payrollEmployeeId: pe.id,
                type: 'PAYROLL_DEBIT',
                amount: pe.amount,
                status: 'PENDING',
                description: `Payroll payment to ${employee.firstName} ${employee.lastName}`,
                paystackReference: reference,
              },
            });
          }
        });

        // Initiate Paystack transfer
        console.log(`[ProcessPayroll] Sending Paystack transfer request...`);
        try {
          const transferResponse = await paystackService.initiateTransfer({
            amount: pe.amount,
            recipientCode,
            reason: `Salary payment - ${employee.firstName} ${employee.lastName}`,
            reference,
          });

          const transferCode = transferResponse?.data?.transfer_code;
          if (transferCode) {
            await prisma.transaction.updateMany({
              where: { paystackReference: reference, status: 'PENDING' },
              data: { paystackTransferId: transferCode },
            });
          }

          if (process.env.USE_PAYSTACK_MOCK === 'true') {
            await prisma.$transaction(async (tx) => {
              await tx.transaction.updateMany({
                where: { paystackReference: reference, status: 'PENDING' },
                data: { status: 'SUCCESS', paystackTransferId: `TRF_mock_${Date.now()}` },
              });
              await tx.payrollEmployee.update({
                where: { id: pe.id },
                data: { status: 'SUCCESS' },
              });
              await tx.employee.update({
                where: { id: employee.id },
                data: {
                  nextPaymentDate: getNextPaymentDate(new Date(), employee.paymentFrequency),
                },
              });
            });
          }
        } catch (transferError: unknown) {
          if (!isDefinitiveTransferRejection(transferError)) {
            // The transfer may still have been accepted by Paystack (timeout,
            // connection reset, provider 5xx, duplicate reference). Reversing
            // the wallet now would pay the employee twice if the transfer
            // completes. Leave the transaction PENDING so the transfer.success
            // webhook or the reconciliation job verifies it and settles it.
            // The employee row stays PENDING and the payroll stays PROCESSING
            // until reconciliation reaches a conclusive state.
            console.error(
              `[ProcessPayroll] Ambiguous transfer error for ${employee.id}; ` +
              `leaving transfer PENDING for reconciliation:`,
              getErrorDetail(transferError)
            );
            continue;
          }

          // Definitive rejection — Paystack answered with an HTTP error, the
          // transfer was not created. Reverse the wallet deduction and mark
          // the row FAILED so it can be retried.
          console.error(
            `[ProcessPayroll] Transfer rejected for ${employee.id}, reversing wallet deduction:`,
            getErrorDetail(transferError)
          );

          await prisma.$transaction(async (tx) => {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: pe.amount } },
            });
            await tx.transaction.updateMany({
              where: { paystackReference: reference },
              data: { status: 'FAILED' },
            });
            await tx.payrollEmployee.update({
              where: { id: pe.id },
              data: { status: 'FAILED' },
            });
          });

          throw transferError;
        }

        console.log(`[ProcessPayroll] Transfer initiated successfully for ${employee.id}`);
        await heartbeatPayroll(payrollId);

        successCount++;
      } catch (error: unknown) {
        console.error(
          `[ProcessPayroll] Failed for employee ${employee.id}:`,
          getErrorDetail(error)
        );
        const latest = await prisma.payrollEmployee.findUnique({
          where: { id: pe.id },
          select: { status: true },
        });

        if (latest?.status === 'PENDING') {
          await prisma.payrollEmployee.update({
            where: { id: pe.id },
            data: { status: 'FAILED' },
          });
        }

        failCount++;
      }
    }

    const remainingPending = await prisma.payrollEmployee.count({
      where: { payrollId, status: 'PENDING' },
    });
    const finalStatus = remainingPending > 0 ? 'PROCESSING' : failCount > 0 ? 'FAILED' : 'COMPLETED';

    await prisma.payroll.update({
      where: { id: payrollId },
      data: {
        status: finalStatus,
        processedDate: new Date(),
        processingHeartbeatAt: null,
        failureReason: failCount > 0 ? `${failCount} employee transfers failed` : null,
      },
    });

    await auditService.record({
      companyId,
      action: 'PAYROLL_PROCESSING_FINISHED',
      entityType: 'Payroll',
      entityId: payrollId,
      metadata: { successCount, failCount, finalStatus },
    });

    const notifType =
      finalStatus === 'FAILED'
        ? 'PAYROLL_FAILED'
        : finalStatus === 'COMPLETED'
          ? 'PAYROLL_COMPLETED'
          : 'PAYROLL_SCHEDULED';
    const title =
      finalStatus === 'FAILED'
        ? 'Payroll Failed'
        : finalStatus === 'COMPLETED'
          ? 'Payroll Completed'
          : 'Payroll Transfers Initiated';
    const message =
      finalStatus === 'PROCESSING'
        ? `Payroll transfer requests were initiated for ${successCount} employees and are awaiting Paystack confirmation.`
        : finalStatus === 'COMPLETED'
          ? `Payroll processed successfully. ${successCount} employees paid.`
          : `Payroll failed. ${successCount} transfer requests initiated, ${failCount} failed.`;

    await notificationService.notifyCompanyAdmins({
      companyId,
      type: notifType,
      title,
      message,
    });

    console.log(
      `[ProcessPayroll] Payroll ${payrollId} done: ${successCount} success, ${failCount} failed`
    );
  } catch (error) {
    console.error(`[ProcessPayroll] Payroll ${payrollId} failed:`, error);
    const errorMessage = getErrorMessage(error);

    await prisma.payroll.updateMany({
      where: { id: payrollId, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        processedDate: new Date(),
        processingHeartbeatAt: null,
        failureReason: errorMessage,
      },
    });

    await auditService.record({
      companyId,
      action: 'PAYROLL_PROCESSING_FAILED',
      entityType: 'Payroll',
      entityId: payrollId,
      metadata: { error: errorMessage },
    });

    await notificationService.notifyCompanyAdmins({
      companyId,
      type: 'PAYROLL_FAILED',
      title: 'Payroll Failed',
      message: `Payroll processing failed: ${errorMessage}`,
    });

    throw error;
  }
}

async function heartbeatPayroll(payrollId: string) {
  await prisma.payroll.updateMany({
    where: { id: payrollId, status: 'PROCESSING' },
    data: { processingHeartbeatAt: new Date() },
  });
}
