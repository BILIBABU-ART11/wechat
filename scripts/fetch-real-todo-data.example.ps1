$env:TODO_API_KEY = "replace-with-api-key"

& "$PSScriptRoot\fetch-real-todo-data.ps1" `
  -PageSize 20

# Optional date query:
# & "$PSScriptRoot\fetch-real-todo-data.ps1" `
#   -SnapshotDate "2026-07-17" `
#   -PageSize 20
