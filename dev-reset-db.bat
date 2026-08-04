@echo off
title Spin and Win - Reset Local DB

echo.
echo ================================================
echo   Spin and Win - Reset Local Database
echo ================================================
echo.
echo   WARNING: This will wipe all local data and
echo   re-run migrations + seed from scratch.
echo.
set /p CONFIRM="Are you sure? Type YES to continue: "
if /i "%CONFIRM%" NEQ "YES" (
    echo   Cancelled.
    pause
    exit /b 0
)

echo.
echo Resetting database...
call supabase db reset
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: Reset failed. Is Supabase running?
    echo   Run dev.bat first to start Supabase.
    pause
    exit /b 1
)

echo.
echo   Database reset complete.
echo   Admin credentials: admin / admin123
echo.
pause
