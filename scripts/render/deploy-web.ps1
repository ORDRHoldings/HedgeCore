#Requires -Version 7
<#
.SYNOPSIS
    Deploy the frontend (Vercel) or preview backend (hedgecore-preview) on Render.

.DESCRIPTION
    The primary frontend (Next.js) deploys automatically via Vercel on every
    git push to master/dev. This script covers two deployment targets:

      -Target api-preview   Trigger manual deploy of hedgecore-preview (Render)
      -Target frontend      Shows Vercel deployment status/URL instructions
      -Target vercel        Calls Vercel CLI if installed (vercel --prod)

    Requires for preview target:
      $env:RENDER_API_KEY            — Render account API key
      $env:RENDER_PREVIEW_SERVICE_ID — Service ID for 'hedgecore-preview'

.PARAMETER Target
    "api-preview" (default) | "frontend" | "vercel"

.PARAMETER Wait
    Poll deployment until complete (api-preview only).

.EXAMPLE
    .\scripts\render\deploy-web.ps1
    .\scripts\render\deploy-web.ps1 -Target frontend
    .\scripts\render\deploy-web.ps1 -Target api-preview -Wait
#>

param(
    [ValidateSet("api-preview", "frontend", "vercel")]
    [string]$Target = "api-preview",
    [switch]$Wait
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RENDER_API_BASE = "https://api.render.com/v1"

# ── Dispatch on target ────────────────────────────────────────────────────────

switch ($Target) {

    # ── Deploy hedgecore-preview (Render) ────────────────────────────────────
    "api-preview" {
        & "$PSScriptRoot\env-check.ps1" -RequireServiceIds -Quiet
        if ($LASTEXITCODE -ne 0) { exit 1 }

        $apiKey    = $env:RENDER_API_KEY
        $serviceId = $env:RENDER_PREVIEW_SERVICE_ID
        $svcName   = "hedgecore-preview"

        $headers = @{
            "Authorization" = "Bearer $apiKey"
            "Accept"        = "application/json"
            "Content-Type"  = "application/json"
        }

        Write-Host ""
        Write-Host "DEPLOY: $svcName" -ForegroundColor Cyan
        Write-Host "Service ID: $serviceId"
        Write-Host ""

        try {
            $deploy = Invoke-RestMethod `
                -Uri "$RENDER_API_BASE/services/$serviceId/deploys" `
                -Method POST `
                -Headers $headers `
                -Body '{"clearCache":"do_not_clear"}' `
                -TimeoutSec 30
        }
        catch {
            Write-Error "Failed to trigger preview deploy: $_"
            exit 1
        }

        $deployId = $deploy.id ?? $deploy.deploy.id
        $status   = $deploy.status ?? $deploy.deploy.status

        Write-Host "Deploy triggered." -ForegroundColor Green
        Write-Host "Deploy ID : $deployId"
        Write-Host "Status    : $status"
        Write-Host "Dashboard : https://dashboard.render.com/web/$serviceId/deploys/$deployId"

        if ($Wait) {
            Write-Host ""
            Write-Host "Polling status..." -ForegroundColor Cyan
            $elapsed   = 0
            $timeout   = 600
            $pollEvery = 15

            while ($elapsed -lt $timeout) {
                Start-Sleep -Seconds $pollEvery
                $elapsed += $pollEvery

                $result = Invoke-RestMethod `
                    -Uri "$RENDER_API_BASE/services/$serviceId/deploys/$deployId" `
                    -Method GET -Headers $headers -TimeoutSec 15
                $s = $result.status ?? "unknown"
                Write-Host "  [$(Get-Date -Format HH:mm:ss)] ${elapsed}s — $s"

                if ($s -eq "live") {
                    Write-Host "Preview deploy succeeded." -ForegroundColor Green; exit 0
                }
                if ($s -in @("build_failed", "deactivated", "canceled")) {
                    Write-Error "Preview deploy failed: $s"; exit 1
                }
            }
            Write-Error "Deploy timed out."; exit 1
        }
    }

    # ── Frontend info (Vercel auto-deploys) ──────────────────────────────────
    "frontend" {
        Write-Host ""
        Write-Host "FRONTEND DEPLOYMENT (Vercel)" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "The Next.js frontend deploys automatically via Vercel:" -ForegroundColor White
        Write-Host "  Production : git push origin master  →  hedgecore.vercel.app"
        Write-Host "  Preview    : git push origin dev     →  hedgecore-preview.vercel.app"
        Write-Host ""
        Write-Host "Check deployment status:"
        Write-Host "  https://vercel.com/dashboard"
        Write-Host ""
        Write-Host "Force a manual redeploy via Vercel CLI:"
        Write-Host "  cd frontend && vercel --prod"
        Write-Host ""
        Write-Host "Required env var in Vercel:"
        Write-Host "  NEXT_PUBLIC_API_URL = https://hedgecore.onrender.com/api"
        Write-Host ""
        exit 0
    }

    # ── Vercel CLI deploy ────────────────────────────────────────────────────
    "vercel" {
        Write-Host "Checking for Vercel CLI..." -ForegroundColor Cyan
        $vercelPath = Get-Command vercel -ErrorAction SilentlyContinue
        if (-not $vercelPath) {
            Write-Error "Vercel CLI not found. Install with: npm install -g vercel"
            exit 1
        }

        Write-Host "Running: vercel --prod" -ForegroundColor Cyan
        Push-Location (Join-Path $PSScriptRoot "..\..\frontend")
        try {
            vercel --prod
        }
        finally {
            Pop-Location
        }
    }
}
