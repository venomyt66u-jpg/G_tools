@echo off
setlocal enabledelayedexpansion
title G_Tools Launcher
color 0A

echo ===============================================
echo            G_Tools - NFT Minting Suite
echo ===============================================
echo.

REM --- 1. Check Node.js is installed ---
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed.
  echo.
  echo Please install Node.js LTS first:
  echo   https://nodejs.org/  ^(download the "LTS" version, click Next-Next-Finish^)
  echo Then run this file again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js found: !NODEVER!
echo.

REM --- 2. Check for secrets file ---
if not exist ".env.local" (
  if exist ".env.example" (
    copy ".env.example" ".env.local" >nul
    echo [SETUP] Created .env.local from template.
    echo.
    echo  IMPORTANT: You must edit .env.local and fill in:
    echo    - APP_PASSWORD       ^(a login password you choose^)
    echo    - SESSION_SECRET     ^(any long random text^)
    echo    - ALCHEMY_API_KEY    ^(free: dashboard.alchemy.com^)
    echo    - ETHERSCAN_API_KEY  ^(free: etherscan.io/apis^)
    echo    - OPENSEA_API_KEY    ^(free: docs.opensea.io^)
    echo.
    echo  Opening .env.local in Notepad now. Save and close it, then this window continues.
    echo.
    pause
    notepad ".env.local"
  )
)

REM --- 3. Install dependencies (only first time) ---
if not exist "node_modules" (
  echo [SETUP] Installing dependencies. This runs ONCE and may take a few minutes...
  echo.
  call npm install
  if !errorlevel! neq 0 (
    echo [ERROR] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

REM --- 4. Build (only if not built yet) ---
if not exist ".next" (
  echo.
  echo [SETUP] Building the app. This runs once after install...
  call npm run build
  if !errorlevel! neq 0 (
    echo [ERROR] Build failed. See messages above.
    pause
    exit /b 1
  )
)

REM --- 5. Show how to reach it from your phone ---
echo.
echo ===============================================
echo   Starting G_Tools...
echo ===============================================
echo.
echo  On THIS machine open:   http://localhost:3000
echo.
echo  From your PHONE ^(same network or this VPS public IP^), open:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  set IP=!IP: =!
  echo     http://!IP!:3000
)
echo.
echo  ^(Log in with APP_PASSWORD, then unlock the vault with your passphrase.^)
echo.
echo  Keep this window OPEN while you use the app. Close it to stop the server.
echo ===============================================
echo.

REM --- 6. Run ---
call npm start

pause
