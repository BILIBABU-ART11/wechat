param(
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot "deploy\aliyun-test"
$distRoot = if ($OutputDirectory) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  Join-Path $projectRoot "dist"
}
$packageName = "yyt-aliyun-test-deploy"
$stageRoot = Join-Path $distRoot $packageName
$archivePath = Join-Path $distRoot "$packageName.tar.gz"
$checksumPath = "$archivePath.sha256"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $sourceRoot)) {
  throw "Deployment source directory not found: $sourceRoot"
}

if (Test-Path -LiteralPath $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}
if (Test-Path -LiteralPath $checksumPath) {
  Remove-Item -LiteralPath $checksumPath -Force
}

New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot "app\scripts") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot "systemd") -Force | Out-Null

foreach ($file in @("README.md", "install.sh", "update.sh", "diagnose.sh", "uninstall.sh")) {
  [System.IO.File]::Copy(
    (Join-Path $sourceRoot $file),
    (Join-Path $stageRoot $file),
    $true
  )
}

$copyMap = @{
  (Join-Path $sourceRoot "runtime-package.json") = (Join-Path $stageRoot "app\package.json")
  (Join-Path $sourceRoot "runtime-package-lock.json") = (Join-Path $stageRoot "app\package-lock.json")
  (Join-Path $projectRoot "scripts\remote-state-server.js") = (Join-Path $stageRoot "app\scripts\remote-state-server.js")
  (Join-Path $projectRoot "scripts\sync-todo-to-cloud.js") = (Join-Path $stageRoot "app\scripts\sync-todo-to-cloud.js")
}
foreach ($source in $copyMap.Keys) {
  [System.IO.File]::Copy($source, $copyMap[$source], $true)
}

Get-ChildItem -LiteralPath (Join-Path $sourceRoot "systemd") -File | ForEach-Object {
  [System.IO.File]::Copy($_.FullName, (Join-Path $stageRoot "systemd\$($_.Name)"), $true)
}

$textExtensions = @(".sh", ".js", ".json", ".md", ".service", ".timer")
Get-ChildItem -LiteralPath $stageRoot -Recurse -File | ForEach-Object {
  if (($textExtensions -contains $_.Extension) -and $_.Name -ne "package-lock.json") {
    $text = [System.IO.File]::ReadAllText($_.FullName).Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText($_.FullName, $text, $utf8NoBom)
  }
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  $node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $node) {
  throw "Node.js is required to build and verify the deployment archive."
}
$hashScript = 'const fs=require(\"fs\"),crypto=require(\"crypto\");console.log(crypto.createHash(\"sha256\").update(fs.readFileSync(process.argv[1])).digest(\"hex\"))'

$manifestLines = Get-ChildItem -LiteralPath $stageRoot -Recurse -File |
  Sort-Object FullName |
  ForEach-Object {
    $relative = $_.FullName.Substring($stageRoot.Length + 1).Replace("\", "/")
    $hash = (& $node.Source -e $hashScript $_.FullName).Trim()
    if ($LASTEXITCODE -ne 0 -or $hash -notmatch '^[a-f0-9]{64}$') {
      throw "Failed to calculate SHA256 for $($_.FullName)"
    }
    "$hash  $relative"
  }
[System.IO.File]::WriteAllText((Join-Path $stageRoot "SHA256SUMS"), (($manifestLines -join "`n") + "`n"), $utf8NoBom)

$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if (-not $tar) {
  throw "tar.exe is required to build the Linux deployment archive."
}
& $tar.Source -czf $archivePath -C $distRoot $packageName
if ($LASTEXITCODE -ne 0) {
  throw "tar.exe failed with exit code $LASTEXITCODE"
}

$archiveHash = (& $node.Source -e $hashScript $archivePath).Trim()
[System.IO.File]::WriteAllText($checksumPath, "$archiveHash  $packageName.tar.gz`n", $utf8NoBom)

Write-Output "Deployment package: $archivePath"
Write-Output "SHA256 file: $checksumPath"
Write-Output "SHA256: $archiveHash"
