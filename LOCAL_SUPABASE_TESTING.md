# Local Supabase Testing

REMIT can run integration tests against an isolated PostgreSQL database inside
the existing local Supabase Docker stack. This keeps test users, employees, and
payroll records away from the remote Supabase project.

## Current local setup

The local Supabase PostgreSQL service is exposed at:

```text
Host: 127.0.0.1
Port: 54322
User: postgres
Database: remit_test
Schema: public
```

The `remit_test` database was created separately from the existing local
Supabase project database. All six REMIT Prisma migrations have been applied.

## Run the local integration smoke test

Make sure Docker Desktop and the local Supabase stack are running, then execute:

```powershell
cd C:\dev\remit\REMIT\backend
corepack pnpm test:local-supabase
```

The script:

1. Sets local-only environment variables in the child PowerShell process.
2. Points `DATABASE_URL` and `DIRECT_URL` at `remit_test`.
3. Enables Paystack mock mode.
4. Applies pending Prisma migrations.
5. Regenerates the Prisma client.
6. Builds and starts the backend.
7. Runs the API and money-flow integration tests.
8. Stops the temporary backend process.

It does not edit or replace `backend/.env`, so the saved remote configuration
remains intact.

## Use another local database or API port

```powershell
powershell -ExecutionPolicy Bypass `
  -File scripts/test-local-supabase.ps1 `
  -DatabaseUrl "postgresql://postgres:postgres@127.0.0.1:54322/remit_test?schema=public" `
  -Port 5001
```

## Covered smoke-test paths

- API health
- User registration
- Current-user authentication
- Company profile lookup
- Dashboard loading
- Employee listing and creation
- Payroll listing
- Transaction listing
- Concurrent duplicate deposit webhooks
- Concurrent deposit verification
- Webhook amount-mismatch rejection and corrected retry
- Concurrent transfer reversal and single-refund enforcement
- Invalid webhook signature rejection
- Direct payroll auto-scheduling rejection
- Creator/approver separation with an independent Finance user
- Payroll reservation creation and release after cancellation
- Three concurrent payroll workers competing for one database claim
- Single wallet debit and processing attempt under concurrent delivery
- Safe requeue after a simulated pre-dispatch worker crash
- Reconciliation quarantine after a simulated post-dispatch worker crash
- Duplicate debit prevention for a quarantined payroll

These are integration smoke tests, not a replacement for the automated
idempotency, concurrency, webhook, wallet, and payroll tests recommended in
`PROJECT_REVIEW.md`.

## Safety notes

- `remit_test` contains disposable test data.
- Paystack calls use mock mode and do not move real money.
- Never reuse the local JWT or Paystack placeholder values in production.
- Do not point the local test script at a production database.
