param(
    [string]$DatabaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/remit_test?schema=public',
    [int]$Port = 5000
)

$ErrorActionPreference = 'Stop'
$backendDirectory = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$serverProcess = $null

Push-Location $backendDirectory

try {
    $existingListener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -eq $Port } |
        Select-Object -First 1

    if ($existingListener) {
        throw "Port $Port is already in use. Stop the existing service or pass a different -Port value."
    }

    $env:NODE_ENV = 'test'
    $env:PORT = [string]$Port
    $env:FRONTEND_URL = 'http://localhost:5173'
    $env:DATABASE_URL = $DatabaseUrl
    $env:DIRECT_URL = $DatabaseUrl
    $env:JWT_SECRET = 'remit-local-test-secret-do-not-use-in-production'
    $env:JWT_EXPIRE = '1h'
    $env:USE_PAYSTACK_MOCK = 'true'
    $env:PAYSTACK_SECRET_KEY = 'sk_test_local_only'
    $env:PAYSTACK_PUBLIC_KEY = 'pk_test_local_only'
    $env:PAYSTACK_BASE_URL = 'https://api.paystack.co'
    $env:BASE_URL = "http://127.0.0.1:$Port/api/v1"
    $env:GENERAL_RATE_LIMIT_MAX = '1000'
    $env:AUTH_RATE_LIMIT_MAX = '200'
    $env:PAYROLL_QUEUE_MODE = 'in-process'

    Write-Host 'Applying Prisma migrations to the local REMIT test database...'
    & corepack pnpm exec prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        throw 'Prisma migrations failed.'
    }

    Write-Host 'Generating the Prisma client...'
    & corepack pnpm exec prisma generate
    if ($LASTEXITCODE -ne 0) {
        throw 'Prisma client generation failed.'
    }

    Write-Host 'Building the backend...'
    & corepack pnpm build
    if ($LASTEXITCODE -ne 0) {
        throw 'Backend build failed.'
    }

    Write-Host "Starting the local test API on port $Port..."
    $serverProcess = Start-Process node `
        -ArgumentList 'dist/server.js' `
        -WorkingDirectory $backendDirectory `
        -WindowStyle Hidden `
        -PassThru

    $health = $null
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        if ($serverProcess.HasExited) {
            throw "Local test API exited during startup with code $($serverProcess.ExitCode)."
        }

        try {
            $health = Invoke-WebRequest `
                -UseBasicParsing `
                -Uri "$($env:BASE_URL)/health" `
                -TimeoutSec 2
            break
        }
        catch {
            if ($attempt -eq 30) {
                throw 'Local test API did not become healthy within 30 attempts.'
            }
            Start-Sleep -Seconds 1
        }
    }

    if (-not $health -or $health.StatusCode -ne 200) {
        throw "API health check returned HTTP $($health.StatusCode)."
    }

    Write-Host 'Running API smoke tests with Paystack mock mode enabled...'
    & corepack pnpm exec ts-node scripts/test-apis.ts
    if ($LASTEXITCODE -ne 0) {
        throw 'API smoke tests failed.'
    }

    Write-Host 'Running webhook idempotency tests...'
    & corepack pnpm exec ts-node scripts/test-webhook-idempotency.ts
    if ($LASTEXITCODE -ne 0) {
        throw 'Webhook idempotency tests failed.'
    }

    Write-Host 'Running payroll approval-control tests...'
    & corepack pnpm exec ts-node scripts/test-payroll-approval.ts
    if ($LASTEXITCODE -ne 0) {
        throw 'Payroll approval-control tests failed.'
    }

    Write-Host 'Running role-permission interface tests...'
    & corepack pnpm exec ts-node scripts/test-role-permissions.ts
    if ($LASTEXITCODE -ne 0) {
        throw 'Role-permission interface tests failed.'
    }

    Write-Host 'Running payroll worker durability tests...'
    & corepack pnpm exec ts-node scripts/test-payroll-worker-durability.ts
    if ($LASTEXITCODE -ne 0) {
        throw 'Payroll worker durability tests failed.'
    }

    Write-Host 'Running transfer reconciliation tests...'
    & corepack pnpm exec ts-node scripts/test-transfer-reconciliation.ts
    if ($LASTEXITCODE -ne 0) {
        throw 'Transfer reconciliation tests failed.'
    }

    Write-Host 'Local Supabase API tests passed.'
}
finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
        Write-Host "Stopped local test API process $($serverProcess.Id)."
    }

    Pop-Location
}
