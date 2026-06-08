param(
  [string]$InstallDir = $PSScriptRoot,
  [switch]$Uninstall
)

$ServiceName = 'HAKAFAST'
$NodeExe = Join-Path $InstallDir 'node\node.exe'
if (-not (Test-Path $NodeExe)) { $NodeExe = 'node' }

$ServerJs = Join-Path $InstallDir 'server.js'
$DataDir = Join-Path $env:ProgramData 'HAKAFAST'
$LogDir = Join-Path $DataDir 'logs'

$envBlock = @(
  "HF_LOCAL_INSTALL=1",
  "HF_DATA_DIR=$DataDir",
  "PORT=5000",
  "NODE_ENV=production"
) -join "`n"

function Ensure-LogDir {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
}

if ($Uninstall) {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc) {
    if ($svc.Status -ne 'Stopped') { Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue }
    sc.exe delete $ServiceName | Out-Null
    Write-Host "Removed service $ServiceName"
  }
  exit 0
}

Ensure-LogDir

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssm) {
  & nssm install $ServiceName $NodeExe $ServerJs
  & nssm set $ServiceName AppDirectory $InstallDir
  & nssm set $ServiceName AppEnvironmentExtra $envBlock
  & nssm set $ServiceName AppStdout (Join-Path $LogDir 'service.log')
  & nssm set $ServiceName AppStderr (Join-Path $LogDir 'service-error.log')
  & nssm set $ServiceName Start SERVICE_AUTO_START
  & nssm start $ServiceName
  Write-Host "Installed $ServiceName via NSSM"
  exit 0
}

$binPath = "`"$NodeExe`" `"$ServerJs`""
sc.exe create $ServiceName binPath= $binPath start= auto DisplayName= "HAKAFAST Track Server" | Out-Null
Write-Host "Created service $ServiceName (set HF_LOCAL_INSTALL via system env if needed)"
Write-Host "Set environment: HF_LOCAL_INSTALL=1 HF_DATA_DIR=$DataDir PORT=5000"
[Environment]::SetEnvironmentVariable('HF_LOCAL_INSTALL', '1', 'Machine')
[Environment]::SetEnvironmentVariable('HF_DATA_DIR', $DataDir, 'Machine')
[Environment]::SetEnvironmentVariable('PORT', '5000', 'Machine')
Start-Service $ServiceName -ErrorAction SilentlyContinue
