$ErrorActionPreference = "Stop"

if (-not (Test-Path ".dev.vars")) {
    Write-Host "Missing .dev.vars file." -ForegroundColor Yellow
    Write-Host "Copy .dev.vars.example to .dev.vars and add your Cloudflare/Resend values." -ForegroundColor Yellow
    exit 1
}

npm run build
npm run pages:dev
