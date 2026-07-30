# REMIT Project Review

**Review date:** 30 July 2026  
**Repository:** `C:\dev\remit\REMIT`  
**Scope:** Frontend, backend, database schema, authentication, payroll processing, Paystack integration, runtime readiness, build tooling, and repository state.

## Executive verdict

REMIT has a credible pilot/demo foundation for a Nigerian payroll operations product. The codebase has a clear frontend/backend split, a useful Prisma data model, company-scoped access patterns, kobo-based monetary storage, Paystack-shaped flows, audit logging, and a functional dashboard surface.

It is not production-ready for handling real payroll money yet. The largest gaps are database availability, durable payroll execution, webhook reliability/idempotency, approval-control enforcement, test coverage, and frontend error handling.

### Readiness summary

| Area | Assessment |
| --- | --- |
| Frontend build | Passes |
| Backend build | Passes |
| Frontend serving | Verified HTTP 200 |
| API process health | Verified HTTP 200 |
| Local authenticated database path | Verified against isolated local Supabase |
| Remote authenticated database path | Blocked by remote database connectivity failure |
| Payroll execution durability | Not production-safe |
| Paystack webhook reliability | Needs hardening |
| Frontend linting | Broken because ESLint is missing |
| Automated test coverage | Insufficient |
| Overall production readiness | Not ready for live payroll funds |

## What was verified

### Remediation progress after the initial review

The first money-movement hardening slice has now been implemented and verified
against the isolated local Supabase database:

- Deposit verification uses an atomic conditional status transition, so
  concurrent verification requests can credit the wallet only once.
- Signed `charge.success` webhooks validate the expected amount and currency.
- Duplicate concurrent deposit webhooks are acknowledged without duplicate
  wallet credits.
- Transfer success, failure, and reversal handlers use atomic status
  transitions before changing wallet or payroll state.
- Duplicate concurrent transfer reversals create one refund and restore the
  wallet once.
- Retryable webhook processing failures now reach the global error handler and
  return a non-2xx response instead of always returning HTTP 200.
- Invalid webhook signatures return HTTP 400.
- Prisma payloads are explicitly typed in the webhook transaction lookup; the
  previous dynamic `any` lookup was removed.
- The direct `/payrolls/schedule` auto-approval path now returns HTTP 410 with
  instructions to use draft, submit, and approve endpoints.
- Payroll creators are prevented from self-approving when another active
  authorized approver exists.
- Local tests verify that an independent Finance user is recorded as approver
  and that cancelling the approved payroll releases its exact reservation.

The local concurrency suite sends five concurrent copies of the same deposit
event, five concurrent deposit-verification requests, and five concurrent
copies of the same transfer-reversal event. The suite passed.

Remaining production work in this area includes persistent provider-event
receipts, a transactional outbox for audit/notification side effects, durable
job execution, and deployed Paystack webhook verification.

### Build verification

The following commands passed:

```powershell
cd backend
pnpm build

cd ..\frontend
pnpm build
```

The backend TypeScript compiler completed successfully. The frontend TypeScript check and Vite production build completed successfully.

The frontend build produced a warning about a large JavaScript chunk:

```text
index-BfxWYKk7.js   617.82 kB minified
```

### Runtime verification

The compiled backend served:

```text
GET /api/v1/health -> HTTP 200
```

The compiled frontend preview served:

```text
GET / -> HTTP 200
```

The health endpoint only proves that the Express process is listening. It does not prove database readiness; the endpoint is implemented as a static response in [`backend/src/routes/index.ts`](backend/src/routes/index.ts#L14-L21).

### Database evidence

The existing backend runtime log reports repeated Prisma `P1001` failures connecting to the configured Supabase pooler:

```text
Can't reach database server at aws-1-eu-central-1.pooler.supabase.com:6543
```

The remote/deployed database path therefore remains unverified until that
connectivity issue is resolved.

An isolated `remit_test` database was subsequently created inside the existing
local Supabase Docker stack at `127.0.0.1:54322`. All five Prisma migrations
were applied successfully. With Paystack mock mode enabled, the local API smoke
test passed registration, authentication, company lookup, dashboard loading,
employee creation, payroll listing, and transaction listing.

The repeatable local test command and environment details are documented in
[`LOCAL_SUPABASE_TESTING.md`](LOCAL_SUPABASE_TESTING.md).

### Lint verification

The frontend lint command failed:

```text
pnpm lint
'eslint' is not recognized as an internal or external command
```

The script exists in [`frontend/package.json`](frontend/package.json#L6-L10), but ESLint is not declared in the package dependencies or dev dependencies.

### Repository state

At review time, the branch was `main` at commit `83864d0`.

There were uncommitted changes in:

- [`backend/src/controllers/webhook.controller.ts`](backend/src/controllers/webhook.controller.ts)
- [`backend/src/jobs/process-payroll.job.ts`](backend/src/jobs/process-payroll.job.ts)
- [`backend/src/server.ts`](backend/src/server.ts)

Those changes include raw-body Paystack signature handling and transfer-code persistence. They should be reviewed, tested, and committed intentionally before deployment.

## Strengths

### Backend structure

- Clear separation between routes, controllers, middleware, services, jobs, queues, and utilities.
- Strict TypeScript configuration in [`backend/tsconfig.json`](backend/tsconfig.json).
- Zod validation is used for major input flows.
- Helmet, CORS, and rate limiting are present in [`backend/src/server.ts`](backend/src/server.ts) and [`backend/src/middleware/rateLimit.ts`](backend/src/middleware/rateLimit.ts).
- Errors are centralized through [`backend/src/middleware/errorHandler.ts`](backend/src/middleware/errorHandler.ts).

### Data and money handling

- Monetary values are stored as integer kobo in the Prisma schema rather than floating-point currency values: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma#L118-L128).
- Wallet, transaction, payroll, and payroll-employee relationships are represented explicitly.
- Company IDs are included in most queries, reducing straightforward cross-company data access risk.
- Payroll reservation and release logic exists before execution.

### Product foundation

- The frontend includes authentication, dashboard, employees, wallet, payroll, transactions, notifications, and settings surfaces.
- The backend exposes corresponding API resources.
- Audit records are created for important operational actions.
- CSV exports exist for transactions and payrolls.
- The frontend handles loading, empty, and API-error states through shared components.

## Findings and risks

### Critical: database availability is currently blocked

The scheduler cannot reach the configured database, producing repeated Prisma `P1001` errors. This blocks meaningful end-to-end verification.

The current health endpoint returns success without checking the database, so deployment monitoring could report a healthy service while payroll work is unavailable.

**Evidence:**

- [`backend/src/routes/index.ts`](backend/src/routes/index.ts#L14-L21) returns a static health response.
- [`backend/src/jobs/payroll-scheduler.job.ts`](backend/src/jobs/payroll-scheduler.job.ts#L7-L14) queries the database immediately.
- Runtime log reports failure to reach the Supabase pooler on port `6543`.

**Recommended action:**

1. Verify DNS, Supabase project availability, connection pooler settings, network access, and the effective `DATABASE_URL`.
2. Add a database-backed readiness endpoint separate from the liveness endpoint.
3. Make deployment health checks use readiness for traffic eligibility.
4. Run authenticated API smoke tests after connectivity is restored.

### Critical: payroll scheduler and queue are not durable

Payroll execution is implemented inside the API process. The scheduler uses `setInterval`, and the queue tracks active jobs in an in-memory `Set`.

This creates several production risks:

- A process restart can miss due payrolls or leave jobs in an uncertain state.
- Multiple API instances can race to process the same payroll.
- Deployments and crashes can interrupt a job without durable retry state.
- There is no persistent dead-letter or failure queue.

**Evidence:**

- [`backend/src/jobs/payroll-scheduler.job.ts`](backend/src/jobs/payroll-scheduler.job.ts#L27-L43)
- [`backend/src/queues/payroll.queue.ts`](backend/src/queues/payroll.queue.ts#L8-L40)

**Recommended action:**

Move scheduled payroll execution to a persistent queue/worker system or a durable external scheduler. Add database-backed job claims, idempotency keys, retry policy, dead-letter handling, and execution audit records.

### Addressed locally: webhook processing acknowledged failures

The original webhook handler caught processing errors, logged them, and still
responded with HTTP 200. It now passes processing errors to the global error
handler, producing a non-2xx response for retryable failures.

**Evidence:** [`backend/src/controllers/webhook.controller.ts`](backend/src/controllers/webhook.controller.ts#L38-L60)

**Remaining action:**

- Persist webhook receipt/event state before processing.
- Make event handling idempotent with unique event or provider-reference constraints.
- Record the provider event ID, event type, reference, and processing result.
- Verify amount, currency, reference, and expected transaction type before crediting or refunding money.

Amount, currency, reference type, and atomic transaction-state checks are now
implemented for deposit success. Persistent event receipts remain outstanding.

### Addressed locally: deposit and webhook wallet-credit idempotency

The original deposit verification and webhook paths used a read-then-write
pattern. They now use conditional `updateMany` transitions inside short Prisma
transactions and change the wallet only when exactly one row transitions.

**Evidence:**

- [`backend/src/controllers/wallet.controller.ts`](backend/src/controllers/wallet.controller.ts#L112-L157)
- [`backend/src/controllers/webhook.controller.ts`](backend/src/controllers/webhook.controller.ts#L63-L84)

This behavior is covered by concurrent local tests. A separate persistent
provider-event record is still recommended for delivery history and side-effect
recovery.

### Addressed locally: API endpoint bypassed the approval workflow

The original `/payrolls/schedule` endpoint directly created a `SCHEDULED`
payroll with the same user as both creator and approver.

That endpoint now returns HTTP 410 and directs callers to the draft, submit, and
approve workflow. The unused frontend method was removed, and legacy test
scripts were migrated to the controlled workflow.

**Evidence:** [`backend/src/controllers/payroll.controller.ts`](backend/src/controllers/payroll.controller.ts#L153-L171)

The local integration suite proves that a creator cannot approve when another
eligible approver exists, that a Finance user can independently approve, and
that the approved payroll records that Finance user.

The compatibility route can be removed completely after known external API
clients have migrated away from it.

### High: in-process failure handling can leave operational ambiguity

Payroll processing changes status and wallet reservations before all provider calls complete. Provider calls, wallet deductions, transaction creation, and webhook completion happen across separate operations.

This is normal for an asynchronous payment system, but the current implementation needs stronger recovery guarantees when the process crashes between steps.

**Evidence:** [`backend/src/jobs/process-payroll.job.ts`](backend/src/jobs/process-payroll.job.ts#L21-L65) and [`backend/src/jobs/process-payroll.job.ts`](backend/src/jobs/process-payroll.job.ts#L139-L220)

**Recommended action:**

- Model explicit transfer states and retry ownership.
- Store an idempotency key before calling Paystack.
- Avoid issuing a second provider transfer for a transaction whose provider request may already have succeeded.
- Reconcile pending provider transfers periodically.
- Add recovery for payrolls left in `PROCESSING` after a crash.

### High: temporary credentials are generated with weak randomness

Team invitation passwords use `Math.random()` and are returned to the caller. The frontend then displays the temporary password in the settings screen.

**Evidence:**

- [`backend/src/controllers/team.controller.ts`](backend/src/controllers/team.controller.ts#L56-L65)
- [`frontend/src/pages/SettingsPage.tsx`](frontend/src/pages/SettingsPage.tsx#L47-L60)

**Recommended action:**

Use `crypto.randomBytes` or a proper invite-token flow. Prefer a one-time password setup link, expire the token, and avoid returning reusable credentials in normal API responses.

### High: JWT fallback configuration is unsafe if environment selection is wrong

The backend uses `fallback-secret-change-me` whenever the environment is not exactly `production` and `JWT_SECRET` is absent.

**Evidence:** [`backend/src/config/index.ts`](backend/src/config/index.ts#L6-L20) and [`backend/src/config/index.ts`](backend/src/config/index.ts#L33-L35)

**Recommended action:**

Fail startup whenever `JWT_SECRET` is absent outside explicitly local development. Validate `NODE_ENV`, secrets, and provider mode as part of deployment startup checks.

### Medium: frontend payroll actions do not surface failures

Submit, approve, cancel, and retry actions call the API and reload on success, but do not attach error handlers or show a pending state.

**Evidence:** [`frontend/src/pages/PayrollPage.tsx`](frontend/src/pages/PayrollPage.tsx#L116-L131)

**Impact:** A failed approval or cancellation can look like a button that did nothing, while the browser may report an unhandled rejected promise.

**Recommended action:**

Create a shared mutation helper with loading, success, and error states. Disable the specific action while pending and show the server error inline.

### Medium: frontend linting is not reproducible

The `lint` script calls ESLint, but ESLint is absent from `frontend/package.json`.

**Evidence:** [`frontend/package.json`](frontend/package.json#L6-L28)

**Recommended action:**

Add ESLint and its configuration, or remove the script until linting is intentionally configured. Run lint in CI.

### Medium: frontend bundle is larger than necessary

The production build generated a 617.82 KB minified JavaScript chunk and emitted a Vite chunk-size warning.

The app imports charting functionality in the main application path, and the current view system renders all page modules through one entry bundle.

**Evidence:** [`frontend/src/App.tsx`](frontend/src/App.tsx#L1-L55) and the frontend build output.

**Recommended action:**

- Lazy-load large pages and chart components.
- Use route-level code splitting.
- Review Recharts usage and import only required chart modules where possible.

### Medium: navigation is state-based rather than route-based

The frontend stores the active view in React state and reads `?view=` only during initial mount.

**Evidence:** [`frontend/src/App.tsx`](frontend/src/App.tsx#L15-L37)

**Impact:** Browser back/forward behavior, deep links, and refresh behavior are weaker than a normal route-based application.

**Recommended action:**

Use a router or consistently synchronize active views with the URL and browser history.

### Medium: authentication token is stored in local storage

The bearer token is stored in `localStorage`.

**Evidence:** [`frontend/src/api.ts`](frontend/src/api.ts#L49-L63)

**Impact:** Any successful XSS issue can expose the token for the configured 30-day lifetime.

**Recommended action:**

Consider short-lived access tokens with refresh-token rotation in secure, HttpOnly cookies. If local storage is retained, add a strict CSP, dependency review, output encoding review, and short token lifetime.

### Medium: test coverage is not sufficient for a money-moving system

The repository contains manual API scripts, but the backend package does not define a `test` script or a test framework. The existing scripts depend on live services and are not a substitute for deterministic automated tests.

**Recommended action:**

Add automated tests for:

- Registration/login and company isolation.
- Role authorization and separation of duties.
- Wallet deposits and duplicate verification.
- Webhook signature validation and duplicate delivery.
- Payroll reservation, cancellation, retry, and crash recovery.
- Paystack transfer success, failure, and reversal flows.

## Architecture assessment

### Current shape

```text
React/Vite frontend
        |
        | Bearer JWT + JSON API
        v
Express API
        |
        +-- Prisma/PostgreSQL
        +-- Paystack REST API
        +-- In-process scheduler
        +-- In-memory payroll queue
        +-- In-app notifications/audit logs
```

This is appropriate for a local pilot or controlled staging environment. The scheduler and queue are the main architectural boundary that must change before horizontally scaled production deployment.

## Recommended implementation order

### Phase 1: restore verified runtime

1. Fix Supabase database connectivity.
2. Confirm Prisma can run a read query from the deployed backend.
3. Add separate liveness and readiness endpoints.
4. Run authenticated smoke tests against the real environment.

### Phase 2: protect money movement

1. Make deposit verification and webhooks idempotent.
2. Persist webhook receipts and provider event IDs.
3. Fix retryable webhook response behavior.
4. Add transfer reconciliation for pending transactions.
5. Remove or restrict the direct auto-approval payroll endpoint.

### Phase 3: make payroll execution durable

1. Replace the in-process queue with a persistent queue/worker.
2. Add job claims and distributed locking.
3. Add retry and dead-letter behavior.
4. Recover stuck `PROCESSING` payrolls.
5. Add end-to-end provider simulation tests.

### Phase 4: improve engineering quality

1. Configure ESLint and CI.
2. Add automated backend integration tests.
3. Add frontend mutation error states and action loading states.
4. Split the frontend bundle.
5. Move navigation to URL-backed routes.
6. Harden temporary credentials and JWT configuration.

## Final conclusion

REMIT is worth continuing. The product surface and backend boundaries are already substantial enough for a controlled pilot. The immediate work should focus on operational correctness and financial safety rather than adding more dashboard features.

The project should not be declared production-ready until database connectivity, durable payroll execution, webhook retry/idempotency, approval enforcement, and automated money-flow tests are all verified in a deployed environment.
