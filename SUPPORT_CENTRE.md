# REMIT Support Centre

## Current product boundary

The first Support Centre slice is company-facing. OWNER, ADMIN, FINANCE, and
VIEWER users can create, read, and reply to tickets for their own company.
OWNER and ADMIN users can close tickets. EMPLOYEE accounts receive no support
permissions because the employee portal remains outside the current product.

REMIT platform support staff are deliberately not represented by a company
ADMIN role. Cross-company support operations require a separate platform
identity and authorization boundary and are the next support slice.

## Data model

- `SupportTicket` stores the company, creator, category, priority, status,
  subject, activity timestamps, and an optional linked payroll or transaction.
- `SupportMessage` stores the conversation. Messages identify customer,
  support, and system senders and support private internal notes for the future
  platform console.
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

## Database rollout

Apply `backend/prisma/migrations/20260801150000_add_support_centre/migration.sql`
before deploying the backend. The migration was validated from an empty
database together with all preceding migrations. It was applied to the
configured live Supabase database on August 1, 2026, and Prisma confirmed that
all eight migrations are up to date.

## Next support slice

1. Introduce platform staff identities and `SUPPORT_AGENT` / `SUPPORT_ADMIN`
   permissions outside company roles.
2. Add a cross-company queue with assignment, status changes, internal notes,
   and support replies.
3. Notify ticket participants when support replies or changes status.
4. Add attachment storage, file validation, and retention rules.
5. Add response-time metrics and escalation policies.
