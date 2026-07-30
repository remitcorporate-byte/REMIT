# Redis Payroll Queue

REMIT uses BullMQ for durable production payroll delivery. The API process and
database scheduler enqueue jobs; a separate worker process executes them.
Database claims remain the final duplicate-execution guard.

## Required production environment

Store these values in the deployment secret manager or untracked
`backend/.env`:

```text
REDIS_URL=redis://default:<password>@<host>:<port>
PAYROLL_QUEUE_MODE=redis
```

Do not commit Redis credentials. Rotate any credential that has been pasted
into chat, logs, tickets, or source code.

Optional tuning:

```text
PAYROLL_QUEUE_NAME=remit-payroll
PAYROLL_WORKER_CONCURRENCY=3
PAYROLL_JOB_ATTEMPTS=5
PAYROLL_JOB_BACKOFF_MS=5000
PAYROLL_COMPLETED_JOB_MAX_AGE_SECONDS=86400
PAYROLL_COMPLETED_JOB_MAX_COUNT=1000
PAYROLL_FAILED_JOB_MAX_AGE_SECONDS=604800
PAYROLL_FAILED_JOB_MAX_COUNT=5000
REDIS_CONNECT_TIMEOUT_MS=10000
```

## Start the services

Build once:

```powershell
cd C:\dev\remit\REMIT\backend
corepack pnpm build
```

Run the API/scheduler and worker as separate managed processes:

```powershell
corepack pnpm start
corepack pnpm worker:payroll
```

For development with automatic restarts:

```powershell
corepack pnpm dev
corepack pnpm dev:worker
```

Both processes must receive the same `REDIS_URL`, `PAYROLL_QUEUE_NAME`,
database, Paystack, and application secrets.

## Local integration mode

The local Supabase suite explicitly sets:

```text
PAYROLL_QUEUE_MODE=in-process
```

This keeps the full integration suite deterministic and independent of an
external Redis service. Production defaults to Redis and fails startup when
`REDIS_URL` is absent.

## Verification

To verify Redis authentication, producer delivery, and worker consumption
without touching payroll records:

```powershell
corepack pnpm test:redis
```

The test creates a uniquely named temporary queue, processes one no-op job, and
deletes that temporary queue.

An end-to-end Redis test also passed against local Supabase on 30 July 2026:

```text
API payroll approval
  -> isolated Redis queue
  -> standalone BullMQ worker
  -> atomic PostgreSQL payroll claim
  -> mocked Paystack transfer
  -> completed payroll and one exact wallet debit
```

The reusable API-side assertion script is:

```powershell
corepack pnpm test:redis-payroll
```

It expects the API and standalone worker to already be running with the same
isolated `PAYROLL_QUEUE_NAME`.

The company system-status endpoint reports queue mode, connectivity, waiting,
active, and failed counts.

## Redis eviction policy

BullMQ requires Redis `maxmemory-policy` to be `noeviction`. A policy such as
`volatile-lru` can remove queue keys under memory pressure and is not safe for
payroll jobs.

The supplied Redis service authenticated successfully, but reported
`volatile-lru` during verification on 30 July 2026. Change the managed Redis
instance to `noeviction` before treating the queue as production-ready.

## Failure behavior

- Jobs retry up to five total attempts by default.
- Retry delay uses exponential backoff starting at five seconds.
- Failed jobs are retained for operator inspection.
- Completed jobs are retained with bounded age/count limits.
- BullMQ can recover stalled jobs after an ungraceful worker shutdown.
- The worker calls `close()` during graceful shutdown.
- Atomic PostgreSQL payroll claims prevent duplicate execution if Redis
  redelivers a job.
