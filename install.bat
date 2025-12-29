@echo off
echo ==========================================
echo    HIT by Huma POS - Installation Setup
echo ==========================================
echo.

REM Check if Node.js is installed
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [1/4] Installing root dependencies...
call npm install

echo [2/4] Installing server dependencies...
cd server
call npm install
cd ..

echo [3/4] Installing client dependencies...
cd client
call npm install
cd ..

echo [4/4] Building client for production...
call npm run build

echo.
echo ==========================================
echo    Installation Complete!
echo ==========================================
echo.
echo NEXT STEPS:
echo 1. Rename 'server\.env.laptop' to 'server\.env'
echo 2. Run 'start-pos.bat' to start the application
echo.
pause
