ALTER TABLE "Transaction"
ADD COLUMN "reconciliationStartedAt" TIMESTAMP(3),
ADD COLUMN "reconciliationCheckedAt" TIMESTAMP(3),
ADD COLUMN "reconciliationAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reconciliationError" TEXT;

CREATE INDEX "Transaction_type_status_reconciliationCheckedAt_idx"
ON "Transaction"("type", "status", "reconciliationCheckedAt");
