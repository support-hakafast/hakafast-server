@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set "NODE=node"
if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"

set HF_LOCAL_INSTALL=1
set HF_DATA_DIR=%ProgramData%\HAKAFAST
set PORT=5000

if not exist "%HF_DATA_DIR%" (
  mkdir "%HF_DATA_DIR%"
  if !ERRORLEVEL! neq 0 (
    echo WARNING: Could not create data directory %HF_DATA_DIR%
    echo Check permissions.
  )
)

rem Try to read track slug from install config for smart defaults
set TRACK_SLUG=kart-demo
if exist "%HF_DATA_DIR%\install.json" (
  for /f "tokens=2 delims=:, " %%A in ('findstr "trackSlug" "%HF_DATA_DIR%\install.json"') do (
    set TRACK_SLUG=%%~A
    rem Remove quotes
    set TRACK_SLUG=!TRACK_SLUG:"=!
    goto :found_track
  )
)
:found_track

if /i "%~1"=="admin" (
  echo Starting HAKAFAST server (admin mode)...
  start "HAKAFAST Server" "%NODE%" server.js
  timeout /t 3 /nobreak >nul
  start "" "http://127.0.0.1:%PORT%/admin/!TRACK_SLUG!"
  exit /b 0
)

if /i "%~1"=="live" (
  echo Starting HAKAFAST server (live timing mode)...
  start "HAKAFAST Server" "%NODE%" server.js
  timeout /t 3 /nobreak >nul
  start "" "http://127.0.0.1:%PORT%/live-timing/!TRACK_SLUG!"
  exit /b 0
)

if /i "%~1"=="reception" (
  echo Starting HAKAFAST server (reception mode)...
  start "HAKAFAST Server" "%NODE%" server.js
  timeout /t 3 /nobreak >nul
  start "" "http://127.0.0.1:%PORT%/reception/!TRACK_SLUG!"
  exit /b 0
)

if /i "%~1"=="results" (
  echo Starting HAKAFAST server (results mode)...
  start "HAKAFAST Server" "%NODE%" server.js
  timeout /t 3 /nobreak >nul
  start "" "http://127.0.0.1:%PORT%/results"
  exit /b 0
)

if /i "%~1"=="setup" (
  echo Starting HAKAFAST server (setup wizard)...
  start "HAKAFAST Server" "%NODE%" server.js
  timeout /t 3 /nobreak >nul
  start "" "http://127.0.0.1:%PORT%/setup"
  exit /b 0
)

if /i "%~1"=="help" (
  echo HAKAFAST launcher
  echo.
  echo Usage: start-hakafast.bat [mode]
  echo.
  echo Modes:
  echo   admin      Open admin panel (default)
  echo   live       Open live timing
  echo   reception  Open driver reception
  echo   results    Open results page
  echo   setup      Open setup wizard
  echo   help       Show this help
  echo.
  echo If no mode specified, starts the server in console mode.
  exit /b 0
)

echo Starting HAKAFAST server on port %PORT%...
echo Press Ctrl+C to stop.
"%NODE%" server.js
if %ERRORLEVEL% neq 0 (
  echo.
  echo Server exited with code %ERRORLEVEL%.
  echo Check that Node.js is installed and dependencies are available.
  pause
)