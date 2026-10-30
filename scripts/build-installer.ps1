# 打包 NSIS 安装包（Windows x64）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1
$ErrorActionPreference = 'Stop'
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# 国内镜像：Electron 二进制 + electron-builder 的 NSIS/winCodeSign 工具
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:npm_config_registry = "https://registry.npmmirror.com"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (-not (Test-Path "node_modules\electron\dist\electron.exe")) {
  Write-Host "[build] 依赖未就绪，先 npm install ..." -ForegroundColor Yellow
  npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
}

Write-Host "[build] 开始 electron-builder 打包（NSIS，x64）..." -ForegroundColor Cyan
npx electron-builder --win nsis --x64

Write-Host "[build] 完成，产物：" -ForegroundColor Green
Get-ChildItem "dist" -Filter "*.exe" | ForEach-Object {
  Write-Host ("  {0}  {1:N1} MB" -f $_.Name, ($_.Length / 1MB))
}
