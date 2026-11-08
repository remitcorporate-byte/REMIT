# REMIT

REMIT is a Nigerian payroll platform that funds company wallets and pays employees through Paystack.

## Stack

- **Backend:** Node.js, Express 5, Prisma, PostgreSQL, BullMQ, Redis, and Paystack.
- **Web app:** React 19 with Vite and TypeScript.
- **Mobile app:** Expo React Native.

Payroll processing is durable: the API schedules work through BullMQ, Redis-backed workers process transfers, and Paystack references are reconciled after uncertain network responses.

## Install and run

There is no root `package.json`. Install each package separately:

```bash
cd backend
pnpm install
pnpm prisma generate
pnpm dev
```

```bash
cd frontend
pnpm install
pnpm dev
```

```bash
cd mobile
bun install
bunx expo start
```

Configure the backend from [`ENV_TEMPLATE.txt`](ENV_TEMPLATE.txt), including PostgreSQL, Paystack, Redis when using Redis queue mode, `JWT_SECRET`, and a base64 encoded 32-byte `FIELD_ENCRYPTION_KEY`. Authentication uses 15-minute access tokens and hashed, rotating refresh sessions. Set `JWT_ACCESS_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_CROSS_SITE`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `REQUIRE_APPROVAL_OTP`; production requires Resend so reset and payroll approval codes are never logged.

## Checks

```bash
cd backend && pnpm build && pnpm test
cd ../frontend && pnpm build
```

To run the auth session and OTP end-to-end checks against a disposable local
Postgres, start Postgres on any local port and point both Prisma URLs at it:

```bash
cd backend
export DATABASE_URL='postgresql://postgres:password@127.0.0.1:55434/remit_test?schema=public'
export DIRECT_URL="$DATABASE_URL"
pnpm prisma migrate deploy && pnpm prisma generate && pnpm build
NODE_ENV=test PORT=5055 DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
JWT_SECRET=local-test-secret FIELD_ENCRYPTION_KEY=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc= \
USE_PAYSTACK_MOCK=true PAYSTACK_SECRET_KEY=sk_test_local_only PAYROLL_QUEUE_MODE=in-process \
AUTH_RATE_LIMIT_MAX=500 GENERAL_RATE_LIMIT_MAX=5000 REQUIRE_APPROVAL_OTP=true \
JWT_ACCESS_TTL=15m APP_URL=http://localhost:5173 SERVER_LOG=/tmp/remit-auth-e2e-server.log \
node dist/server.js > /tmp/remit-auth-e2e-server.log 2>&1 &
until curl -fsS http://127.0.0.1:5055/api/v1/health >/dev/null; do sleep 1; done
pnpm run test:auth-e2e
```

The existing local integration runner can include this check with
`AUTH_E2E=true bash scripts/test-local-supabase.sh` (and accepts its usual
`DATABASE_URL` and `PORT` overrides).

Operational deployment and support notes remain in the root documentation files. Historical architecture documents are in [`docs/archive`](docs/archive/).
