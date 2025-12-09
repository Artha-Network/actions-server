# PowerShell script to restart the backend server with correct program ID

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend Server Restart Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check for old program ID in environment
$oldProgramId = "HwPkmjvQMHzRuyUYWcqibNQu4KFMLTqqMYFfgHhZvtBT"
$newProgramId = "B1a1oejNg8uWz7USuuFSqmRQRUSZ95kk2e4PzRZ7Uti4"

Write-Host "Checking environment variables..." -ForegroundColor Yellow
if ($env:PROGRAM_ID -eq $oldProgramId) {
    Write-Host "⚠️  Found old PROGRAM_ID in environment!" -ForegroundColor Red
    Write-Host "   Removing old PROGRAM_ID..." -ForegroundColor Yellow
    Remove-Item Env:\PROGRAM_ID
    Write-Host "✓ Removed old PROGRAM_ID" -ForegroundColor Green
}

if ($env:NEXT_PUBLIC_PROGRAM_ID -eq $oldProgramId) {
    Write-Host "⚠️  Found old NEXT_PUBLIC_PROGRAM_ID in environment!" -ForegroundColor Red
    Write-Host "   Removing old NEXT_PUBLIC_PROGRAM_ID..." -ForegroundColor Yellow
    Remove-Item Env:\NEXT_PUBLIC_PROGRAM_ID
    Write-Host "✓ Removed old NEXT_PUBLIC_PROGRAM_ID" -ForegroundColor Green
}

Write-Host ""
Write-Host "Verifying code configuration..." -ForegroundColor Yellow
$configFile = "src\config\solana.ts"
if (Test-Path $configFile) {
    $configContent = Get-Content $configFile -Raw
    if ($configContent -match 'const DEFAULT_PROGRAM_ID = "([^"]+)"') {
        $codeProgramId = $matches[1]
        if ($codeProgramId -eq $newProgramId) {
            Write-Host "✓ Code has correct program ID: $codeProgramId" -ForegroundColor Green
        } else {
            Write-Host "✗ Code has wrong program ID: $codeProgramId" -ForegroundColor Red
            Write-Host "  Expected: $newProgramId" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "⚠️  Could not find DEFAULT_PROGRAM_ID in config file" -ForegroundColor Yellow
    }
} else {
    Write-Host "✗ Config file not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Cleaning build artifacts..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "✓ Removed dist/ folder" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Ready to restart server" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The server will use program ID: $newProgramId" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the server, run:" -ForegroundColor Yellow
Write-Host "  npm run dev" -ForegroundColor White
Write-Host "  or" -ForegroundColor White
Write-Host "  npm start" -ForegroundColor White
Write-Host ""
Write-Host "Check the startup logs to verify the program ID." -ForegroundColor Yellow
Write-Host ""

