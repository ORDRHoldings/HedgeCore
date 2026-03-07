#Requires -Version 7
<#
.SYNOPSIS
    Validate all required Render environment variables are set before running
    any deployment or API scripts.

.DESCRIPTION
    Checks for RENDER_API_KEY, service IDs, and output format settings.
    Exits non-zero if any required variable is missing.

.EXAMPLE
    .\scripts\render\env-check.ps1
    .\scripts\render\env-check.ps1 -RequireServiceIds
#>

param(
    [switch]$RequireServiceIds,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$failed = $false

function Test-EnvVar {
    param([string]$Name, [bool]$Required = $true, [string]$Description = "")
    $val = [System.Environment]::GetEnvironmentVariable($Name)
    if ($val) {
        if (-not $Quiet) {
            Write-Host "  [OK] $Name" -ForegroundColor Green
        }
        return $true
    }
    elseif ($Required) {
        Write-Host "  [MISSING] $Name  — $Description" -ForegroundColor Red
        return $false
    }
    else {
        if (-not $Quiet) {
            Write-Host "  [OPTIONAL] $Name not set  — $Description" -ForegroundColor DarkGray
        }
        return $true
    }
}

Write-Host ""
Write-Host "RENDER ENVIRONMENT CHECK" -ForegroundColor Cyan
Write-Host "=" * 50

Write-Host ""
Write-Host "Required:" -ForegroundColor Yellow

$ok = $true
$ok = (Test-EnvVar "RENDER_API_KEY" $true "API key from Render dashboard → Account Settings → API Keys") -and $ok

Write-Host ""
Write-Host "Service IDs (required for targeted deploys):" -ForegroundColor Yellow

if ($RequireServiceIds) {
    $ok = (Test-EnvVar "RENDER_API_SERVICE_ID"     $true "Service ID for 'hedgecore' (production backend)") -and $ok
    $ok = (Test-EnvVar "RENDER_PREVIEW_SERVICE_ID" $true "Service ID for 'hedgecore-preview'") -and $ok
} else {
    Test-EnvVar "RENDER_API_SERVICE_ID"     $false "Service ID for 'hedgecore' (production backend)" | Out-Null
    Test-EnvVar "RENDER_PREVIEW_SERVICE_ID" $false "Service ID for 'hedgecore-preview'" | Out-Null
}

Write-Host ""
Write-Host "Optional:" -ForegroundColor Yellow

Test-EnvVar "RENDER_OUTPUT"  $false "Set to 'json' for machine-readable output (default: json)" | Out-Null

Write-Host ""

if (-not $ok) {
    Write-Host "FAILED: Missing required environment variables." -ForegroundColor Red
    Write-Host ""
    Write-Host "Set them in your shell before running scripts:" -ForegroundColor DarkGray
    Write-Host '  $env:RENDER_API_KEY = "rnd_xxxxxxxxxxxxxxxx"' -ForegroundColor DarkGray
    Write-Host '  $env:RENDER_API_SERVICE_ID = "srv-xxxxxxxxxxxxxxxx"' -ForegroundColor DarkGray
    Write-Host '  $env:RENDER_PREVIEW_SERVICE_ID = "srv-xxxxxxxxxxxxxxxx"' -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Get service IDs by running:" -ForegroundColor DarkGray
    Write-Host "  .\scripts\render\list-services.ps1" -ForegroundColor DarkGray
    exit 1
}

Write-Host "Environment check passed." -ForegroundColor Green
Write-Host ""
exit 0
