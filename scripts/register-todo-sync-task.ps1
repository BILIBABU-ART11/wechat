param(
  [string]$TaskNamePrefix = "YYT Todo Sync",
  [string]$ScriptPath = "",
  [string]$RunAtMorning = "09:00",
  [string]$RunAtAfternoon = "17:00"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ScriptPath)) {
  $ScriptPath = Join-Path $PSScriptRoot "sync-todo-to-cloud.ps1"
}
$ScriptPath = (Resolve-Path $ScriptPath).Path

$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""

$times = @(
  @{ Name = "$TaskNamePrefix 0900"; Time = $RunAtMorning },
  @{ Name = "$TaskNamePrefix 1700"; Time = $RunAtAfternoon }
)

foreach ($item in $times) {
  $action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -Daily -At $item.Time
  Register-ScheduledTask -TaskName $item.Name -Action $action -Trigger $trigger -Description "Fetch YYT todo snapshots and import to cloud." -Force | Out-Null
  Write-Host "Registered task: $($item.Name) at $($item.Time)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Before the task runs, configure these machine/user environment variables on the fixed-IP server:" -ForegroundColor Yellow
Write-Host "TODO_API_KEY"
Write-Host "CLOUD_API_BASE_URL"
Write-Host "TODO_IMPORT_TOKEN"
