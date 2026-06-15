@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set "KIOSK=%~dp0HakafastKiosk.exe"
set "PORT=5000"
set "TRACK_SLUG=kart-demo"

rem Try to read track slug from install config
set "INSTALL_JSON=%ProgramData%\HAKAFAST\install.json"
if exist "%INSTALL_JSON%" (
  for /f "tokens=2 delims=:, " %%A in ('findstr "trackSlug" "%INSTALL_JSON%"') do (
    set TRACK_SLUG=%%~A
    set TRACK_SLUG=!TRACK_SLUG:"=!
  )
)

rem Allow HF_KIOSK_URL env var to override
if not "%HF_KIOSK_URL%"=="" (
  set "URL=%HF_KIOSK_URL%"
) else (
  set "URL=http://127.0.0.1:%PORT%/admin/!TRACK_SLUG!"
)

rem Allow command-line argument to override URL
if not "%~1"=="" set "URL=%~1"

echo HAKAFAST Kiosk
echo URL: %URL%
echo.

if exist "%KIOSK%" (
  echo Launching WebView2 kiosk...
  start "" "%KIOSK%" "%URL%"
  exit /b 0
)

REM Fallback: Edge/Chrome kiosk mode if WebView2 exe not built
set "EDGE="
for %%P in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do if exist %%P set "EDGE=%%~P"

if defined EDGE (
  echo Using !EDGE! in kiosk mode...
  start "" "%EDGE%" --kiosk --edge-kiosk-type=fullscreen --app=%URL%
  exit /b 0
)

echo ERROR: No kiosk browser found.
echo HakafastKiosk.exe not found. Build with: dotnet publish installer/kiosk-shell
echo Or install Microsoft Edge or Google Chrome.
exit /b 1