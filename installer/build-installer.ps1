#Requires -Version 5.1
<#
.SYNOPSIS
  Builds HAKAFAST USB installer package.
  Requires: Node.js 20+, npm, Inno Setup 6 (iscc.exe on PATH) optional.

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

# --- Pre-flight checks ---
Write-Host "==> Pre-flight checks..." -ForegroundColor Cyan

# Check Node version
$NodeVersion = (node --version 2>$null)
if (-not $NodeVersion) {
  Write-Host "ERROR: Node.js not found on PATH. Install Node.js 20+ and try again." -ForegroundColor Red
  exit 1
}
$NodeMajor = [int]($NodeVersion -replace 'v','' -replace '\..*','')
if ($NodeMajor -lt 18) {
  Write-Host "ERROR: Node.js $NodeVersion detected. Node.js 18+ required." -ForegroundColor Red
  exit 1
}
Write-Host "  Node: $NodeVersion" -ForegroundColor Green

# Check npm
$NpmVersion = (npm --version 2>$null)
if (-not $NpmVersion) {
  Write-Host "ERROR: npm not found on PATH." -ForegroundColor Red
  exit 1
}
Write-Host "  npm: $NpmVersion" -ForegroundColor Green

# Read version from package.json
$PackageJson = Join-Path $Root 'package.json'
if (-not (Test-Path $PackageJson)) {
  Write-Host "ERROR: package.json not found at $PackageJson" -ForegroundColor Red
  exit 1
}
$PackageVersion = (Get-Content $PackageJson -Raw | ConvertFrom-Json).version
if (-not $PackageVersion) { $PackageVersion = '1.0.0' }
Write-Host "  Version: $PackageVersion" -ForegroundColor Green

# Clean up stale stage directory if it exists (prevents mixing old/new files)
$StaleMarker = Join-Path $Stage '.stale'
if (Test-Path $Stage) {
  $TimeStamp = Get-Date
  Set-Content -Path $StaleMarker -Value "Stale stage marked at $TimeStamp" -Force
  Write-Host "  Cleaned up previous stage directory" -ForegroundColor Yellow
}

# --- Build frontend ---
Write-Host "==> Building frontend..." -ForegroundColor Cyan
Push-Location $Root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE" }
} catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Pop-Location
  exit 1
}
Pop-Location

# --- Stage installer files ---
Write-Host "==> Staging installer files..." -ForegroundColor Cyan
if (Test-Path $Stage) {
  try {
    Remove-Item $Stage -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Host "WARNING: Could not fully clean stage directory: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
New-Item -ItemType Directory -Path $Stage -Force | Out-Null

$Include = @(
  'server.js', 'demoStore.js', 'liveBroadcast.js', 'lapStats.js',
  'installConfig.js', 'persistentStore.js', 'fileExport.js', 'rentixWebhook.js', 'ambTranx160.js',
  'enduranceRules.js', 'trackProfile.js', 'ambP3Parser.js',
  'package.json', 'package-lock.json', 'dist', 'public', 'kiosk'
)
$MissingFiles = @()
foreach ($item in $Include) {
  $src = Join-Path $Root $item
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $Stage $item) -Recurse -Force
  } else {
    if ($item -in @('package-lock.json', 'kiosk', 'enduranceRules.js', 'trackProfile.js', 'ambP3Parser.js')) {
      Write-Host "  WARNING: Optional file $item not found — skipping." -ForegroundColor Yellow
    } else {
      $MissingFiles += $item
    }
  }
}

if ($MissingFiles.Count -gt 0) {
  Write-Host "ERROR: Required files missing: $($MissingFiles -join ', ')" -ForegroundColor Red
  exit 1
}

$Scripts = @('start-hakafast.bat', 'launch-kiosk.bat', 'install-service.ps1', 'sign-installer.ps1', 'README-INSTALL.md')
foreach ($script in $Scripts) {
  $src = Join-Path $PSScriptRoot $script
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $Stage $script) -Force
  } else {
    Write-Host "  WARNING: Script $script not found — skipping." -ForegroundColor Yellow
  }
}

# Write version file for the installer to reference
$VersionFile = Join-Path $Stage 'version.json'
Set-Content -Path $VersionFile -Value (ConvertTo-Json @{ version = $PackageVersion; buildDate = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ') }) -Force

$NodeDir = Join-Path $PSScriptRoot 'node-portable'
$NodeExe = Join-Path $NodeDir 'node.exe'
if (Test-Path $NodeExe) {
  $NodePortableVersion = (& $NodeExe --version 2>$null)
  $NodePortableMajor = 0
  if ($NodePortableVersion) {
    $NodePortableMajor = [int]($NodePortableVersion -replace 'v','' -replace '\..*','')
  }
  if ($NodePortableMajor -lt 18) {
    Write-Host "  WARNING: Portable Node.js $NodePortableVersion is too old (18+ required). Skipping bundling." -ForegroundColor Yellow
  } else {
    Write-Host "==> Bundling portable Node $NodePortableVersion..." -ForegroundColor Cyan
    Copy-Item $NodeDir (Join-Path $Stage 'node') -Recurse -Force
  }
} else {
  Write-Host "  Portable Node.js not found at $NodeExe — server will use system Node.js." -ForegroundColor Yellow
  Write-Host "  To bundle: download Node.js Windows x64 zip and extract to installer/node-portable/" -ForegroundColor Yellow
}

$Dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if ($Dotnet -and (Test-Path (Join-Path $KioskShell 'HakafastKiosk.csproj'))) {
  Write-Host "==> Building WebView2 kiosk shell..." -ForegroundColor Cyan
  Push-Location $KioskShell
  try {
    dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o (Join-Path $Stage 'kiosk-shell')
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }
  } catch {
    Write-Host "  WARNING: Kiosk build failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Kiosk will use Edge fallback via launch-kiosk.bat." -ForegroundColor Yellow
  }
  Pop-Location
} else {
  Write-Host '  dotnet SDK not found — kiosk will use Edge fallback via launch-kiosk.bat.' -ForegroundColor Yellow
}

# --- Install production dependencies ---
Write-Host "==> Installing production dependencies in stage..." -ForegroundColor Cyan
Push-Location $Stage
try {
  # Try npm ci first (clean install from lockfile)
  $CiResult = npm ci --omit=dev 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  npm ci failed, falling back to npm install..." -ForegroundColor Yellow
    $InstallResult = npm install --omit=dev 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  npm install also failed." -ForegroundColor Red
      Write-Host "  Output: $InstallResult" -ForegroundColor Red
      Pop-Location
      exit 1
    }
  }
} catch {
  Write-Host "  WARNING: npm install encountered an issue: $($_.Exception.Message)" -ForegroundColor Yellow
  # Continue anyway — node_modules may still be usable
}
Pop-Location

# --- Build Inno Setup installer ---
$BuiltExe = $null
$Iscc = Get-Command iscc -ErrorAction SilentlyContinue
if ($Iscc) {
  Write-Host "==> Compiling Inno Setup (version $PackageVersion)..." -ForegroundColor Cyan
  New-Item -ItemType Directory -Path $Output -Force | Out-Null
  Push-Location $PSScriptRoot
  try {
    & iscc "/DMyAppVersion=$PackageVersion" 'HAKAFAST.iss'
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed with exit code $LASTEXITCODE" }
  } catch {
    Write-Host "  WARNING: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Stage folder still ready for manual copy." -ForegroundColor Yellow
  }
  Pop-Location
  $BuiltExe = Join-Path $Output "HAKAFAST-Setup-$PackageVersion.exe"
  if (Test-Path $BuiltExe) {
    Write-Host "  Installer: $BuiltExe" -ForegroundColor Green
  } else {
    Write-Host "  Installer not found at expected path — checking alternative..." -ForegroundColor Yellow
    $BuiltExe = Get-ChildItem (Join-Path $Output 'HAKAFAST-Setup-*.exe') -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($BuiltExe) {
      Write-Host "  Installer: $($BuiltExe.FullName)" -ForegroundColor Green
    }
  }
} else {
  Write-Host "  Inno Setup (iscc) not found — stage folder ready for manual USB copy." -ForegroundColor Yellow
  Write-Host "  Stage: $Stage" -ForegroundColor Green
}

# --- Code signing ---
$KioskExe = Join-Path $Stage 'kiosk-shell\HakafastKiosk.exe'
$SignScript = Join-Path $PSScriptRoot 'sign-installer.ps1'
if (Test-Path $SignScript) {
  $toSign = @()
  if ($BuiltExe -and (Test-Path $BuiltExe)) { $toSign += $BuiltExe }
  if (Test-Path $KioskExe) { $toSign += $KioskExe }
  if ($toSign.Count -gt 0) {
    Write-Host "==> Signing $($toSign.Count) file(s)..." -ForegroundColor Cyan
    & $SignScript @toSign
  }
} else {
  Write-Host "  Sign script not found — skipping code signing." -ForegroundColor Yellow
}

# --- Summary ---
Write-Host ""
Write-Host "========== BUILD SUMMARY ==========" -ForegroundColor Cyan
Write-Host "  Version:     $PackageVersion" -ForegroundColor White
Write-Host "  Node:        $NodeVersion" -ForegroundColor White
Write-Host "  Stage:       $Stage" -ForegroundColor White

$StageSize = "{0:N2} MB" -f ((Get-ChildItem $Stage -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum / 1MB)
Write-Host "  Stage size:  $StageSize" -ForegroundColor White

if ($BuiltExe -and (Test-Path $BuiltExe)) {
  $ExeSize = "{0:N2} MB" -f ((Get-Item $BuiltExe).Length / 1MB)
  Write-Host "  Installer:   $BuiltExe ($ExeSize)" -ForegroundColor Green
} else {
  Write-Host "  Installer:   Not built (iscc not found or failed)" -ForegroundColor Yellow
}

if (Test-Path $KioskExe) { Write-Host "  Kiosk:       Built" -ForegroundColor Green }
else { Write-Host "  Kiosk:       Not built (Edge fallback)" -ForegroundColor Yellow }
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Done." -ForegroundColor Green