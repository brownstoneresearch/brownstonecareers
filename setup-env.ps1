$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Brownstone Careers - Local Environment Setup" -ForegroundColor Cyan
Write-Host "The API key will be written only to your local .env file." -ForegroundColor Yellow
Write-Host ""

$secureKey = Read-Host "Paste your NEW Resend API key" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

    if ([string]::IsNullOrWhiteSpace($apiKey) -or -not $apiKey.StartsWith("re_")) {
        throw "The API key is missing or does not begin with re_."
    }

    $envContent = @"
PORT=3000
RESEND_API_KEY=$apiKey
EMAIL_FROM=Brownstone Careers <applications@brownstonecareers.agency>
RECRUITMENT_EMAIL=support@brownstonecareers.agency
"@

    Set-Content -Path ".env" -Value $envContent -Encoding UTF8
    Write-Host ""
    Write-Host ".env created successfully beside server.js." -ForegroundColor Green
    Write-Host "Run: npm install" -ForegroundColor White
    Write-Host "Then: npm start" -ForegroundColor White
}
finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}
