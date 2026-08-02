@echo off
echo Checking backend server status...
echo.

REM Check if server is running
netstat -ano | findstr :3001 >nul
if %ERRORLEVEL% == 0 (
    echo Server is running on port 3001
    echo Stopping server...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /F /PID %%a >nul 2>&1
    timeout /t 2 >nul
)

echo Starting backend server...
cd backend
start "Backend Server" cmd /k "npm run dev"

echo.
echo Server is starting...
echo Please wait 5-10 seconds for the server to fully start.
echo You can run the test script after the server is ready.
echo.
pause