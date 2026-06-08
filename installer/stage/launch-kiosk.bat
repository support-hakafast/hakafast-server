@echo off
setlocal
cd /d "%~dp0"

set "KIOSK=%~dp0HakafastKiosk.exe"
set "URL=http://127.0.0.1:5000/admin/kart-demo"

if not "%~1"=="" set "URL=%~1"

if exist "%KIOSK%" (
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
  start "" "%EDGE%" --kiosk --edge-kiosk-type=fullscreen --app=%URL%
  exit /b 0
)

echo HakafastKiosk.exe not found. Build with: dotnet publish installer/kiosk-shell
echo Or install Microsoft Edge.
exit /b 1
