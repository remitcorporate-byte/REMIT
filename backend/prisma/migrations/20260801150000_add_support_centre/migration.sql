CREATE TYPE "SupportTicketCategory" AS ENUM ('PAYMENT_FAILURE', 'WALLET_FUNDING', 'BANK_VERIFICATION', 'PAYROLL_ISSUE', 'ACCOUNT_ACCESS', 'GENERAL');
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportMessageSender" AS ENUM ('CUSTOMER', 'SUPPORT', 'SYSTEM');

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "payrollId" TEXT,
  "transactionId" TEXT,
  "category" "SupportTicketCategory" NOT NULL,
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "subject" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "senderType" "SupportMessageSender" NOT NULL DEFAULT 'CUSTOMER',
  "body" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");
CREATE INDEX "SupportTicket_companyId_status_idx" ON "SupportTicket"("companyId", "status");
CREATE INDEX "SupportTicket_companyId_lastMessageAt_idx" ON "SupportTicket"("companyId", "lastMessageAt");
CREATE INDEX "SupportTicket_createdById_idx" ON "SupportTicket"("createdById");
CREATE INDEX "SupportTicket_payrollId_idx" ON "SupportTicket"("payrollId");
CREATE INDEX "SupportTicket_transactionId_idx" ON "SupportTicket"("transactionId");
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
CREATE INDEX "SupportMessage_authorUserId_idx" ON "SupportMessage"("authorUserId");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
