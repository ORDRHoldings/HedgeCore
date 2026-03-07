#Requires -Version 7
<#
.SYNOPSIS
    List all Render services for this account and emit service ID → name mapping.

.DESCRIPTION
    Calls the Render REST API to enumerate services. Outputs JSON by default.
    Use this to discover service IDs needed by deploy scripts, then set:

        $env:RENDER_API_SERVICE_ID     = "srv-..."   # hedgecore (prod)
        $env:RENDER_PREVIEW_SERVICE_ID = "srv-..."   # hedgecore-preview

.PARAMETER Filter
    Optional name filter (case-insensitive substring match).

.EXAMPLE
    .\scripts\render\list-services.ps1
    .\scripts\render\list-services.ps1 -Filter "hedgecore"
#>

param(
    [string]$Filter = ""
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RENDER_API_BASE = "https://api.render.com/v1"

# ── Require API key ───────────────────────────────────────────────────────────

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
    Write-Error "RENDER_API_KEY is not set. Run .\scripts\render\env-check.ps1 for guidance."
    exit 1
}

# ── Call API ──────────────────────────────────────────────────────────────────

Write-Host "Fetching services from Render API..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod `
        -Uri "$RENDER_API_BASE/services?limit=20" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $apiKey"
            "Accept"        = "application/json"
        } `
        -TimeoutSec 30
}
catch {
    Write-Error "Render API request failed: $_"
    exit 1
}

# ── Normalize response (handle both array and wrapped formats) ────────────────

$items = if ($response -is [array]) { $response } else { $response.data ?? @($response) }

# ── Filter ────────────────────────────────────────────────────────────────────

if ($Filter) {
    $items = $items | Where-Object {
        $name = $_.service.name ?? $_.name ?? ""
        $name -like "*$Filter*"
    }
}

if ($items.Count -eq 0) {
    Write-Host "No services found$(if ($Filter) {" matching '$Filter'"})." -ForegroundColor Yellow
    exit 0
}

# ── Output table + env var suggestions ───────────────────────────────────────

Write-Host ""
Write-Host ("=" * 80)
Write-Host ("{0,-30} {1,-30} {2,-10} {3}" -f "NAME", "SERVICE ID", "TYPE", "STATUS") -ForegroundColor Yellow
Write-Host ("=" * 80)

$envSuggestions = @()

foreach ($item in $items) {
    $name   = $item.service.name   ?? $item.name   ?? "?"
    $id     = $item.service.id     ?? $item.id     ?? "?"
    $type   = $item.service.type   ?? $item.type   ?? "?"
    $status = $item.service.status ?? $item.status ?? "?"

    $statusColor = switch ($status) {
        "live"       { "Green"   }
        "suspended"  { "Red"     }
        "building"   { "Yellow"  }
        default      { "Gray"    }
    }

    Write-Host ("{0,-30} {1,-30} {2,-10}" -f $name, $id, $type) -NoNewline
    Write-Host " $status" -ForegroundColor $statusColor

    # Build env var suggestions for known services
    if ($name -eq "hedgecore") {
        $envSuggestions += "`$env:RENDER_API_SERVICE_ID = `"$id`""
    }
    elseif ($name -eq "hedgecore-preview") {
        $envSuggestions += "`$env:RENDER_PREVIEW_SERVICE_ID = `"$id`""
    }
}

Write-Host ("=" * 80)
Write-Host "Total: $($items.Count) service(s)" -ForegroundColor DarkGray

# ── Env var copy-paste block ──────────────────────────────────────────────────

if ($envSuggestions.Count -gt 0) {
    Write-Host ""
    Write-Host "Set these environment variables for deploy scripts:" -ForegroundColor Cyan
    foreach ($suggestion in $envSuggestions) {
        Write-Host "  $suggestion" -ForegroundColor White
    }
    Write-Host ""
}

# ── Raw JSON for piping ───────────────────────────────────────────────────────

if ($env:RENDER_OUTPUT -eq "json") {
    $items | ConvertTo-Json -Depth 10
}
