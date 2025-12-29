@echo off
:: HIT by Huma POS - Production Launcher
:: Starts both server and client silently, then opens browser

cd /d "%~dp0"

:: Start server silently in background
start /B /MIN cmd /c "cd server && npm run dev"

:: Start client silently in background  
start /B /MIN cmd /c "cd client && npm run dev"

:: Wait for both to start
ping localhost -n 6 >nul

:: Open browser to frontend
start "" "http://localhost:5173"

exit
