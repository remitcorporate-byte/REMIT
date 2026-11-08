import { prisma } from '../lib/prisma';
import { paystackService } from '../services/paystack.service';
import { notificationService } from '../services/notification.service';
import { generatePayrollTransferReference } from '../utils/formatters';
import { getNextPaymentDate } from '../utils/dateHelpers';
import { auditService } from '../services/audit.service';
import { decryptField } from '../utils/crypto';
import { classifyTransferError } from '../utils/transferErrors';


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
    let unknownCount = 0;

    // Process each employee
    for (const pe of payroll.payrollEmployees) {
      const employee = pe.employee;

      try {
        await heartbeatPayroll(payrollId);
        console.log(`[ProcessPayroll] Processing employee: ${employee.firstName} ${employee.lastName} (${employee.id})`);

        const accountNumber = decryptField(employee.accountNumber);

        // Ensure employee has a Paystack recipient code
        let recipientCode: string = employee.paystackRecipientCode || '';
        if (!recipientCode) {
          console.log(`[ProcessPayroll] Creating Paystack recipient for ${employee.id}...`);
          const recipient = await paystackService.createTransferRecipient({
            name: employee.accountName,
            accountNumber,
            bankCode: employee.bankCode,
          });
          recipientCode = recipient.data.recipient_code;
          console.log(`[ProcessPayroll] Recipient created: ${recipientCode}`);

          await prisma.employee.update({
            where: { id: employee.id },
            data: { paystackRecipientCode: recipientCode },
          });
        }

        const deterministicReference = generatePayrollTransferReference(pe.id);
        console.log(`[ProcessPayroll] Initiating transfer with reference: ${deterministicReference}`);

        // Reuse the row and reference on retries. A pending row means the wallet
        // was already debited and must never be debited again.
        const transaction = await prisma.$transaction(async (tx) => {
          const existing = await tx.transaction.findUnique({
            where: { payrollEmployeeId: pe.id },
          });

          if (existing?.status === 'SUCCESS') {
            await tx.payrollEmployee.update({ where: { id: pe.id }, data: { status: 'SUCCESS' } });
            return existing;
          }
          if (existing?.status === 'PENDING') return existing;

          const debited = await tx.wallet.updateMany({
            where: { id: wallet.id, balance: { gte: pe.amount } },
            data: { balance: { decrement: pe.amount } },
          });
          if (debited.count !== 1) throw new Error(`Insufficient balance for employee ${employee.id}`);

          if (existing) {
            return tx.transaction.update({
              where: { id: existing.id },
              data: {
                status: 'PENDING',
                paystackReference: deterministicReference,
                reconciliationStartedAt: null,
                reconciliationCheckedAt: null,
                reconciliationError: null,
              },
            });
          }

          return tx.transaction.create({
            data: {
              companyId,
              walletId: wallet.id,
              employeeId: employee.id,
              payrollEmployeeId: pe.id,
              type: 'PAYROLL_DEBIT',
              amount: pe.amount,
              status: 'PENDING',
              description: `Payroll payment to ${employee.firstName} ${employee.lastName}`,
              paystackReference: deterministicReference,
            },
          });
        });

        // Preserve a legacy pending reference if one already exists; new rows
        // always use the deterministic payroll-employee reference.
        const reference = transaction.paystackReference || deterministicReference;

        if (transaction.status === 'SUCCESS') {
          successCount++;
          continue;
        }
        if (transaction.paystackTransferId) {
          // Paystack returned a transfer code previously; reconciliation owns
          // this pending provider state and we must not submit it twice.
          unknownCount++;
          continue;
        }

        // Initiate Paystack transfer
        console.log(`[ProcessPayroll] Sending Paystack transfer request...`);
        try {
          const transferResponse = await paystackService.initiateTransfer({
            amount: pe.amount,
            recipientCode,
            reason: `Salary payment - ${employee.firstName} ${employee.lastName}`,
            reference,
          });

          if (transferResponse?.status === false) {
            const rejected = new Error(transferResponse.message || 'Paystack rejected transfer');
            Object.assign(rejected, { response: { status: 400, data: transferResponse } });
            throw rejected;
          }

          const transferCode = transferResponse?.data?.transfer_code;
          if (transferCode) {
            await prisma.transaction.updateMany({
              where: { id: transaction.id, status: 'PENDING' },
              data: { paystackTransferId: transferCode },
            });
          }

          if (process.env.USE_PAYSTACK_MOCK === 'true') {
            await prisma.$transaction(async (tx) => {
              await tx.transaction.updateMany({
                where: { id: transaction.id, status: 'PENDING' },
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
          console.error(
            `[ProcessPayroll] Transfer call failed for ${employee.id}:`,
            getErrorDetail(transferError)
          );

          if (classifyTransferError(transferError) === 'definitive') {
            await prisma.$transaction(async (tx) => {
              const transition = await tx.transaction.updateMany({
                where: { id: transaction.id, status: 'PENDING' },
                data: { status: 'FAILED', reconciliationCheckedAt: new Date() },
              });
              if (transition.count !== 1) return;
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: pe.amount } },
              });
              await tx.transaction.create({
                data: {
                  companyId,
                  walletId: wallet.id,
                  employeeId: employee.id,
                  type: 'REFUND',
                  amount: pe.amount,
                  status: 'SUCCESS',
                  description: `Refund for rejected transfer: ${reference}`,
                },
              });
              await tx.payrollEmployee.update({ where: { id: pe.id }, data: { status: 'FAILED' } });
            });
            throw transferError;
          }

          // Timeouts, network failures, 5xx responses, and unknown responses
          // remain pending for transfer reconciliation. Keep one deterministic
          // transfer per row.
          // TODO: Paystack bulk transfers remain optional and are intentionally not implemented.
          await prisma.transaction.updateMany({
            where: { id: transaction.id, status: 'PENDING' },
            data: {
              reconciliationStartedAt: null,
              reconciliationCheckedAt: null,
              reconciliationError: getErrorMessage(transferError),
            },
          });
          unknownCount++;
          continue;
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
        ...(finalStatus !== 'PROCESSING' && { processedDate: new Date() }),
        processingHeartbeatAt: null,
        failureReason: failCount > 0 ? `${failCount} employee transfers failed` : unknownCount > 0 ? `${unknownCount} employee transfers need reconciliation` : null,
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
    const unresolvedCount = await prisma.transaction.count({
      where: {
        type: 'PAYROLL_DEBIT',
        status: 'PENDING',
        payrollEmployee: { payrollId },
      },
    });
    const unresolved = unresolvedCount > 0;

    await prisma.payroll.updateMany({
      where: { id: payrollId, status: 'PROCESSING' },
      data: {
        status: unresolved ? 'PROCESSING' : 'FAILED',
        ...(unresolved ? {} : { processedDate: new Date() }),
        processingHeartbeatAt: null,
        failureReason: unresolved ? `Transfer state requires reconciliation: ${errorMessage}` : errorMessage,
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
      type: unresolved ? 'PAYROLL_SCHEDULED' : 'PAYROLL_FAILED',
      title: unresolved ? 'Payroll Awaiting Reconciliation' : 'Payroll Failed',
      message: unresolved ? `Payroll has transfers awaiting Paystack reconciliation: ${errorMessage}` : `Payroll processing failed: ${errorMessage}`,
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
