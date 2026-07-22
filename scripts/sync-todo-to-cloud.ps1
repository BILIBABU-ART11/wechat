param(
  [string]$TodoBaseUrl = "https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73",
  [string]$TodoApiKey = $env:TODO_API_KEY,
  [string]$CloudBaseUrl = $env:CLOUD_API_BASE_URL,
  [string]$ImportToken = $env:TODO_IMPORT_TOKEN,
  [string]$SnapshotDate = "",
  [int]$PageSize = 100,
  [bool]$TriggerReminders = $true,
  [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

function Assert-NotBlank($Value, $Name) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing $Name. Pass -$Name '<value>' or set the matching environment variable."
  }
}

Assert-NotBlank $TodoApiKey "TodoApiKey"
Assert-NotBlank $CloudBaseUrl "CloudBaseUrl"
Assert-NotBlank $ImportToken "ImportToken"

if ($PageSize -lt 1 -or $PageSize -gt 100) {
  throw "PageSize must be between 1 and 100."
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($LogDir)) {
  $LogDir = Join-Path $projectRoot "todo-sync-logs"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$todoHeaders = @{
  Authorization = "Bearer $TodoApiKey"
  Accept = "application/json"
}

$allItems = New-Object System.Collections.Generic.List[object]
$page = 1
$total = 0
$startedAt = (Get-Date).ToString("o")

do {
  $queryParts = @(
    "page=$([Uri]::EscapeDataString([string]$page))",
    "pageSize=$([Uri]::EscapeDataString([string]$PageSize))"
  )
  if (-not [string]::IsNullOrWhiteSpace($SnapshotDate)) {
    $queryParts += "snapshotDate=$([Uri]::EscapeDataString($SnapshotDate))"
  }
  $url = $TodoBaseUrl.TrimEnd("/") + "/openapi/todo-stat/snapshots?" + ($queryParts -join "&")

  Write-Host "Fetching todo page $page ..." -ForegroundColor Cyan
  $response = Invoke-RestMethod -Method Get -Uri $url -Headers $todoHeaders -TimeoutSec 60
  if ($null -eq $response.items) {
    throw "Unexpected todo API response: missing items."
  }

  foreach ($item in $response.items) {
    $allItems.Add($item)
  }

  $total = [int]$response.total
  $page += 1
} while ($allItems.Count -lt $total)

$payload = [ordered]@{
  meta = [ordered]@{
    source = "todo-stat-snapshots"
    todoBaseUrl = $TodoBaseUrl
    snapshotDate = $SnapshotDate
    startedAt = $startedAt
    fetchedAt = (Get-Date).ToString("o")
    pageSize = $PageSize
    total = $total
    itemCount = $allItems.Count
  }
  data = [ordered]@{
    items = $allItems
    total = $total
    page = 1
    pageSize = $PageSize
  }
  trigger_reminders = $TriggerReminders
}

$cloudUrl = $CloudBaseUrl.TrimEnd("/") + "/api/todo-stat/import"
$cloudHeaders = @{
  Authorization = "Bearer $ImportToken"
  Accept = "application/json"
}

Write-Host "Importing $($allItems.Count) records to cloud ..." -ForegroundColor Cyan
$json = $payload | ConvertTo-Json -Depth 20
$importResponse = Invoke-RestMethod -Method Post -Uri $cloudUrl -Headers $cloudHeaders -ContentType "application/json; charset=utf-8" -Body $json -TimeoutSec 120

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $LogDir "todo-sync-$timestamp.json"
$log = [ordered]@{
  request = $payload
  response = $importResponse
}
[System.IO.File]::WriteAllText($logPath, ($log | ConvertTo-Json -Depth 30), [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "Sync completed." -ForegroundColor Green
Write-Host "Fetched: $($allItems.Count) / Total: $total" -ForegroundColor Green
Write-Host "Cloud response:" -ForegroundColor Green
$importResponse | ConvertTo-Json -Depth 20
Write-Host "Log: $logPath" -ForegroundColor Green
