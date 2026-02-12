# Script to regenerate Prisma client
# This should be run when the server is stopped

Write-Host "Regenerating Prisma client..." -ForegroundColor Yellow

# Try to remove the .prisma folder to force regeneration
$prismaPath = "node_modules\.prisma"
if (Test-Path $prismaPath) {
    Write-Host "Removing old Prisma client..." -ForegroundColor Yellow
    try {
        Remove-Item -Recurse -Force $prismaPath -ErrorAction SilentlyContinue
        Write-Host "✓ Removed old Prisma client" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Could not remove (may be locked by running process)" -ForegroundColor Yellow
    }
}

# Generate Prisma client
Write-Host "Generating Prisma client..." -ForegroundColor Yellow
npx prisma generate

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Prisma client regenerated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now restart your server with: npm run dev" -ForegroundColor Cyan
} else {
    Write-Host "❌ Failed to regenerate Prisma client" -ForegroundColor Red
    Write-Host "Make sure the server is stopped before running this script" -ForegroundColor Yellow
}

