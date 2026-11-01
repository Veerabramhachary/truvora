# Hits the Truvora cron endpoints that Vercel used to call for us (Windows
# variant of trigger-cron.sh, for Task Scheduler or manual testing).
#
# Usage:
#   .\deploy\trigger-cron.ps1 -BaseUrl https://app.example.com -CronSecret $env:CRON_SECRET [-Target all]
param(
    [string]$BaseUrl = $env:TRUVORA_BASE_URL,
    [string]$CronSecret = $env:CRON_SECRET,
    [ValidateSet("all", "subscription-renewals", "subscriptionsTC", "account-deletions")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
if (-not $BaseUrl) { throw "pass -BaseUrl or set TRUVORA_BASE_URL" }
if (-not $CronSecret) { throw "pass -CronSecret or set CRON_SECRET" }

$paths = if ($Target -eq "all") {
    @("/api/crons/subscription-renewals", "/api/crons/subscriptionsTC", "/api/crons/account-deletions")
} else {
    @("/api/crons/$Target")
}

$failed = $false
foreach ($p in $paths) {
    $url = "$($BaseUrl.TrimEnd('/'))$p"
    try {
        $resp = Invoke-WebRequest -Uri $url -Method Get `
            -Headers @{ Authorization = "Bearer $CronSecret" }
        Write-Host "$url -> HTTP $($resp.StatusCode)"
    } catch {
        $failed = $true
        Write-Host "$url -> FAILED: $_"
    }
}
if ($failed) { exit 1 }
