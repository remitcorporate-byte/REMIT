# Temporary GCP demo deployment

This REMIT deployment is hosted in the existing `quedium-eap-staging` project
and is isolated under the `remit-demo-*` resource prefix.

## Live services

- Web: `https://remit-demo-web-885118931429.us-central1.run.app`
- Web alternate Cloud Run URL: `https://remit-demo-web-lan6d2dq6a-uc.a.run.app`
- API: `https://remit-demo-api-885118931429.us-central1.run.app`
- API readiness: `https://remit-demo-api-885118931429.us-central1.run.app/api/v1/ready`

The API `FRONTEND_URL` CORS setting must contain both web origins as a comma-separated value because Cloud Run serves the same frontend from both hostnames.

The API uses the existing Supabase database, Paystack mock mode, and the
in-process payroll queue. It runs with one minimum and one maximum Cloud Run
instance with CPU throttling disabled so the scheduler can continue between
requests. This is a temporary demo topology, not the production Redis/BullMQ
worker topology.

> **Known risk — mock mode mints free balance.** With `USE_PAYSTACK_MOCK=true`,
> the deposit verify endpoint credits the wallet without any real payment, so
> any self-registered user can credit arbitrary balance. This is acceptable only
> for a throwaway demo. Before any real exposure, switch the API to Paystack
> test keys (`sk_test_...` with `USE_PAYSTACK_MOCK` unset) so deposits go
> through the real Paystack test checkout.

## GCP resources

- Cloud Run service: `remit-demo-api`
- Cloud Run service: `remit-demo-web`
- Artifact Registry repository: `remit-demo`
- Runtime service account: `remit-demo-run`
- Web service account: `remit-demo-web`
- Secret Manager secrets:
  - `remit-demo-database-url`
  - `remit-demo-jwt-secret`
  - `remit-demo-platform-jwt-secret`
  - `remit-demo-paystack-secret`
  - `remit-demo-paystack-public`

Cloud Build uses the project compute identity
`885118931429-compute@developer.gserviceaccount.com`, which was explicitly
granted `roles/cloudbuild.builds.builder` for these source builds.

## Database migration state

All nine Prisma migrations were applied to the live Supabase database before
deployment. Migrations used Supabase's session pooler on port `5432`; the
application continues to use the transaction pooler URL on port `6543`.

## Remove after the demo

Run these commands only when the demo is finished:

```powershell
gcloud.cmd run services delete remit-demo-api --project=quedium-eap-staging --region=us-central1 --quiet
gcloud.cmd run services delete remit-demo-web --project=quedium-eap-staging --region=us-central1 --quiet
gcloud.cmd artifacts repositories delete remit-demo --project=quedium-eap-staging --location=us-central1 --quiet
gcloud.cmd secrets delete remit-demo-database-url --project=quedium-eap-staging --quiet
gcloud.cmd secrets delete remit-demo-jwt-secret --project=quedium-eap-staging --quiet
gcloud.cmd secrets delete remit-demo-platform-jwt-secret --project=quedium-eap-staging --quiet
gcloud.cmd secrets delete remit-demo-paystack-secret --project=quedium-eap-staging --quiet
gcloud.cmd secrets delete remit-demo-paystack-public --project=quedium-eap-staging --quiet
gcloud.cmd iam service-accounts delete remit-demo-run@quedium-eap-staging.iam.gserviceaccount.com --project=quedium-eap-staging --quiet
gcloud.cmd iam service-accounts delete remit-demo-web@quedium-eap-staging.iam.gserviceaccount.com --project=quedium-eap-staging --quiet
```

After confirming the existing Quedium build pipeline does not use the compute
identity, the temporary builder grant can also be removed:

```powershell
gcloud.cmd projects remove-iam-policy-binding quedium-eap-staging --member="serviceAccount:885118931429-compute@developer.gserviceaccount.com" --role="roles/cloudbuild.builds.builder" --condition=None
```
