import { PrismaClient } from '@prisma/client';
import { paystackService } from '../services/paystack.service';
import { notificationService } from '../services/notification.service';
import { generateReference } from '../utils/formatters';
import { getNextPaymentDate } from '../utils/dateHelpers';

const prisma = new PrismaClient();

interface ProcessPayrollData {
  payrollId: string;
  companyId: string;
}

export async function processPayroll(data: ProcessPayrollData) {
  const { payrollId, companyId } = data;

  console.log(`[ProcessPayroll] Starting payroll ${payrollId}`);

  // Update payroll status to PROCESSING
  await prisma.payroll.update({
    where: { id: payrollId },
    data: { status: 'PROCESSING' },
  });

  try {
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

    // Check wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: { companyId },
    });

    if (!wallet || wallet.balance < payroll.totalAmount) {
      throw new Error(
        `Insufficient balance. Required: ${payroll.totalAmount}, Available: ${wallet?.balance || 0}`
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
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: pe.amount } },
          });

          await tx.transaction.create({
            data: {
              companyId,
              walletId: wallet.id,
              employeeId: employee.id,
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
        } catch (transferError: any) {
          // Transfer failed — reverse the wallet deduction so money isn't lost
          console.error(
            `[ProcessPayroll] Transfer call failed for ${employee.id}, reversing wallet deduction:`,
            transferError.response?.data || transferError.message
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
          });

          throw transferError;
        }

        // Update payroll employee status
        await prisma.payrollEmployee.update({
          where: { id: pe.id },
          data: { status: 'SUCCESS' },
        });
        console.log(`[ProcessPayroll] Transfer initiated successfully for ${employee.id}`);

        // Update next payment date
        await prisma.employee.update({
          where: { id: employee.id },
          data: {
            nextPaymentDate: getNextPaymentDate(
              new Date(),
              employee.paymentFrequency
            ),
          },
        });

        successCount++;
      } catch (error: any) {
        console.error(
          `[ProcessPayroll] Failed for employee ${employee.id}:`,
          error.response?.data || error.message
        );

        await prisma.payrollEmployee.update({
          where: { id: pe.id },
          data: { status: 'FAILED' },
        });

        failCount++;
      }
    }

    // Update payroll status
    const finalStatus = failCount === 0 ? 'COMPLETED' : successCount === 0 ? 'FAILED' : 'COMPLETED';

    await prisma.payroll.update({
      where: { id: payrollId },
      data: {
        status: finalStatus,
        processedDate: new Date(),
      },
    });

    // Send notification
    const notifType = failCount === 0 ? 'PAYROLL_COMPLETED' : 'PAYROLL_FAILED';
    const message =
      failCount === 0
        ? `Payroll processed successfully. ${successCount} employees paid.`
        : `Payroll partially completed. ${successCount} succeeded, ${failCount} failed.`;

    await notificationService.notifyCompanyAdmins({
      companyId,
      type: notifType,
      title: failCount === 0 ? 'Payroll Completed' : 'Payroll Partially Failed',
      message,
    });

    console.log(
      `[ProcessPayroll] Payroll ${payrollId} done: ${successCount} success, ${failCount} failed`
    );
  } catch (error) {
    console.error(`[ProcessPayroll] Payroll ${payrollId} failed:`, error);

    await prisma.payroll.update({
      where: { id: payrollId },
      data: { status: 'FAILED' },
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
