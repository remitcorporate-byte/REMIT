# REMIT Security and Money-Movement Audit

Complements `PLATFORM_CODE_AUDIT.md`, which is maintainability-only. This audit
covers correctness, security, and money movement: guarded money-state
transitions, database-claimed job processing, the reconciliation loop, and
permission coherence across the web, platform console, and mobile clients.

Tracing flows across files surfaced three critical issues: the payroll retry
feature is permanently broken by a unique constraint, ambiguous transfer errors
create an undetectable double-payment path, and both deployment configs are
missing `PLATFORM_JWT_SECRET`, so the next production deploy crashes at boot.

## Architecture (mental model)

Express 5 + Prisma/Postgres backend with two auth boundaries (company JWT,
platform JWT with separate secret/table), Paystack for money movement, and a
payroll pipeline: draft → submit → approve (reserves wallet funds) →
scheduler/queue claims it (releases reservation, debits per employee, initiates
transfers) → webhooks or a polling reconciliation job settle each transfer.
Three clients (React web, platform support console at /platform, Expo mobile)
all consume the same permission list served at login.

## Critical

### C1 — Payroll retry is permanently broken for transfer-level failures (high confidence)

`Transaction.payrollEmployeeId` is `@unique` (schema.prisma:259) and nothing
ever unlinks a failed transaction. Retry resets rows to PENDING, then
process-payroll.job.ts:184 creates a new transaction for the same
`payrollEmployeeId` → guaranteed P2002 → the per-employee catch marks the row
FAILED again. Retry only works for rows that failed before a transaction
existed (e.g. recipient creation). Every transfer that reached Paystack and
failed is unrecoverable through the product. No money is lost (debit + create
share a transaction that rolls back), but the flow is a dead end.

### C2 — Reverse-on-error creates an undetectable double-payment path (medium-high confidence)

process-payroll.job.ts:235–258: any error from `initiateTransfer` — including a
timeout after Paystack accepted — re-credits the wallet and marks the
transaction FAILED. If the transfer actually succeeded, the later
`transfer.success` webhook is ignored (webhook.controller.ts:163 requires
status PENDING) and reconciliation never sees it (scans PENDING only). Company
gets refunded in-app and the employee gets paid, with no code path able to
detect it. Ambiguous errors should stay PENDING for the reconciliation loop,
which already does the right verification.

### C3 — Next production deploy crashes at boot (high confidence)

config/index.ts:8 hard-requires `PLATFORM_JWT_SECRET` in production, but
render.yaml (both services) and the GCP demo's Secret Manager list don't define
it. The GCP doc also says "seven migrations" — there are nine — so the deployed
demo DB predates the support/platform tables. Bonus trap: render.yaml uses
`generateValue: true` for `JWT_SECRET` separately per service, giving API and
worker different secrets.

## High

### H1 — Owners never get notifications

`notifyCompanyAdmins` filters role: 'ADMIN' only (notification.service.ts:44),
but registration creates OWNER. Every single-founder company gets zero
deposit/payroll alerts. Proven inconsistency: `notifySupportParticipants` in
the same file correctly includes OWNER.

### H2 — Approve/cancel races corrupt reservedBalance with no repair tool

Approve is find-check-then-unguarded-update (payroll.controller.ts:268–325);
two concurrent approvals double-reserve, the job releases once, and the excess
reservation is stuck forever — no endpoint can fix a wallet reservation. Cancel
racing a job claim can double-release (draining another payroll's reservation
via the min() clamp) and stamp CANCELLED on an actively-paying payroll. The
processing job itself uses guarded updateMany transitions — the endpoints
should too.

### H3 — Mobile payroll creation always 400s

mobile/app/payroll/new.tsx sends free-text dates (placeholder 2026-08-31); the
backend requires full ISO via `z.string().datetime()`. The web app converts
properly; mobile doesn't.

### H4 — Mock mode mints free balance, and the public GCP demo runs mock mode

`verifyDeposit` skips amount checks under `USE_PAYSTACK_MOCK` and mock verify
always succeeds — any self-registered user can credit arbitrary balance against
the shared Supabase DB. One env var away from production semantics.

### H5 — Comma-separated FRONTEND_URL breaks the deposit callback

The GCP doc requires a comma-separated value for CORS, but
wallet.controller.ts:95 interpolates the raw string into Paystack's
`callback_url` → `https://a,https://b/?view=wallet…` → users never return to
the verify flow.

## Medium

### M1 — EMPLOYEE role dead-ends everywhere

Web tells employees to use the mobile app; mobile has no employee experience
(Overview calls a 403 endpoint, no notifications screen despite that being the
role's only permission), and no code path can even create an EMPLOYEE user.

### M2 — No password reset/change anywhere

Invited members get a temp password shown in plaintext in the UI (no email
integration exists) and can never rotate it; forgotten passwords require DB
surgery.

### M3 — Employee deactivation is irreversible and doesn't stop payment

`isActive` isn't updatable, no client shows inactive employees, and processing
never re-checks `isActive` — deactivated employees in already-approved payrolls
still get paid.

### M4 — Customer replies to WAITING_FOR_CUSTOMER tickets don't change status

Only RESOLVED→OPEN is handled, so answered tickets stay in the console's
"waiting" bucket — the steady state of every conversation, since agent replies
always set WAITING_FOR_CUSTOMER.

### M5 — Email normalization inconsistent

Mobile and platform lowercase, web/company auth doesn't → register mixed-case
on web, can't log in on mobile; case-variant duplicates possible.

### M6 — Paystack webhooks share the general 100-req/15-min IP limit (server.ts:43)

Bursts can 429 Paystack. Transfers self-heal via reconciliation, but deposits
have no reconciliation — dropped `charge.success` leaves deposits PENDING
indefinitely.

### M7 — Web payroll actions swallow errors

`api.approvePayroll(id).then(reload)` with no catch (PayrollPage.tsx:126) —
"insufficient balance" on approve shows nothing. Mobile handles this correctly.

### M8 — All three clients hard-code limit=100 with no paging

Records past 100 silently vanish from every list, including the payroll
employee picker.

### M9 — GET /transactions casts filters as any → invalid enum = Prisma error = 500

Its duplicate GET /wallet/transactions validates. Duplicated logic drifting.

### M10 — "Automated payroll" never automates

`paymentFrequency`/`nextPaymentDate` are diligently maintained after every
transfer but nothing reads them — no job creates recurring payrolls.
Half-built core feature.

### M11 — Full bank account numbers returned to every read role (incl. VIEWER)

Stored plaintext, while exports mask to last-4 and the env template advertises
an unused `ENCRYPTION_KEY` for exactly this.

### M12 — BullMQ retries are dead config

The catch marks the payroll FAILED before rethrowing, so all 5 retries no-op
against the status guard, and the scheduler runs in every API instance instead
of the worker.

## Low

### L1 — printPayslip builds HTML via document.write with unescaped employee data

Same-tenant stored XSS (PayrollPage.tsx:259).

### L2 — CSV exports don't guard =/+/-/@ formula injection

### L3 — Prisma P2002 collisions surface as raw 500s

Employee email update, company-email-vs-user-email at registration; the error
handler has no Prisma branch.

### L4 — 30-day JWTs in localStorage, no server-side revocation

Per-request `isActive` check is the one mitigation; dev fallback secrets
whenever `NODE_ENV` ≠ "production".

### L5 — Dead code inventory

`validate` middleware never mounted; `initiateBulkTransfer`, backend naira/date
helpers unused; WITHDRAWAL, LOW_BALANCE, EMPLOYEE_ADDED, EMAIL/SMS enums have
no producers; Google OAuth exists only as schema fields + env vars;
ENV_TEMPLATE.txt promises SendGrid/Twilio/Cloudinary/Sentry/Bull Board that no
code references; POST /payrolls/schedule is a 410 tombstone;
`api.updatePayrollDraft` has no UI in any client (drafts can't be edited, only
recreated); retryPayroll fetches an include it never uses.

### L6 — Docs drift

GCP migration count, aspirational env template. Positively: ROLE_ACCESS.md
matches the code exactly, and PLATFORM_CODE_AUDIT.md's
~24-independent-PrismaClient finding is confirmed.

### L7 — Shutdown doesn't await in-process payroll jobs

Heartbeat recovery eventually catches it.

### L8 — Support console

Agents see their own name in the assignee select of unassigned tickets; search
is client-side over the loaded 100; agents can silently take over assigned
tickets.

### L9 — Registration reveals account existence (enumeration)

Rate-limited only.

## What holds up well

Deposit crediting, webhook settlement, and reconciliation all use guarded
atomic transitions — duplicate webhooks can't double-credit. Webhook HMAC
verification is textbook (raw body, timing-safe compare, amount/currency
cross-check). Tenant isolation is consistent — every company query traced
filters by server-side companyId. Platform auth is a genuinely separate
boundary. Separation-of-duties on approval is enforced server-side. No secrets
or build output in git.
