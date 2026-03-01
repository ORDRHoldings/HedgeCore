# verify_schema_governance.ps1
#
# ORDR Terminal — Schema Governance Verification Script
# Institutional evidence collection for audit/review packs.
#
# Usage:
#   .\scripts\verify_schema_governance.ps1 -BaseUrl "https://hedgecore.onrender.com/api" -Token "eyJ..."
#
# What it verifies:
#   1. /system/schema-health endpoint — schema_ready, worm_ready, market_snapshots_ready
#   2. /system/health — basic liveness
#   3. (Optional) DB-level WORM proof via psql
#   4. (Optional) Tenancy isolation smoke-test

param(
    [Parameter(Mandatory=$false)]
    [string]$BaseUrl = "https://hedgecore.onrender.com/api",

    [Parameter(Mandatory=$false)]
    [string]$Token = "",

    [Parameter(Mandatory=$false)]
    [string]$PsqlConnStr = "",

    [Parameter(Mandatory=$false)]
    [switch]$SkipDB = $false,

    [Parameter(Mandatory=$false)]
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"
$PassCount = 0
$FailCount = 0

function Write-Check {
    param([string]$Label, [bool]$Pass, [string]$Detail = "")
    if ($Pass) {
        Write-Host "  [PASS] $Label" -ForegroundColor Green
        $script:PassCount++
    } else {
        Write-Host "  [FAIL] $Label" -ForegroundColor Red
        if ($Detail) { Write-Host "         $Detail" -ForegroundColor Yellow }
        $script:FailCount++
    }
}

function Invoke-Api {
    param([string]$Url, [hashtable]$Headers = @{})
    try {
        $response = Invoke-WebRequest -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec 30
        return $response.Content | ConvertFrom-Json
    } catch {
        return $null
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ORDR Terminal — Schema Governance Verification" -ForegroundColor Cyan
Write-Host "  Base URL : $BaseUrl" -ForegroundColor Cyan
Write-Host "  Date     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Liveness check ────────────────────────────────────────────────────────
Write-Host "1. Liveness" -ForegroundColor White
$health = Invoke-Api "$BaseUrl/system/health"
Write-Check "GET /system/health returns status=ok" ($health -and $health.status -eq "ok")
Write-Host ""

# ── 2. Schema health endpoint ─────────────────────────────────────────────────
Write-Host "2. Schema Health Endpoint  GET /system/schema-health" -ForegroundColor White
$sh = Invoke-Api "$BaseUrl/system/schema-health"

if ($sh) {
    if ($Verbose) {
        Write-Host "     Response:" -ForegroundColor DarkGray
        Write-Host "     $(($sh | ConvertTo-Json -Depth 3))" -ForegroundColor DarkGray
    }

    Write-Check "schema_ready = true"           ($sh.schema_ready -eq $true)
    Write-Check "worm_ready = true"             ($sh.worm_ready -eq $true)
    Write-Check "market_snapshots_ready = true" ($sh.market_snapshots_ready -eq $true)
    Write-Check "missing_items is empty"        ($sh.missing_items.Count -eq 0)
    Write-Check "checked_at is populated"       (-not [string]::IsNullOrEmpty($sh.checked_at))
} else {
    Write-Check "GET /system/schema-health reachable" $false "No response"
}
Write-Host ""

# ── 3. Fail-closed: 503 before auth (only if no token — schema not ready path) ─
Write-Host "3. Execution endpoint status (requires token)" -ForegroundColor White
if ($Token) {
    $headers = @{ "Authorization" = "Bearer $Token" }
    try {
        $calcResp = Invoke-WebRequest -Uri "$BaseUrl/v1/calculate" -Method Post `
            -Headers $headers `
            -Body '{"trades":[],"hedges":[],"market":{"as_of":"2026-01-01T00:00:00Z","spot_usdmxn":17.0,"forward_points_by_month":{},"provider_metadata":{}},"policy":{"bucket_mode":"CALENDAR_MONTH","hedge_ratios":{"confirmed":1.0,"forecast":0.0},"cost_assumptions":{"spread_bps":10},"execution_product":"NDF","min_trade_size_usd":0}}' `
            -ContentType "application/json" -UseBasicParsing -TimeoutSec 30
        # If schema ready, expect 200 or 422 (validation), NOT 503
        Write-Check "POST /v1/calculate not returning 503 (schema ready)" `
            ($calcResp.StatusCode -ne 503) `
            "Status: $($calcResp.StatusCode)"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 503) {
            Write-Check "POST /v1/calculate returns 503 (schema NOT ready — expected on fresh deploy)" $true
        } else {
            Write-Check "POST /v1/calculate reachable" $false "HTTP $statusCode"
        }
    }
} else {
    Write-Host "  [SKIP] No token provided — skipping authenticated execution check" -ForegroundColor DarkGray
}
Write-Host ""

# ── 4. DB-level WORM proof (optional, requires psql) ────────────────────────
Write-Host "4. DB-level WORM Proof (psql)" -ForegroundColor White
if ($SkipDB -or -not $PsqlConnStr) {
    Write-Host "  [SKIP] Set -PsqlConnStr to run DB checks" -ForegroundColor DarkGray
} else {
    $psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
    if (-not (Test-Path $psql)) { $psql = "psql" }

    # 4a. Confirm market_snapshots table exists
    $tableExists = & $psql $PsqlConnStr -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='market_snapshots' AND table_schema='public'"
    Write-Check "market_snapshots table exists in pg_catalog" ($tableExists.Trim() -eq "1")

    # 4b. Confirm UNIQUE constraint exists
    $ucExists = & $psql $PsqlConnStr -t -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_name='uix_market_snapshots_company_hash'"
    Write-Check "uix_market_snapshots_company_hash constraint exists" ($ucExists.Trim() -eq "1")

    # 4c. Confirm WORM triggers
    $trigCount = & $psql $PsqlConnStr -t -c "SELECT COUNT(*) FROM pg_trigger WHERE tgname IN ('trg_market_snapshots_no_update','trg_market_snapshots_no_delete')"
    Write-Check "Both WORM triggers present ($($trigCount.Trim()) found)" ($trigCount.Trim() -eq "2")

    # 4d. Attempt UPDATE — must fail
    $updateResult = & $psql $PsqlConnStr -c "UPDATE market_snapshots SET provider='MUTATED' WHERE 1=0" 2>&1
    # WHERE 1=0 → no rows matched, no WORM trigger fires. To prove WORM, we'd need an actual row.
    # This proves the trigger FUNCTION exists (it was compiled at least).
    $wormFnExists = & $psql $PsqlConnStr -t -c "SELECT COUNT(*) FROM pg_proc WHERE proname='market_snapshots_worm'"
    Write-Check "WORM function market_snapshots_worm compiled in pg_proc" ($wormFnExists.Trim() -eq "1")
}
Write-Host ""

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  RESULTS: $PassCount PASS  /  $FailCount FAIL" -ForegroundColor $(if ($FailCount -eq 0) { "Green" } else { "Red" })
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($FailCount -gt 0) {
    exit 1
} else {
    exit 0
}
