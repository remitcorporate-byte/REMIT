# REMIT Backend Technology Review

**Reviewed:** July 30, 2026  
**Scope:** Current backend technology, architecture, production suitability, and recommended priorities

## Executive Summary

REMIT's backend technology is appropriate for the product, particularly at MVP and early-production scale. A rewrite in another framework or language is not currently justified.

The primary concerns are architectural and operational rather than problems with Node.js, Express, TypeScript, Prisma, or PostgreSQL. The existing stack can support the product, but payroll execution, database connection management, observability, authentication, and automated testing need further hardening before the system should be treated as a mature financial platform.

## Current Technology Stack

- **Runtime:** Node.js
- **Language:** TypeScript with strict mode enabled
- **API framework:** Express 5
- **Database:** PostgreSQL
- **Database hosting/testing:** Supabase PostgreSQL and local Supabase
- **ORM and migrations:** Prisma
- **Request validation:** Zod
- **Authentication:** JSON Web Tokens and bcrypt
- **Payment provider:** Paystack
- **HTTP client:** Axios
- **Security middleware:** Helmet, CORS, and Express rate limiting
- **Development logging:** Morgan
- **Payroll scheduling:** In-process interval scheduler
- **Payroll queue:** Custom in-process queue

## Supabase's Role

Supabase is currently used primarily as a PostgreSQL platform. The backend connects to the database through Prisma using `DATABASE_URL` and `DIRECT_URL`.

The application does not currently depend on Supabase Auth, Edge Functions, or the Supabase client SDK for its core backend behavior. This is a valid architecture: Express owns the business logic and API, while Supabase provides PostgreSQL infrastructure.

## Strengths

### Type safety

TypeScript strict mode is enabled. This provides a good foundation for detecting invalid assumptions at build time, especially when combined with Prisma-generated database types and Zod request validation.

### Appropriate relational database

PostgreSQL is a strong choice for payroll and wallet operations because the product requires transactions, constraints, relationships, indexes, and consistent state transitions.

### Monetary representation

Monetary values are stored as integers in kobo rather than floating-point naira values. This avoids floating-point rounding errors in salary, wallet, and transfer calculations.

### Database migrations and constraints

Prisma provides repeatable migrations, generated types, relational modeling, and transactional database operations. The schema also includes useful unique constraints and indexes.

### Security baseline

The backend already includes:

- Password hashing with bcrypt
- JWT authentication
- Zod input validation
- Helmet security headers
- Configured CORS
- General and authentication rate limits
- Paystack webhook signature verification using the raw request body

### Maintainable initial structure

Routes, controllers, services, middleware, jobs, configuration, and utilities are separated into recognizable directories. The structure remains understandable for a small engineering team.

## Risks and Limitations

### 1. The payroll queue is not durable

The current `InProcessPayrollQueue` tracks jobs in a JavaScript `Set` and executes them with `setTimeout`.

This means:

- Queued work is lost when the server restarts.
- Queue state is not shared between multiple API instances.
- Retry history is not persisted.
- Failed jobs do not have durable retry or dead-letter behavior.
- Job visibility and operational inspection are limited.

Database-level payroll claiming and processing heartbeats reduce duplicate-processing risk, but they do not make the queue itself durable.

Before handling serious production volume, replace the in-process queue with one of the following:

- BullMQ with Redis
- `pg-boss` or another PostgreSQL-backed job queue
- A managed queue and worker platform

### 2. The scheduler runs inside the API process

The payroll scheduler starts when the Express server starts. If the API is deployed with multiple replicas, each replica can run the scheduler.

Database claims can prevent the same payroll from being processed twice, but API serving, schedule discovery, and payroll execution should eventually become separate responsibilities:

```text
API server -> durable queue -> payroll worker
                  ^
           scheduled job runner
```

This separation provides better isolation, deployment safety, scaling, retries, and monitoring.

### 3. Prisma clients are created in multiple modules

Several controllers, middleware modules, jobs, and services instantiate their own `PrismaClient`.

Each instance can own a database connection pool. This can consume unnecessary connections and become particularly problematic when using Supabase connection limits or deploying multiple application replicas.

The backend should expose one shared Prisma client:

```ts
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

All controllers, services, middleware, and jobs should import that shared client.

### 4. Business logic is concentrated in controllers and jobs

Some payroll, wallet, webhook, and transfer logic is implemented directly inside controllers or background-job functions.

This makes transaction boundaries, reuse, and isolated testing harder to reason about. Core financial behavior should move into focused services:

- `PayrollService`
- `WalletService`
- `TransferService`
- `WebhookService`
- `ReconciliationService`

Controllers should primarily validate requests, invoke a service, and format the HTTP response.

### 5. Production observability is limited

Morgan is only enabled in development, and the backend does not yet have a complete production observability system.

For payroll processing, the system should provide:

- Structured JSON logging with Pino or Winston
- Request and correlation IDs
- Error reporting through a service such as Sentry
- Paystack reference and transfer identifiers in relevant logs
- Metrics for scheduled, completed, failed, and stale payrolls
- Alerts when manual reconciliation is required
- Dashboards for transfer failures and webhook processing

Sensitive fields, including passwords, authorization headers, account numbers, and secrets, must be redacted from logs.

### 6. Authentication requires a stronger session lifecycle

JWT access tokens can currently be configured with a long lifetime, with a development default of 30 days.

For a financial application, the preferred model is:

- Short-lived access tokens
- Rotating refresh tokens
- Server-side session records
- Token revocation
- Logout across devices
- Reauthentication for high-risk operations
- Optional multi-factor authentication for owners and approvers

Payroll approval and other sensitive actions should also retain clear role, company, and independent-approval checks.

### 7. Rate limiting is process-local

The default memory store used by `express-rate-limit` is local to one Node.js process.

When multiple API instances are deployed, each instance maintains a different counter. A shared Redis or database-backed store is required for consistent distributed rate limiting.

### 8. Automated testing needs expansion

The local Supabase integration tests are useful because they exercise actual PostgreSQL behavior. However, the project should adopt a standard test runner and a repeatable CI test suite.

Important coverage includes:

- Unit tests for financial calculations and state-transition rules
- API integration tests
- Authentication and role authorization
- Company and tenant isolation
- Concurrent webhook delivery
- Duplicate deposit and transfer events
- Payroll claiming under concurrent workers
- Scheduler restart and stale-processing recovery
- Wallet balance and reserved-balance invariants
- Partial transfer success and failure
- Transfer reconciliation
- Paystack timeout and retry behavior

## Recommended Production Architecture

The existing stack can be retained while responsibilities are separated:

```text
Frontend
   |
Express API
   |
PostgreSQL/Supabase
   |
Durable job queue
   |
Payroll worker ---- Paystack
   |
Reconciliation and monitoring
```

The database should remain the source of truth for payroll, wallet, transaction, transfer, and idempotency state. Queue delivery should trigger work, but queue state alone must never determine whether money has been sent.

## Recommended Priorities

### Priority 1: Complete payroll durability

- Verify atomic payroll claiming.
- Verify processing heartbeats and stale-job recovery.
- Prevent duplicate provider dispatch.
- Define explicit reconciliation behavior after uncertain Paystack responses.
- Preserve idempotency across webhooks, retries, and restarts.

### Priority 2: Introduce a shared Prisma client

- Replace module-level `new PrismaClient()` instances.
- Confirm compatibility with local development and production deployment.
- Monitor database connection usage.

### Priority 3: Add a durable queue and separate worker

- Persist jobs and retries.
- Run payroll processing outside the API process.
- Introduce retry limits and dead-letter handling.
- Ensure database claims remain the final concurrency guard.

### Priority 4: Strengthen automated tests

- Add a standard TypeScript test runner.
- Run integration tests against isolated local PostgreSQL/Supabase data.
- Add concurrency and failure-injection scenarios.
- Execute the suite in CI.

### Priority 5: Add production observability

- Add structured logging and redaction.
- Add request correlation.
- Add error tracking, metrics, and reconciliation alerts.
- Document an operational response process for uncertain transfers.

### Priority 6: Harden authentication and sensitive operations

- Introduce short-lived access tokens and rotating refresh sessions.
- Add revocation and session visibility.
- Require stronger confirmation for payroll approval and other high-risk actions.
- Consider multi-factor authentication for privileged roles.

## Final Verdict

Express, TypeScript, Prisma, PostgreSQL, Supabase, and Paystack form a suitable backend stack for REMIT. The technology does not need to be replaced.

The backend should currently be considered a well-structured MVP moving toward production readiness, rather than a fully mature payroll-processing platform. The highest risks come from the in-process job infrastructure, distributed execution behavior, database connection management, limited production observability, and incomplete automated failure testing.

The recommended approach is to preserve the existing stack and incrementally harden the financial execution architecture.
