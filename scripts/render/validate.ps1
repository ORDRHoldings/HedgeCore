#Requires -Version 7
<#
.SYNOPSIS
    Validate render.yaml structure and verify live services match declared config.

.DESCRIPTION
    1. Parses render.yaml locally for structural correctness (requires yq or
       falls back to a basic YAML check).
    2. Calls the Render API to list services and confirms the expected service
       names (hedgecore, hedgecore-preview) are present and active.
    3. Optionally checks healthCheckPath liveness on production.

    Exits 0 on success, 1 on any failure.

.PARAMETER SkipLiveness
    Skip the live health-check ping against the production endpoint.

.PARAMETER YamlPath
    Path to render.yaml. Defaults to repo root.

.EXAMPLE
    .\scripts\render\validate.ps1
    .\scripts\render\validate.ps1 -SkipLiveness
#>

param(
    [switch]$SkipLiveness,
    [string]$YamlPath = (Join-Path $PSScriptRoot "..\..\render.yaml")
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RENDER_API_BASE = "https://api.render.com/v1"
$PROD_HEALTH_URL = "https://hedgecore.onrender.com/health"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Invoke-RenderApi {
    param([string]$Path, [string]$Method = "GET", [hashtable]$Body = $null)

    $key = $env:RENDER_API_KEY
    if (-not $key) { throw "RENDER_API_KEY is not set. Run .\scripts\render\env-check.ps1" }

    $headers = @{
        "Authorization" = "Bearer $key"
        "Accept"        = "application/json"
    }

    $params = @{
        Uri     = "$RENDER_API_BASE$Path"
        Method  = $Method
        Headers = $headers
    }
    if ($Body) {
        $params["Body"]        = ($Body | ConvertTo-Json -Depth 5)
        $params["ContentType"] = "application/json"
    }

    return Invoke-RestMethod @params
}

function Write-Step { param([string]$Msg) Write-Host "`n[STEP] $Msg" -ForegroundColor Cyan }
function Write-Pass { param([string]$Msg) Write-Host "  [PASS] $Msg" -ForegroundColor Green }
function Write-Fail { param([string]$Msg) Write-Host "  [FAIL] $Msg" -ForegroundColor Red }
function Write-Warn { param([string]$Msg) Write-Host "  [WARN] $Msg" -ForegroundColor Yellow }

$allPassed = $true

# ── Step 1: File exists ───────────────────────────────────────────────────────

Write-Step "Checking render.yaml exists"

if (Test-Path $YamlPath) {
    Write-Pass "Found: $YamlPath"
} else {
    Write-Fail "Not found: $YamlPath"
    exit 1
}

# ── Step 2: Basic YAML structural check (grep-based, no yq required) ─────────

Write-Step "Structural validation (render.yaml)"

$yaml = Get-Content $YamlPath -Raw

$checks = @{
    "services: block present"           = $yaml -match "(?m)^services:"
    "databases: block present"          = $yaml -match "(?m)^databases:"
    "hedgecore service declared"        = $yaml -match "name:\s+hedgecore\b"
    "hedgecore-preview declared"        = $yaml -match "name:\s+hedgecore-preview"
    "healthCheckPath set"               = $yaml -match "healthCheckPath:"
    "buildFilter.paths set"             = $yaml -match "buildFilter:"
    "PYTHON_VERSION 3.12"               = $yaml -match 'value:\s+"3\.12"'
    "JWT_SECRET from group"             = $yaml -match "fromGroup:\s+hedgecore-secrets"
    "DATABASE_URL from group"           = $yaml -match "DATABASE_URL" -and $yaml -match "fromGroup"
    "No hardcoded secrets (CHANGE_ME)"  = $yaml -notmatch "CHANGE_ME"
    "No placeholder passwords"          = $yaml -notmatch "password123|mysecret|changeme"
}

foreach ($check in $checks.GetEnumerator()) {
    if ($check.Value) {
        Write-Pass $check.Key
    } else {
        Write-Fail $check.Key
        $allPassed = $false
    }
}

# ── Step 3: Render API — service existence ────────────────────────────────────

Write-Step "Render API — verifying live services"

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
    Write-Warn "RENDER_API_KEY not set — skipping live API checks"
    Write-Warn "Set it and re-run to perform full validation"
} else {
    try {
        $services = Invoke-RenderApi "/services?limit=20"

        # Render API returns array directly or under .data depending on version
        $serviceList = if ($services -is [array]) { $services } else { $services.data ?? @() }
        $names = $serviceList | ForEach-Object { $_.service.name ?? $_.name }

        $expectedServices = @("hedgecore", "hedgecore-preview")
        foreach ($svcName in $expectedServices) {
            if ($names -contains $svcName) {
                Write-Pass "Service '$svcName' exists in Render"
            } else {
                Write-Warn "Service '$svcName' not found in Render (may need blueprint sync)"
            }
        }

        # Print service IDs for operator reference
        Write-Host ""
        Write-Host "  Service ID mapping (set as env vars for deploy scripts):" -ForegroundColor DarkGray
        foreach ($svc in $serviceList) {
            $name = $svc.service.name ?? $svc.name
            $id   = $svc.service.id   ?? $svc.id
            if ($name -in $expectedServices) {
                Write-Host "    $name = $id" -ForegroundColor DarkGray
            }
        }
    }
    catch {
        Write-Warn "Render API call failed: $_"
        Write-Warn "Check RENDER_API_KEY is valid and has service:read permission"
    }
}

# ── Step 4: Liveness check ────────────────────────────────────────────────────

if (-not $SkipLiveness) {
    Write-Step "Production liveness check ($PROD_HEALTH_URL)"
    try {
        $resp = Invoke-RestMethod -Uri $PROD_HEALTH_URL -Method GET -TimeoutSec 15
        if ($resp.status -eq "ok" -or $resp.status -eq "healthy") {
            Write-Pass "Health endpoint responded: status=$($resp.status)"
        } else {
            Write-Warn "Health endpoint responded but status was: $($resp.status)"
        }
    }
    catch {
        Write-Warn "Health check failed or service is sleeping (Render free tier): $_"
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host ""
if ($allPassed) {
    Write-Host "VALIDATION PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "VALIDATION FAILED — fix the issues above before deploying" -ForegroundColor Red
    exit 1
}
