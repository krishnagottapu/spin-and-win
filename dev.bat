@echo off
setlocal EnableDelayedExpansion

title Spin and Win - Local Dev

echo.
echo ================================================
echo   Spin and Win - Local Development Setup
echo ================================================
echo.

:: ── Step 1: Check Docker is running ──────────────────────────────────────────
echo [1/6] Checking Docker...
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo   ERROR: Docker is not running.
    echo   Please start Docker Desktop and try again.
    echo.
    pause
    exit /b 1
)
echo   Docker is running.

:: ── Step 2: Check .env.local exists ──────────────────────────────────────────
echo.
echo [2/6] Checking .env.local...
if not exist ".env.local" (
    echo   .env.local not found. Copying from .env.example...
    copy ".env.example" ".env.local" >nul
    echo.
    echo   ============================================================
    echo   ACTION REQUIRED:
    echo   .env.local was created from .env.example.
    echo   You must fill in your Supabase credentials before continuing.
    echo   Run this script again after editing .env.local.
    echo   ============================================================
    echo.
    echo   Opening .env.local in Notepad...
    start notepad ".env.local"
    pause
    exit /b 0
)
echo   .env.local found.

:: ── Step 3: Install dependencies ─────────────────────────────────────────────
echo.
echo [3/6] Installing dependencies...
if not exist "node_modules" (
    echo   node_modules not found. Running npm install...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo   ERROR: npm install failed.
        pause
        exit /b 1
    )
) else (
    echo   node_modules already present. Skipping install.
    echo   (Run "npm install" manually if you added new packages.)
)

:: ── Step 4: Start Supabase ────────────────────────────────────────────────────
echo.
echo [4/6] Starting local Supabase...
call npx supabase status >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   Supabase is already running.
) else (
    echo   Starting Supabase (this may take a minute on first run^)...
    call npx supabase start
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo   ERROR: Supabase failed to start.
        echo   Make sure Docker Desktop has at least 4GB RAM allocated.
        echo   Try: npx supabase stop then docker system prune -f then npx supabase start
        echo.
        pause
        exit /b 1
    )
)

:: ── Step 5: Run database migrations ──────────────────────────────────────────
echo.
echo [5/6] Checking database migrations...
call npx supabase migration list >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   Applying migrations...
    call npx supabase db reset
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo   WARNING: Migrations failed. Database may be out of sync.
        echo   Try: npx supabase db reset
        echo.
        set /p CONT="Continue anyway? (y/n): "
        if /i "!CONT!" NEQ "y" exit /b 1
    )
) else (
    echo   Migrations already applied during supabase start.
)
echo   Database ready.

:: ── Step 6: Print Supabase credentials ───────────────────────────────────────
echo.
echo [6/6] Retrieving Supabase local credentials...
echo.
echo   ============================================================
echo   LOCAL SUPABASE CREDENTIALS
echo   (Copy these into .env.local if not already set)
echo   ============================================================
call npx supabase status
echo   ============================================================
echo.

:: ── Start the dev server ──────────────────────────────────────────────────────
echo.
echo ================================================
echo   Starting Next.js dev server on port 3000...
echo ================================================
echo.
echo   App URLs:
echo     Admin:       http://localhost:3000/admin
echo     Supabase:    http://localhost:54323
echo.
echo   Press Ctrl+C to stop the dev server.
echo   Supabase will keep running in the background.
echo   Run "npx supabase stop" to stop it when done.
echo.

call npm run dev

:: ── Cleanup message on exit ───────────────────────────────────────────────────
echo.
echo   Dev server stopped.
echo   Supabase is still running. To stop it: npx supabase stop
echo.
pause
