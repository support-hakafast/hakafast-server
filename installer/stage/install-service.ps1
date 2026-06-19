param(
  [string]$InstallDir = $PSScriptRoot,
  [switch]$Uninstall
)

$ServiceName = 'HAKAFAST'
$NodeExe = Join-Path $InstallDir 'node\node.exe'
if (-not (Test-Path $NodeExe)) { $NodeExe = 'node' }

$ServerJs = Join-Path $InstallDir 'server.js'
if (-not (Test-Path $ServerJs)) {
  Write-Host "ERROR: server.js not found at $ServerJs. Run from correct InstallDir." -ForegroundColor Red
  exit 1
}

$DataDir = Join-Path $env:ProgramData 'HAKAFAST'
$LogDir = Join-Path $DataDir 'logs'

$envBlock = @(
  "HF_LOCAL_INSTALL=1",
  "HF_DATA_DIR=$DataDir",
  "PORT=5000",
  "NODE_ENV=production"
) -join "`n"

function Ensure-LogDir {
  if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "Created log directory: $LogDir" -ForegroundColor Green
  }
}

function UninstallService {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc) {
    Write-Host "Stopping service $ServiceName..." -ForegroundColor Yellow
    if ($svc.Status -ne 'Stopped') {
      try {
        Stop-Service $ServiceName -Force -ErrorAction Stop
      } catch {
        Write-Host "WARNING: Could not stop service: $($_.Exception.Message)" -ForegroundColor Yellow
      }
    }
    try {
      sc.exe delete $ServiceName 2>&1 | Out-Null
      Write-Host "Removed service $ServiceName" -ForegroundColor Green
    } catch {
      Write-Host "WARNING: Could not remove service: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  } else {
    Write-Host "Service $ServiceName not found." -ForegroundColor Yellow
  }

  # Clean up machine-level env vars if they exist
  try {
    $currentDataDir = [Environment]::GetEnvironmentVariable('HF_DATA_DIR', 'Machine')
    if ($currentDataDir -eq $DataDir) {
      [Environment]::SetEnvironmentVariable('HF_DATA_DIR', $null, 'Machine')
    }
    $currentPort = [Environment]::GetEnvironmentVariable('PORT', 'Machine')
    if ($currentPort -eq '5000') {
      [Environment]::SetEnvironmentVariable('PORT', $null, 'Machine')
    }
  } catch {
    # Non-critical
  }
}

function InstallService {
  Ensure-LogDir

  # Check for existing service first
  $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Service $ServiceName already exists. Reinstalling..." -ForegroundColor Yellow
    UninstallService
    Start-Sleep -Seconds 2
  }

  # Try NSSM first (better service manager)
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if ($nssm) {
    Write-Host "Installing service via NSSM..." -ForegroundColor Cyan
    try {
      & nssm install $ServiceName $NodeExe $ServerJs
      & nssm set $ServiceName AppDirectory $InstallDir
      & nssm set $ServiceName AppEnvironmentExtra $envBlock
      & nssm set $ServiceName AppStdout (Join-Path $LogDir 'service.log')
      & nssm set $ServiceName AppStderr (Join-Path $LogDir 'service-error.log')
      & nssm set $ServiceName Start SERVICE_AUTO_START
      & nssm set $ServiceName AppRotateFiles 1
      & nssm set $ServiceName AppRotateOnline 1
      & nssm set $ServiceName AppRotateSeconds 86400
      & nssm set $ServiceName AppRotateBytes 10485760
      & nssm start $ServiceName
      Write-Host "Installed $ServiceName via NSSM and started." -ForegroundColor Green
      return $true
    } catch {
      Write-Host "NSSM installation failed: $($_.Exception.Message)" -ForegroundColor Yellow
      Write-Host "Falling back to sc.exe..." -ForegroundColor Yellow
    }
  } else {
    Write-Host "NSSM not found — using sc.exe (basic service manager)." -ForegroundColor Yellow
    Write-Host "For better log rotation and recovery options, install NSSM from https://nssm.cc" -ForegroundColor Yellow
  }

  # Fallback to sc.exe
  $binPath = "`"$NodeExe`" `"$ServerJs`""
  try {
    sc.exe create $ServiceName binPath= $binPath start= auto DisplayName= "HAKAFAST Track Server" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "sc.exe create failed with exit code $LASTEXITCODE" }
    Write-Host "Created service $ServiceName" -ForegroundColor Green

    # Set service description
    sc.exe description $ServiceName "Timing and scoring server for go-kart tracks" 2>&1 | Out-Null

    # Set failure recovery (restart on failure)
    sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 2>&1 | Out-Null

    # Set environment variables at machine level
    [Environment]::SetEnvironmentVariable('HF_LOCAL_INSTALL', '1', 'Machine')
    [Environment]::SetEnvironmentVariable('HF_DATA_DIR', $DataDir, 'Machine')
    [Environment]::SetEnvironmentVariable('PORT', '5000', 'Machine')

    try {
      Start-Service $ServiceName -ErrorAction Stop
      Write-Host "Started service $ServiceName" -ForegroundColor Green
    } catch {
      Write-Host "WARNING: Could not start service: $($_.Exception.Message)" -ForegroundColor Yellow
      Write-Host "Try starting manually: Start-Service $ServiceName" -ForegroundColor Yellow
    }
    return $true
  } catch {
    Write-Host "ERROR: Service installation failed: $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

# --- Main ---
if ($Uninstall) {
  UninstallService
  exit 0
}

$result = InstallService
if ($result) {
  Write-Host ""
  Write-Host "Service installed. Access HAKAFAST at:" -ForegroundColor Cyan
  Write-Host "  Setup:  http://127.0.0.1:5000/setup" -ForegroundColor White
  Write-Host "  Admin:  http://127.0.0.1:5000/admin/<track-slug>" -ForegroundColor White
  Write-Host "  Logs:   $LogDir" -ForegroundColor White
  exit 0
} else {
  exit 1
}