ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_UPDATE';

CREATE TYPE "PlatformRole" AS ENUM ('SUPPORT_AGENT', 'SUPPORT_ADMIN');

CREATE TABLE "PlatformUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "role" "PlatformRole" NOT NULL DEFAULT 'SUPPORT_AGENT',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformAuditLog" (
  "id" TEXT NOT NULL,
  "platformUserId" TEXT,
  "companyId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SupportTicket" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "SupportMessage" ADD COLUMN "authorPlatformUserId" TEXT;

CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");
CREATE INDEX "PlatformUser_role_isActive_idx" ON "PlatformUser"("role", "isActive");
CREATE INDEX "PlatformAuditLog_platformUserId_idx" ON "PlatformAuditLog"("platformUserId");
CREATE INDEX "PlatformAuditLog_companyId_idx" ON "PlatformAuditLog"("companyId");
CREATE INDEX "PlatformAuditLog_entityType_createdAt_idx" ON "PlatformAuditLog"("entityType", "createdAt");
CREATE INDEX "SupportTicket_assignedToId_status_idx" ON "SupportTicket"("assignedToId", "status");
CREATE INDEX "SupportMessage_authorPlatformUserId_idx" ON "SupportMessage"("authorPlatformUserId");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorPlatformUserId_fkey" FOREIGN KEY ("authorPlatformUserId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
