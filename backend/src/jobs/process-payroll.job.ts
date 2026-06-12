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

export async function processPayroll(data: ProcessPayrollData) {
  const { payrollId, companyId } = data;

  console.log(`[ProcessPayroll] Starting payroll ${payrollId}`);

  try {
    const started = await prisma.$transaction(async (tx: any) => {
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

      if (payroll.status !== 'SCHEDULED') {
        console.log(`[ProcessPayroll] Payroll ${payrollId} is ${payroll.status}; skipping duplicate job`);
        return false;
      }

      await tx.payroll.update({
        where: { id: payrollId },
        data: { status: 'PROCESSING' },
      });

      const pendingAmount = payroll.payrollEmployees.reduce((sum: number, pe: { amount: number }) => sum + pe.amount, 0);

      if (!payroll.processedDate) {
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

        // Deduct from wallet and create transaction
        await prisma.$transaction(async (tx: any) => {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: pe.amount } },
          });

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
        });

        // Initiate Paystack transfer
        console.log(`[ProcessPayroll] Sending Paystack transfer request...`);
        try {
          await paystackService.initiateTransfer({
            amount: pe.amount,
            recipientCode,
            reason: `Salary payment - ${employee.firstName} ${employee.lastName}`,
            reference,
          });

          if (process.env.USE_PAYSTACK_MOCK === 'true') {
            await prisma.$transaction(async (tx: any) => {
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
        } catch (transferError: any) {
          // Transfer failed — reverse the wallet deduction so money isn't lost
          console.error(
            `[ProcessPayroll] Transfer call failed for ${employee.id}, reversing wallet deduction:`,
            transferError.response?.data || transferError.message
          );

          await prisma.$transaction(async (tx: any) => {
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

        successCount++;
      } catch (error: any) {
        console.error(
          `[ProcessPayroll] Failed for employee ${employee.id}:`,
          error.response?.data || error.message
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

    await prisma.payroll.update({
      where: { id: payrollId },
      data: { status: 'FAILED', processedDate: new Date(), failureReason: (error as Error).message },
    });

    await auditService.record({
      companyId,
      action: 'PAYROLL_PROCESSING_FAILED',
      entityType: 'Payroll',
      entityId: payrollId,
      metadata: { error: (error as Error).message },
    });

    await notificationService.notifyCompanyAdmins({
      companyId,
      type: 'PAYROLL_FAILED',
      title: 'Payroll Failed',
      message: `Payroll processing failed: ${(error as Error).message}`,
    });

    throw error;
  }
}
