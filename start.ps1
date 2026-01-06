# PowerShell script to start the Vending Machine Location Finder
Write-Host "Starting Vending Machine Location Finder..." -ForegroundColor Green
Write-Host ""

# Change to script directory
Set-Location $PSScriptRoot

Write-Host "Current directory: $(Get-Location)" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is available
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Write-Host "Starting development server..." -ForegroundColor Yellow
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "Backend API: http://localhost:4242" -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host ""
    npm run dev
} else {
    Write-Host "Error: Node.js not found!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Write-Host ""
    pause
}







