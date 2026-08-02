@echo off
title Poketwo Autocatcher v1.6.1
cd /d "%~dp0"

:: ── Node.js version check ──────────────────────────────────────────────────
for /f "tokens=1 delims=v" %%V in ('node -v 2^>nul') do set _dummy=%%V
for /f "tokens=2 delims=v." %%M in ('node -v 2^>nul') do set NODE_MAJOR=%%M
if "%NODE_MAJOR%"=="" (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Download it from https://nodejs.org  (LTS recommended^)
    pause & exit /b 1
)
if %NODE_MAJOR% LSS 16 (
    echo [ERROR] Node.js v16 or higher is required. You have v%NODE_MAJOR%.
    echo         Download the latest LTS from https://nodejs.org
    pause & exit /b 1
)

:: ── Config check ───────────────────────────────────────────────────────────
if not exist "%~dp0config.json" (
    echo [ERROR] config.json not found.
    echo         Copy config.example.json to config.json and fill in your values.
    pause & exit /b 1
)

:: ── Install dependencies ───────────────────────────────────────────────────
echo Installing / verifying dependencies...
call npm install --silent
if errorlevel 1 (
    echo [ERROR] npm install failed. Check the output above.
    pause & exit /b 1
)

:: ── Start bot, then open dashboard after a short delay ────────────────────
echo Starting Poketwo Autocatcher...
echo Dashboard will open at http://localhost:3000  (allow ~3 s for the server to start^)
echo.

:: Launch the bot in this window so logs are visible
start "Poketwo Autocatcher" cmd /k "cd /d "%~dp0" && node index.js"

:: Wait for the Express server to be ready before opening the browser
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"

exit /b 0
