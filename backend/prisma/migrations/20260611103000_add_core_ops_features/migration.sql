-- AlterEnum
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Payroll" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Payroll" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "Payroll" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Payroll" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Payroll" ADD COLUMN "failureReason" TEXT;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payroll_createdById_idx" ON "Payroll"("createdById");

-- CreateIndex
CREATE INDEX "Payroll_approvedById_idx" ON "Payroll"("approvedById");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
