@echo off
setlocal
echo ========================================
echo   Starting Backend Server
echo ========================================
echo.

cd /d "%~dp0backend" || (
  echo [ERROR] Folder backend tidak ditemukan.
  pause
  exit /b 1
)

echo Starting backend server...
start "Backend Server" cmd /k "npm run dev"

echo.
echo Backend server is starting in a new window...
echo Please wait 5-10 seconds for the server to be ready.
echo.
echo The backend will run on: http://localhost:3001
echo.
echo Press any key to close this window...
pause >nul