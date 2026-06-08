#Requires -Version 5.1
<#
.SYNOPSIS
  Builds HAKAFAST USB installer package.
  Requires: Node.js 18+, npm, Inno Setup 6 (iscc.exe on PATH) optional.

  Optional signing (Phase 3):
    $env:HF_SIGN_PFX = 'C:\certs\hakafast.pfx'
    $env:HF_SIGN_PASSWORD = '***'

  Output:
    installer/stage/          — files to copy to target PC or burn to USB
    installer/output/*.exe    — setup wizard (if iscc available)
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Stage = Join-Path $PSScriptRoot 'stage'
$Output = Join-Path $PSScriptRoot 'output'
$KioskShell = Join-Path $PSScriptRoot 'kiosk-shell'

Write-Host "==> Building frontend..." -ForegroundColor Cyan
Push-Location $Root
npm run build
Pop-Location

Write-Host "==> Staging installer files..." -ForegroundColor Cyan
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage | Out-Null

$Include = @(
  'server.js', 'demoStore.js', 'liveBroadcast.js', 'lapStats.js',
  'installConfig.js', 'persistentStore.js', 'fileExport.js', 'rentixWebhook.js', 'ambTranx160.js',
  'package.json', 'package-lock.json', 'dist', 'public', 'kiosk'
)
foreach ($item in $Include) {
  $src = Join-Path $Root $item
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $Stage $item) -Recurse -Force
  }
}

$Scripts = @('start-hakafast.bat', 'launch-kiosk.bat', 'install-service.ps1', 'sign-installer.ps1', 'README-INSTALL.md')
foreach ($script in $Scripts) {
  Copy-Item (Join-Path $PSScriptRoot $script) (Join-Path $Stage $script) -Force
}

$NodeDir = Join-Path $PSScriptRoot 'node-portable'
if (Test-Path (Join-Path $NodeDir 'node.exe')) {
  Write-Host "==> Bundling portable Node..." -ForegroundColor Cyan
  Copy-Item $NodeDir (Join-Path $Stage 'node') -Recurse -Force
}

$Dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if ($Dotnet -and (Test-Path (Join-Path $KioskShell 'HakafastKiosk.csproj'))) {
  Write-Host "==> Building WebView2 kiosk shell..." -ForegroundColor Cyan
  Push-Location $KioskShell
  dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o (Join-Path $Stage 'kiosk-shell')
  Pop-Location
} else {
  Write-Host 'dotnet SDK not found - kiosk will use Edge fallback via launch-kiosk.bat.' -ForegroundColor Yellow
}

Write-Host "==> npm ci --omit=dev in stage..." -ForegroundColor Cyan
Push-Location $Stage
npm ci --omit=dev 2>$null
if ($LASTEXITCODE -ne 0) { npm install --omit=dev }
Pop-Location

$BuiltExe = $null
$Iscc = Get-Command iscc -ErrorAction SilentlyContinue
if ($Iscc) {
  Write-Host "==> Compiling Inno Setup..." -ForegroundColor Cyan
  New-Item -ItemType Directory -Path $Output -Force | Out-Null
  & iscc (Join-Path $PSScriptRoot 'HAKAFAST.iss')
  $BuiltExe = Join-Path $Output 'HAKAFAST-Setup-1.0.0.exe'
  Write-Host "Installer: $BuiltExe" -ForegroundColor Green
} else {
  Write-Host 'Inno Setup (iscc) not found - stage folder ready for manual USB copy.' -ForegroundColor Yellow
  Write-Host "Stage: $Stage" -ForegroundColor Green
}

$KioskExe = Join-Path $Stage 'kiosk-shell\HakafastKiosk.exe'
$SignScript = Join-Path $PSScriptRoot 'sign-installer.ps1'
if (Test-Path $SignScript) {
  $toSign = @()
  if ($BuiltExe -and (Test-Path $BuiltExe)) { $toSign += $BuiltExe }
  if (Test-Path $KioskExe) { $toSign += $KioskExe }
  if ($toSign.Count -gt 0) {
    & $SignScript @toSign
  }
}

Write-Host "Done." -ForegroundColor Green
