# REMIT Support Centre

## Current product boundary

The first Support Centre slice is company-facing. OWNER, ADMIN, FINANCE, and
VIEWER users can create, read, and reply to tickets for their own company.
OWNER and ADMIN users can close tickets. EMPLOYEE accounts receive no support
permissions because the employee portal remains outside the current product.

REMIT platform support staff are deliberately not represented by a company
ADMIN role. They use separate `PlatformUser` identities, platform-only JWTs,
permissions, and audit records.

## Data model

- `SupportTicket` stores the company, creator, category, priority, status,
  subject, activity timestamps, and an optional linked payroll or transaction.
- `SupportMessage` stores the conversation. Messages identify customer,
  support, and system senders. Private internal notes are visible only in the
  platform console.
- `PlatformUser` stores support agents and support administrators separately
  from company users.
- `PlatformAuditLog` records assignments, replies, notes, status changes, staff
  changes, and platform logins.
- Every ticket query is scoped by `companyId`.
- A linked payroll or transaction is accepted only when it belongs to the same
  company as the authenticated user.
- Ticket creation, replies, and closure write to the company audit log.

## Ticket workflow

Available statuses are `OPEN`, `IN_PROGRESS`, `WAITING_FOR_CUSTOMER`,
`RESOLVED`, and `CLOSED`. Company users currently create tickets as `OPEN`, add
replies, and OWNER or ADMIN users may close them. Replying to a resolved ticket
reopens it. Closed tickets cannot receive more replies.

Available categories are payment failure, wallet funding, bank verification,
payroll issue, account access, and general questions. Priorities are low,
normal, high, and urgent.

## API

All routes require bearer authentication.

| Method | Route | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/support/tickets` | `support.read` | List company tickets |
| POST | `/api/v1/support/tickets` | `support.create` | Create a ticket and its first message |
| GET | `/api/v1/support/tickets/:id` | `support.read` | Read one company ticket and conversation |
| POST | `/api/v1/support/tickets/:id/messages` | `support.reply` | Add a customer reply |
| PUT | `/api/v1/support/tickets/:id/close` | `support.close` | Close a ticket |

List queries accept `page`, `limit`, `status`, `category`, and `search`.

## Platform support console

The console is available at `/platform`. It provides a cross-company queue,
queue metrics, search, assignment filters, ticket assignment, status changes,
public replies, and private internal notes.

Platform API routes use `/api/v1/platform`. Company JWTs are rejected from
these routes, and platform JWTs are rejected from company routes.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/v1/platform/auth/login` | Platform staff login |
| GET | `/api/v1/platform/auth/me` | Current platform account |
| GET/POST | `/api/v1/platform/auth/staff` | List staff or create staff as a support admin |
| GET | `/api/v1/platform/support/summary` | Queue metrics |
| GET | `/api/v1/platform/support/tickets` | Cross-company ticket queue |
| GET | `/api/v1/platform/support/tickets/:id` | Full conversation including internal notes |
| PUT | `/api/v1/platform/support/tickets/:id/assignment` | Assign or unassign a ticket |
| PUT | `/api/v1/platform/support/tickets/:id/status` | Change ticket status |
| POST | `/api/v1/platform/support/tickets/:id/messages` | Send a public reply or internal note |

Create the first support administrator with `pnpm platform:seed-admin` after
setting the `PLATFORM_ADMIN_*` environment variables. There is no public
platform registration endpoint.

## Database rollout

Apply `backend/prisma/migrations/20260801150000_add_support_centre/migration.sql`
before deploying the backend. The migration was validated from an empty
database together with all preceding migrations. It was applied to the
configured live Supabase database on August 1, 2026, and Prisma confirmed that
all eight migrations are up to date.

The platform support migration at
`backend/prisma/migrations/20260801170000_add_platform_support/migration.sql`
has been validated with the complete migration chain on an isolated database.
It has not yet been applied to the live database.

## Next support slice

1. Add attachment storage, file validation, and retention rules.
2. Add response-time metrics, SLA timers, and escalation policies.
3. Add staff-management screens for creating and deactivating agents.
4. Add outbound email delivery for public support replies.
