# Quick Deploy Script for HIT BY HUMA POS
param(
    [string]$Target = "all"  # Options: all, client, server
)

Write-Host "🚀 Deploying HIT BY HUMA POS..." -ForegroundColor Cyan

if ($Target -eq "all" -or $Target -eq "client") {
    Write-Host "`n📦 Deploying Client to Vercel..." -ForegroundColor Yellow
    Push-Location client
    vercel --prod --yes
    Pop-Location
    Write-Host "✅ Client deployed!" -ForegroundColor Green
}

if ($Target -eq "all" -or $Target -eq "server") {
    Write-Host "`n📦 Deploying Server to Railway..." -ForegroundColor Yellow
    Push-Location server
    railway up
    Pop-Location
    Write-Host "✅ Server deployed!" -ForegroundColor Green
}

Write-Host "`n🎉 Deployment complete!" -ForegroundColor Cyan
