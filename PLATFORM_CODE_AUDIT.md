# REMIT Platform Code Audit

Date: 1 August 2026

## Scope

This audit covers authored TypeScript, React, and CSS in:

- `backend/src` and `backend/scripts`
- `frontend/src`
- `mobile/app`, `mobile/components`, `mobile/hooks`, and `mobile/src`

Generated files, dependencies, build output, and Prisma migrations were excluded.
This is a maintainability audit. It does not claim every product flow has been
verified in a browser or against the live database.

## Verdict

The project has a workable domain structure, but maintainability is uneven.
The recently added platform support console is now divided into small,
single-purpose files. Most remaining debt predates that console and is
concentrated in compressed CSS, large frontend pages, and backend modules that
combine validation, orchestration, persistence, and response formatting.

Snapshot after the platform console cleanup:

- 139 authored TypeScript, TSX, and CSS files inspected
- 27 files longer than 150 lines
- 67 files with at least one line longer than 100 characters
- 4 existing stylesheets with lines longer than 500 characters
- 24 backend files construct their own `PrismaClient`

CSS is allowed to exceed 150 lines under `AGENTS.md`. It must still be readable
and should only be split when a stylesheet mixes unrelated UI areas.

## Priority 0: unreadable compressed CSS

These files are hand-packed and should be expanded without changing behavior:

| File | Lines | Longest line |
| --- | ---: | ---: |
| `frontend/src/styles.css` | 148 | 2,328 characters |
| `frontend/src/layouts/operations.css` | 10 | 1,259 characters |
| `frontend/src/pages/auth.css` | 14 | 990 characters |
| `frontend/src/pages/landing.css` | 121 | 526 characters |

This is the clearest violation of the new rules. Formatting one declaration per
line should happen before visual redesign work because it makes later changes
reviewable. The files do not need arbitrary line-count splitting.

## Priority 1: frontend pages doing several jobs

### `frontend/src/pages/PayrollPage.tsx` — 272 lines

It renders the payroll list, groups status data, renders payroll detail, and
contains payslip printing behavior. Extract the detail and payslip sections,
then keep the page responsible for page-level composition.

### `frontend/src/pages/SupportPage.tsx` — 248 lines

It loads tickets, selects a thread, creates tickets, sends messages, and renders
both the list and conversation. Use plain `SupportTicketList`,
`SupportTicketThread`, and `CreateSupportTicketForm` components plus one hook.

### `frontend/src/pages/SettingsPage.tsx` — 220 lines

Company settings, team management, system details, and audit information are
separate concerns. Extract a section component for each existing section.

### `frontend/src/pages/EmployeesPage.tsx` — 215 lines

The page combines employee listing, creation, form state, and bank verification.
Extract the employee form and keep bank verification with that form.

`LandingPage.tsx` is 204 lines, but it is primarily one presentational page.
Split it by visual section only when a section is being changed; do not invent a
configuration system for it.

## Priority 1: backend controllers and jobs doing several jobs

The largest production modules are:

| File | Lines |
| --- | ---: |
| `backend/src/controllers/payroll.controller.ts` | 531 |
| `backend/src/controllers/webhook.controller.ts` | 406 |
| `backend/src/jobs/process-payroll.job.ts` | 375 |
| `backend/src/controllers/employee.controller.ts` | 367 |
| `backend/src/jobs/transfer-reconciliation.job.ts` | 330 |
| `backend/src/controllers/wallet.controller.ts` | 299 |
| `backend/src/controllers/support.controller.ts` | 280 |
| `backend/src/controllers/company.controller.ts` | 279 |
| `backend/src/services/paystack.service.ts` | 275 |

Split by real use case, not by arbitrary helper layers. For example, payroll
creation, approval, processing, and reads can each have a focused controller or
service. Webhook signature verification, event routing, and event handlers are
also distinct jobs.

Do these refactors one domain at a time with existing tests running. Large
backend rewrites are higher risk than formatting CSS or extracting React UI.

## Priority 1: Prisma client ownership

Twenty-four backend files call `new PrismaClient()` independently. In a
long-running or serverless process, this makes connection ownership difficult to
reason about and can create more pools than intended.

Create one explicit backend Prisma client module and import it from controllers,
jobs, middleware, routes, and services. This abstraction is justified because
the same construction pattern appears far more than three times.

## Priority 2: broad frontend domain files

- `frontend/src/api.ts` is 220 lines and contains unrelated API domains.
- `frontend/src/types.ts` is 260 lines and contains unrelated domain models.

Split these by existing product domains such as payroll, employees, support,
wallet, and company. Do not add factories or a generic repository layer.

## Priority 2: mobile concentration

- `mobile/src/components/ui.tsx` is 171 lines and groups several UI primitives.
- `mobile/app/employee/new.tsx` is 156 lines and combines screen composition and
  form behavior.

Move each reusable UI primitive into a named file when it is next modified.
Extract the employee form from the route, leaving the Expo route as composition.

## Platform support work corrected during this audit

The new platform support implementation was changed from two large frontend
components and one large backend controller into focused files:

- Session bootstrapping, login, queue state, list, thread, controls, messages,
  and composer now have separate React files.
- Platform API contracts now use explicit named types.
- Repeated conditional classes use `clsx` or a named helper.
- The platform support backend is split into query, assignment, response, and
  status controllers with shared validation and filtering kept explicit.
- Platform authentication middleware is separate from company-user middleware.
- Platform CSS is readable and contains no lines longer than 100 characters.

All new React component files are below 150 lines. The only request guard kept
in `useSupportQueue` protects a real race when staff switch tickets before a
ticket request finishes.

## Recommended order of work

1. Expand the four compressed CSS files without visual changes.
2. Split `SupportPage.tsx` because it mirrors the platform support boundaries.
3. Split `PayrollPage.tsx`, then verify list, approval, detail, and payslip flows.
4. Split `EmployeesPage.tsx` and `SettingsPage.tsx` by visible section.
5. Introduce one shared Prisma client and run backend integration tests.
6. Refactor payroll and webhook backend modules one use case at a time.
7. Split frontend API and type files by the same existing domains.
8. Clean the two mobile hotspots when those flows are next changed.

## Verification status

- Frontend production build: passed after the platform component refactor
- Backend TypeScript build: passed after the controller and middleware split
- Platform support migration: present locally; live migration remains a
  deployment operation and is not performed by this audit
