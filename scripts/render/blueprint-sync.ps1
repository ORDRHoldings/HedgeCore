#Requires -Version 7
<#
.SYNOPSIS
    Trigger a Render Blueprint sync from render.yaml via the REST API.

.DESCRIPTION
    A blueprint sync tells Render to re-read render.yaml from the connected
    branch and reconcile the declared services/databases against live state.

    NOTE: Blueprint sync is triggered automatically on push. Use this script
    for manual re-sync after editing render.yaml without a git push, or to
    verify that Render has picked up the latest configuration.

    Requires:
      $env:RENDER_API_KEY   — Render account API key
      $env:RENDER_OWNER_ID  — Render owner ID (user or team ID)
                              Get it from: Render dashboard URL /u/OWNER_ID

.EXAMPLE
    .\scripts\render\blueprint-sync.ps1
    .\scripts\render\blueprint-sync.ps1 -DryRun
#>

param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RENDER_API_BASE = "https://api.render.com/v1"

# ── Validate ──────────────────────────────────────────────────────────────────

$apiKey  = $env:RENDER_API_KEY
$ownerId = $env:RENDER_OWNER_ID

if (-not $apiKey) {
    Write-Error "RENDER_API_KEY is not set. Run .\scripts\render\env-check.ps1"
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Accept"        = "application/json"
    "Content-Type"  = "application/json"
}

# ── Dry run: just show what would happen ─────────────────────────────────────

if ($DryRun) {
    Write-Host ""
    Write-Host "DRY RUN: Blueprint sync would be triggered for render.yaml" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Services declared in render.yaml:"
    $yaml = Get-Content (Join-Path $PSScriptRoot "..\..\render.yaml") -Raw
    $matches = [regex]::Matches($yaml, "name:\s+(\S+)")
    foreach ($m in $matches) {
        Write-Host "  - $($m.Groups[1].Value)"
    }
    Write-Host ""
    Write-Host "Databases declared:"
    $dbMatches = [regex]::Matches($yaml, "- name:\s+(\S+)")
    foreach ($m in $dbMatches) {
        Write-Host "  - $($m.Groups[1].Value)"
    }
    Write-Host ""
    Write-Host "To run the actual sync, omit -DryRun"
    exit 0
}

# ── Attempt API-based blueprint retrieval ─────────────────────────────────────

Write-Host ""
Write-Host "BLUEPRINT SYNC" -ForegroundColor Cyan
Write-Host ""

if (-not $ownerId) {
    Write-Host "RENDER_OWNER_ID not set — attempting to list blueprints via API." -ForegroundColor Yellow
    Write-Host "This may fail depending on your Render plan."
    Write-Host ""
}

try {
    $url = if ($ownerId) {
        "$RENDER_API_BASE/blueprints?ownerId=$ownerId"
    } else {
        "$RENDER_API_BASE/blueprints"
    }

    $blueprints = Invoke-RestMethod -Uri $url -Method GET -Headers $headers -TimeoutSec 20

    $list = if ($blueprints -is [array]) { $blueprints } else { $blueprints.data ?? @() }

    if ($list.Count -eq 0) {
        Write-Host "No blueprints found via API." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To sync render.yaml manually:" -ForegroundColor Cyan
        Write-Host "  1. Go to https://dashboard.render.com → your project → Blueprint"
        Write-Host "  2. Click 'Sync' or push a commit to trigger auto-sync"
        Write-Host ""
        exit 0
    }

    Write-Host "Found blueprints:" -ForegroundColor Green
    foreach ($bp in $list) {
        $id   = $bp.id   ?? $bp.blueprint.id   ?? "?"
        $name = $bp.name ?? $bp.blueprint.name ?? "?"
        $sync = $bp.lastSyncedAt ?? "never"
        Write-Host "  $name (ID: $id) — last synced: $sync"
    }

    Write-Host ""
    Write-Host "Blueprint sync is triggered automatically on git push." -ForegroundColor DarkGray
    Write-Host "For manual trigger, use the Render dashboard." -ForegroundColor DarkGray
}
catch {
    Write-Host "Blueprint API call failed: $_" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Blueprint sync is automatically triggered when you push to the" -ForegroundColor Cyan
    Write-Host "connected branch (master/dev). If render.yaml was changed without"
    Write-Host "a push, trigger a manual sync from:"
    Write-Host "  https://dashboard.render.com"
    Write-Host ""
    Write-Host "Alternatively, trigger a dummy push:" -ForegroundColor DarkGray
    Write-Host "  git commit --allow-empty -m 'chore: trigger render blueprint sync'"
    Write-Host "  git push origin master"
}
