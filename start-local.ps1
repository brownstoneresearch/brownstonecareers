$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
    Write-Host "Missing .env file." -ForegroundColor Red
    Write-Host "Run: powershell -ExecutionPolicy Bypass -File .\setup-env.ps1"
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing Node dependencies..." -ForegroundColor Cyan
    npm install
}

npm start
