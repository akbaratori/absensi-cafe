@echo off
echo ========================================
echo   Starting Backend Server
echo ========================================
echo.

cd backend

echo Generating Prisma client...
node node_modules\prisma\build\index.js generate --schema prisma\schema.prisma

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
