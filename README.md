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

Configure the backend from [`ENV_TEMPLATE.txt`](ENV_TEMPLATE.txt), including PostgreSQL, Paystack, Redis when using Redis queue mode, `JWT_SECRET`, and a base64 encoded 32-byte `FIELD_ENCRYPTION_KEY`.

## Checks

```bash
cd backend && pnpm build && pnpm test
cd ../frontend && pnpm build
```

Operational deployment and support notes remain in the root documentation files. Historical architecture documents are in [`docs/archive`](docs/archive/).
