@echo off
echo Starting HIT by Huma POS (Production Mode)...
echo.

REM Start server
start "POS Server" /min cmd /c "cd server && npm start"

REM Wait for server to start
timeout /t 3 /nobreak >nul

REM Open browser to production client
start http://localhost:3001

echo.
echo POS is running at http://localhost:3001
echo Server running in minimized window.
echo Close this window to stop the server.
echo.
pause
