ALTER TABLE "Employee" ADD COLUMN "accountNumberLast4" TEXT;

UPDATE "Employee"
SET "accountNumberLast4" = RIGHT("accountNumber", 4)
WHERE "accountNumber" IS NOT NULL;

CREATE INDEX "Employee_companyId_accountNumberLast4_idx"
ON "Employee"("companyId", "accountNumberLast4");
