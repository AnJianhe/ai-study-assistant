$ErrorActionPreference = 'Stop'
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Write-Host "[1/4] electron-builder --dir" -ForegroundColor Cyan
& node node_modules/electron-builder/cli.js --win --dir
if ($LASTEXITCODE -ne 0) { throw "dir build failed" }

$exePath = Join-Path $root "dist\win-unpacked\AI学习助手.exe"
Write-Host "[2/4] rcedit icon + version" -ForegroundColor Cyan
if (Test-Path $exePath) {
  $rceditArgs = @(
    $exePath,
    '--set-icon', 'build\icon.ico',
    '--set-version-string', 'ProductName', 'AI Study Assistant',
    '--set-version-string', 'FileDescription', 'AI Study Assistant - Personalized Learning',
    '--set-version-string', 'CompanyName', 'AI Study Assistant',
    '--set-version-string', 'LegalCopyright', 'AI Study Assistant',
    '--set-file-version', '1.0.0.0',
    '--set-product-version', '1.0.0'
  )
  & ".\scripts\rcedit.exe" @rceditArgs
  if ($LASTEXITCODE -ne 0) { Write-Warning "rcedit exit $LASTEXITCODE" } else { Write-Host "rcedit ok" }
} else {
  Write-Warning "exe not found: $exePath"
}

Write-Host "[3/4] nsis installer" -ForegroundColor Cyan
& node node_modules/electron-builder/cli.js --win nsis --prepackaged dist/win-unpacked
if ($LASTEXITCODE -ne 0) { throw "nsis build failed" }

Write-Host "[4/4] done" -ForegroundColor Green
Get-ChildItem "dist" -Filter "*.exe" | ForEach-Object {
  Write-Host ("  {0}  {1:N1} MB" -f $_.Name, ($_.Length / 1MB))
}
