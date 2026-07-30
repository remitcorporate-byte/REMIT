ALTER TABLE "Payroll"
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "processingHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "reservationReleasedAt" TIMESTAMP(3),
ADD COLUMN "processingAttempt" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Payroll_status_processingHeartbeatAt_idx"
ON "Payroll"("status", "processingHeartbeatAt");
