@echo off
setlocal
cd /d "%~dp0"

set "NODE=node"
if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"

set HF_LOCAL_INSTALL=1
set HF_DATA_DIR=%ProgramData%\HAKAFAST
set PORT=5000

if not exist "%HF_DATA_DIR%" mkdir "%HF_DATA_DIR%"

if "%~1"=="admin" (
  start "" "%NODE%" server.js
  timeout /t 3 /nobreak >nul
  start "" "http://127.0.0.1:5000/setup"
  exit /b 0
)

if "%~1"=="live" (
  start "" "%NODE%" server.js
  timeout /t 3 /nobreak >nul
  start "" "http://127.0.0.1:5000/live-timing/kart-demo"
  exit /b 0
)

if "%~1"=="reception" (
  start "" "%NODE%" server.js
  timeout /t 3 /nobreak >nul
  start "" "http://127.0.0.1:5000/reception"
  exit /b 0
)

echo Starting HAKAFAST server on port %PORT%...
"%NODE%" server.js
