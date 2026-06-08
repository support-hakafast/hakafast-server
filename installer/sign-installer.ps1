param(
  [string]$PfxPath = $env:HF_SIGN_PFX,
  [string]$Password = $env:HF_SIGN_PASSWORD,
  [string]$TimestampUrl = $env:HF_SIGN_TIMESTAMP,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Files
)

if (-not $PfxPath -or -not (Test-Path $PfxPath)) {
  Write-Host "HF_SIGN_PFX not set or file missing — skipping code signing." -ForegroundColor Yellow
  exit 0
}

if (-not $Password) {
  Write-Host "HF_SIGN_PASSWORD required for signing." -ForegroundColor Red
  exit 1
}

$Signtool = Get-Command signtool -ErrorAction SilentlyContinue
if (-not $Signtool) {
  $SdkBin = "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe"
  $Signtool = Get-ChildItem $SdkBin -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
}
if (-not $Signtool) {
  Write-Host "signtool.exe not found — install Windows SDK." -ForegroundColor Red
  exit 1
}

if (-not $TimestampUrl) { $TimestampUrl = 'http://timestamp.digicert.com' }

foreach ($file in $Files) {
  if (-not (Test-Path $file)) {
    Write-Host "Skip missing: $file" -ForegroundColor Yellow
    continue
  }
  Write-Host "Signing $file ..." -ForegroundColor Cyan
  & $Signtool sign /f $PfxPath /p $Password /tr $TimestampUrl /td sha256 /fd sha256 $file
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Signing complete." -ForegroundColor Green
