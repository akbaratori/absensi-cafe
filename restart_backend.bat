@echo off
setlocal
echo Restarting backend server...
cd /d "%~dp0backend" || (
  echo [ERROR] Folder backend tidak ditemukan.
  pause
  exit /b 1
)
echo Stopping any running processes...
taskkill /F /IM node.exe 2>nul
echo Starting backend server...
npm run dev
pause