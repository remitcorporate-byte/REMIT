#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-5000}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/remit_test?schema=public}"
export NODE_ENV=test PORT DATABASE_URL DIRECT_URL="$DATABASE_URL"
export FRONTEND_URL=http://localhost:5173
export JWT_SECRET="${JWT_SECRET:-remit-local-test-secret-do-not-use-in-production}"
export FIELD_ENCRYPTION_KEY="${FIELD_ENCRYPTION_KEY:-BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=}"
export JWT_EXPIRE=1h USE_PAYSTACK_MOCK=true
export PAYSTACK_SECRET_KEY=sk_test_local_only PAYSTACK_PUBLIC_KEY=pk_test_local_only
export PAYSTACK_BASE_URL=https://api.paystack.co
export BASE_URL="http://127.0.0.1:${PORT}/api/v1"
export GENERAL_RATE_LIMIT_MAX=1000 AUTH_RATE_LIMIT_MAX=200 PAYROLL_QUEUE_MODE=in-process

if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :${PORT}" | grep -q LISTEN; then
  echo "Port ${PORT} is already in use." >&2
  exit 1
fi

pnpm prisma migrate deploy
pnpm prisma generate
pnpm build

server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

node dist/server.js &
server_pid=$!
for _ in $(seq 1 30); do
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "${BASE_URL}/health" >/dev/null

for script in \
  scripts/test-apis.ts \
  scripts/test-webhook-idempotency.ts \
  scripts/test-payroll-approval.ts \
  scripts/test-role-permissions.ts \
  scripts/test-payroll-worker-durability.ts \
  scripts/test-transfer-reconciliation.ts; do
  pnpm exec ts-node "$script"
done

echo 'Local Supabase API tests passed.'
