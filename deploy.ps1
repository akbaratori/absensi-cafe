# Deploy Script for Absensi Cafe System
Write-Host "Starting Deployment..." -ForegroundColor Green

# 1. Frontend Build
Write-Host "Building Frontend..." -ForegroundColor Cyan
cd frontend
npm install
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed!"
    exit 1
}
cd ..

# 2. Backend Setup
Write-Host "Setting up Backend..." -ForegroundColor Cyan
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Error "Database migration failed!"
    exit 1
}

# 3. Start Production Server
Write-Host "Starting Server with PM2..." -ForegroundColor Cyan
$env:NODE_ENV="production"
npx pm2 start ecosystem.config.js --env production
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to start server!"
    exit 1
}

Write-Host "Deployment Complete! Server running on port 3001." -ForegroundColor Green
Write-Host "Access the app at http://localhost:3001" -ForegroundColor Green
