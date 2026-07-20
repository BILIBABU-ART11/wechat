param(
  [string]$BaseUrl = "https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73",
  [string]$ApiKey = $env:TODO_API_KEY,
  [string]$SnapshotDate = "",
  [int]$PageSize = 20,
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "Missing API key. Pass -ApiKey '<key>' or set `$env:TODO_API_KEY first."
}

if ($PageSize -lt 1 -or $PageSize -gt 100) {
  throw "PageSize must be between 1 and 100."
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path $projectRoot "real-data"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$headers = @{
  Authorization = "Bearer $ApiKey"
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
  $url = $BaseUrl.TrimEnd("/") + "/openapi/todo-stat/snapshots?" + ($queryParts -join "&")

  Write-Host "Fetching page $page ..." -ForegroundColor Cyan
  $response = Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 60
  if ($null -eq $response.items) {
    throw "Unexpected response: missing items."
  }
  foreach ($item in $response.items) {
    $allItems.Add($item)
  }

  $total = [int]$response.total
  $page += 1
} while ($allItems.Count -lt $total)

$snapshotLabel = if ([string]::IsNullOrWhiteSpace($SnapshotDate)) { "latest" } else { $SnapshotDate }
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$output = [ordered]@{
  meta = [ordered]@{
    source = "todo-stat-snapshots"
    baseUrl = $BaseUrl
    snapshotDate = $SnapshotDate
    fetchedAt = (Get-Date).ToString("o")
    startedAt = $startedAt
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
}

$latestPath = Join-Path $OutDir "todo-snapshots-latest.json"
$datedPath = Join-Path $OutDir "todo-snapshots-$snapshotLabel-$timestamp.json"

$json = $output | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($latestPath, $json, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($datedPath, $json, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "Saved latest: $latestPath" -ForegroundColor Green
Write-Host "Saved archive: $datedPath" -ForegroundColor Green
Write-Host "Items: $($allItems.Count) / Total: $total" -ForegroundColor Green
if ($allItems.Count -gt 0) {
  Write-Host "First item:" -ForegroundColor Green
  $allItems[0] | ConvertTo-Json -Depth 10
}
