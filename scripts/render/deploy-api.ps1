#Requires -Version 7
<#
.SYNOPSIS
    Trigger a manual deploy of the production backend (hedgecore) on Render.

.DESCRIPTION
    Calls POST /v1/services/{id}/deploys to trigger a deployment of the
    'hedgecore' service (production, master branch).

    Requires:
      $env:RENDER_API_KEY          — Render account API key
      $env:RENDER_API_SERVICE_ID   — Service ID for 'hedgecore'
                                     (get it from .\list-services.ps1)

    Optionally polls deployment status until complete or times out.

.PARAMETER ClearCache
    Force a clean build (clears the pip cache layer).

.PARAMETER Wait
    Poll deployment status until success or failure. Default: false.

.PARAMETER TimeoutSeconds
    Maximum seconds to wait for deployment when -Wait is used. Default: 600.

.EXAMPLE
    .\scripts\render\deploy-api.ps1
    .\scripts\render\deploy-api.ps1 -ClearCache -Wait
#>

param(
    [switch]$ClearCache,
    [switch]$Wait,
    [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RENDER_API_BASE = "https://api.render.com/v1"
$SERVICE_NAME    = "hedgecore"

# ── Validate env vars ─────────────────────────────────────────────────────────

& "$PSScriptRoot\env-check.ps1" -RequireServiceIds -Quiet
if ($LASTEXITCODE -ne 0) { exit 1 }

$apiKey    = $env:RENDER_API_KEY
$serviceId = $env:RENDER_API_SERVICE_ID

# ── Common headers ────────────────────────────────────────────────────────────

$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Accept"        = "application/json"
    "Content-Type"  = "application/json"
}

# ── Trigger deploy ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "DEPLOY: $SERVICE_NAME" -ForegroundColor Cyan
Write-Host "Service ID : $serviceId"
Write-Host "Clear cache: $($ClearCache.IsPresent)"
Write-Host ""

$body = @{ clearCache = if ($ClearCache) { "clear" } else { "do_not_clear" } }

try {
    $deploy = Invoke-RestMethod `
        -Uri "$RENDER_API_BASE/services/$serviceId/deploys" `
        -Method POST `
        -Headers $headers `
        -Body ($body | ConvertTo-Json) `
        -TimeoutSec 30
}
catch {
    Write-Error "Failed to trigger deploy: $_"
    exit 1
}

$deployId = $deploy.id ?? $deploy.deploy.id
$status   = $deploy.status ?? $deploy.deploy.status

Write-Host "Deploy triggered successfully." -ForegroundColor Green
Write-Host "Deploy ID : $deployId"
Write-Host "Status    : $status"
Write-Host "Dashboard : https://dashboard.render.com/web/$serviceId/deploys/$deployId"
Write-Host ""

# ── Poll status ───────────────────────────────────────────────────────────────

if (-not $Wait) {
    Write-Host "Not waiting for completion. Pass -Wait to poll status." -ForegroundColor DarkGray
    exit 0
}

Write-Host "Polling deploy status (timeout: ${TimeoutSeconds}s)..." -ForegroundColor Cyan

$elapsed   = 0
$pollEvery = 15

while ($elapsed -lt $TimeoutSeconds) {
    Start-Sleep -Seconds $pollEvery
    $elapsed += $pollEvery

    try {
        $result = Invoke-RestMethod `
            -Uri "$RENDER_API_BASE/services/$serviceId/deploys/$deployId" `
            -Method GET `
            -Headers $headers `
            -TimeoutSec 15

        $currentStatus = $result.status ?? $result.deploy.status ?? "unknown"
        $ts = Get-Date -Format "HH:mm:ss"
        Write-Host "  [$ts] ${elapsed}s — $currentStatus"

        switch ($currentStatus) {
            "live" {
                Write-Host ""
                Write-Host "DEPLOY SUCCEEDED: $SERVICE_NAME is live." -ForegroundColor Green
                Write-Host "Health: https://hedgecore.onrender.com/health"
                exit 0
            }
            { $_ -in @("build_failed", "deactivated", "canceled") } {
                Write-Host ""
                Write-Error "DEPLOY FAILED: status=$currentStatus"
                Write-Host "Check logs: https://dashboard.render.com/web/$serviceId/deploys/$deployId"
                exit 1
            }
        }
    }
    catch {
        Write-Host "  [poll error] $_" -ForegroundColor Yellow
    }
}

Write-Error "Deploy timed out after ${TimeoutSeconds}s. Check Render dashboard."
exit 1
