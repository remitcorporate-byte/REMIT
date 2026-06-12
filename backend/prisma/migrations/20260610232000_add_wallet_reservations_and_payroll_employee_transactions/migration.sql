-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN "reservedBalance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "payrollEmployeeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_payrollEmployeeId_key" ON "Transaction"("payrollEmployeeId");

-- CreateIndex
CREATE INDEX "Transaction_payrollEmployeeId_idx" ON "Transaction"("payrollEmployeeId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payrollEmployeeId_fkey" FOREIGN KEY ("payrollEmployeeId") REFERENCES "PayrollEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
