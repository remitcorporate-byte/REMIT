# REMIT Render Deployment

The repository contains a Render Blueprint at `render.yaml` for:

- `remit-web`: React/Vite static site
- `remit-api`: Express API
- `remit-payroll-worker`: BullMQ payroll worker

The API and worker use paid `starter` instances. A background worker cannot use
Render's free instance type, and a payroll API should not spin down between
requests.

## Before creating the Blueprint

1. Push the deployment commit to the GitHub repository Render will connect to.
2. Rotate the Redis credential that was shared during local testing.
3. Set that Redis database's eviction policy to `noeviction`, as BullMQ
   requires.
4. Keep the Supabase project and Paystack credentials available.

## Blueprint secret values

Render prompts for values marked `sync: false`.

### API (`remit-api`)

- `FRONTEND_URL`: the final static-site origin, for example
  `https://remit-web.onrender.com` (no trailing slash)
- `DATABASE_URL`: Supabase pooled runtime connection string
- `DIRECT_URL`: Supabase direct/session connection string used by Prisma
  migrations
- `PAYSTACK_SECRET_KEY`: Paystack secret key
- `PAYSTACK_PUBLIC_KEY`: matching Paystack public key
- `REDIS_URL`: the rotated TLS Redis connection string

`JWT_SECRET` is generated independently by Render.

### Worker (`remit-payroll-worker`)

Set `DATABASE_URL`, `DIRECT_URL`, `PAYSTACK_SECRET_KEY`,
`PAYSTACK_PUBLIC_KEY`, and `REDIS_URL` to the same values used by the API.
The worker does not serve HTTP traffic.

### Frontend (`remit-web`)

- `VITE_API_URL`: the deployed API base URL, for example
  `https://remit-api.onrender.com/api/v1`

Because Vite embeds this value at build time, redeploy the static site after
changing it.

## Create and verify

1. In Render, choose **New > Blueprint** and connect the GitHub repository.
2. Select `render.yaml`, review the two paid `starter` services, enter the
   prompted values, and apply the Blueprint.
3. Confirm `GET https://<api-host>/api/v1/health` returns HTTP 200.
4. Confirm `GET https://<api-host>/api/v1/ready` reports both the database and
   queue as connected.
5. Open the static-site URL and perform a login.
6. Configure Paystack's webhook URL:
   `https://<api-host>/api/v1/webhooks/paystack`.
7. Run a test-mode payroll and confirm the API queues it and
   `remit-payroll-worker` completes it exactly once.

Do not switch Paystack to live mode until the readiness endpoint, webhook
signature validation, and a test-mode payroll all pass on Render.
