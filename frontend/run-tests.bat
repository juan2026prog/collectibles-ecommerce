@echo off
REM Run E2E Tests - Usage: run-tests.bat
REM This script starts the dev server and runs E2E tests

echo.
echo ========================================
echo   E2E Tests Runner for Collectibles2026
echo ========================================
echo.

echo [1/3] Starting dev server...
start /B npm run dev > server.log 2>&1

echo [2/3] Waiting for server to be ready...
timeout /t 15 /nobreak > nul

echo [3/3] Running Playwright tests...
npx playwright test --reporter=list

echo.
echo ========================================
echo   Tests completed!
echo ========================================
echo.

pause
