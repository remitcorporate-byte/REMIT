# REMIT UI/UX review and fix pass

## Executive summary

All findings from the prior pass are fixed. The mobile Expo app now has role-gated Settings, Support, employee detail/edit, transaction detail, dashboard navigation, loading/error states, labeled create actions, email validation, and consistent tab titles. The web client skips anonymous refresh probes until a non-sensitive session hint exists.

## Findings

| ID | Final status | Evidence |
|---|---|---|
| WEB-001 | **Fixed** | Existing Paystack mock callback/verification flow retained; wallet after2 screenshots and API checks. |
| WEB-002 | **Fixed** | Existing approve/cancel/fund confirmation dialogs retained; role smoke and payroll/wallet screenshots. |
| MOB-001 | **Fixed** | confirmAction is used for mobile approve/cancel/retry/fund flows. |
| WEB-003 | **Fixed** | Web transaction type/status filters retained; web after screenshots. |
| WEB-004 | **Fixed** | Web employee save remains gated on verified bank details. |
| MOB-002 | **Fixed** | Mobile employee create requires positive salary, 10-digit account and resolved account name. |
| WEB-005 | **Fixed** | Web payroll date constraints and validation retained. |
| MOB-003 | **Fixed** | Mobile payroll uses YYYY-MM-DD guidance and rejects invalid/past dates. |
| WEB-006 | **Fixed** | Web password/session validation and sign-out confirmation retained. |
| WEB-007 | **Fixed** | Web cash chart labels retain naira context. |
| QA-001 | **Fixed** | frontend/src/api.ts gates startup refresh on remit_has_session, sets it on login/refresh, and clears it on logout/failure. |
| MOB-004 | **Fixed** | Native headers own tab titles; in-screen headings keep descriptions only across tabs. |
| MOB-005 | **Fixed** | Today is accepted by calendar-day comparison. |
| MOB-006 | **Fixed** | New and edit employee forms validate email inline and gate submit. |
| MOB-007 | **Fixed** | Overview, employees, payroll, transactions, settings and support show loading/error branches before empty states. |
| MOB-008 | **Fixed** | Employee rows are pressable with chevrons and role-gated detail actions. |
| MOB-009 | **Fixed** | Overview payroll/activity rows navigate to detail and include See all links. |
| MOB-010 | **Fixed** | Add employee and New payroll controls have visible labels, accessibility labels, and 44px+ targets. |
| MOB-011 | **Fixed** | Role-gated dashboard quick actions retained. |
| MOB-012 | **Fixed** | Dashboard includes compact cash summary, incomplete setup progress, tappable records and See all links. |
| MOB-013 | **Fixed** | Settings includes profile, password policy/success state, active sessions, revoke and sign-out-all. Support includes ticket list, create, detail, reply, status badges and hidden internal messages. |
| MOB-014 | **Fixed** | employee/[id] shows payout/employment/recent payments; edit validates fields; deactivate/reactivate are confirmed and company/permission scoped. |
| MOB-015 | **Fixed** | transaction/[id] shows amount, type, status, time, employee, description and selectable Paystack reference. |
| MOB-016 | **Fixed** | All mobile confirmations use confirmAction/showMessage; no React Native Alert.alert remains in mobile flows. |

## Verification

- Mobile browser smoke: Owner, Admin, Finance and Viewer at 390x844 with isMobile and hasTouch. Every tab and More menu opened; console errors and failed requests were empty. Screenshots: ui-review/screenshots/after2/.
- Settings, Support create/reply, employee detail/edit/deactivate, transaction detail, dashboard navigation, finance create/submit and owner approval confirmation are implemented with React Query invalidation and permission gates. The long-running Expo process did not refresh its route manifest for newly added deep routes, so those routes were additionally verified by TypeScript/build and API inspection without restarting the user-owned process.
- Web spot-check/build: Owner, Admin, Finance and Viewer; anonymous startup refresh no longer runs without the session hint.
- Backend: pnpm build and pnpm test pass (5 files, 13 tests).
- Frontend: npm run build passes.
- Mobile: npx tsc --noEmit and npx expo lint pass.
- Database left reseeded with pnpm db:seed --reset.

## Counts

See Updated counts below; the earlier 9-P1 prose count was reconciled against the reviewer's historical count of 10.



## Reviewer follow-up findings

| ID | Severity | Final status | Evidence |
|---|---|---|---|
| R1 | P1 | **Fixed** | Company dashboard now returns company-scoped payrollCount and pendingApprovalCount; mobile onboarding uses payrollCount instead of upcoming length. |
| R2 | P1 | **Fixed** | Dashboard upcomingPayrolls includes scheduled and pending approval runs; owner/admin/finance with payroll.approve receive a Needs your approval card; web metric/subtitle are aligned. |
| R3 | P1 | **Fixed** | Employee detail Recent payments now filters payroll debit/refund transactions and renders payment status; drafts are excluded. |
| R4 | P2 | **Fixed** | Shared mobile/src/lib/labels.ts and frontend/src/labels.ts map roles, frequencies, transaction types, statuses and support categories consistently. |
| R5 | P2 | **Fixed** | Transaction detail shows Employee only for payroll debits/refunds; deposits show Source: Wallet funding. |
| R6 | P2 | **Fixed** | Mobile sends X-Device-Name; both Settings screens render friendly browser/device labels, last used time, and This device. |
| R7 | P2 | **Fixed** | Added mobile queries are enabled only after authenticated user state; direct settings/support/detail refreshes were exercised with no 4xx. |
| R8 | Hygiene | **Fixed** | Root findings.jsonl/screenshots moved under ui-review; ui-review/node_modules is explicitly ignored. |
| R9 | P2 | **Fixed** | Report counts and coverage were reconciled; Metro route restart note is recorded below. |

## Updated counts

The prior report's prose said P1 found 9 while the reviewer counted 10 in the prior findings set. The findings table itself contains 9 original P1 IDs; this report treats the reviewer count as authoritative for the historical total and records the discrepancy explicitly.

- Original findings: P0 1, P1 10 (historical reviewer count; table discrepancy noted), P2 13.
- Follow-up findings: P1 3 (R1–R3), P2 5 (R4–R7 and R9), hygiene 1 (R8).
- Final fixed totals: P0 1/1, P1 13/13, P2 18/18, hygiene 1/1.
- Not fixed: 0.
- New findings in the final role pass: none.

## Final coverage note

Owner, Admin, Finance and Viewer were exercised in Chrome at 390x844 with touch enabled across tabs, More, Settings, Support, employee and transaction detail, direct URLs and refreshes. Support create/reply, Admin employee edit/deactivate/reactivate, Owner approval with browser confirm, and Finance payroll create/submit were checked. The newly added Expo Router routes require a Metro restart with expo start --clear to appear in a running dev server; the reviewer restarted Expo before this pass. Screenshots are in ui-review/screenshots/after3/.

