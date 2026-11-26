# Smart Resume-Job Matching System — One-Click Runner
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ApiDir = Join-Path $Root "apps\api"
$WebDir = Join-Path $Root "apps\web"
$PythonExe = Join-Path $ApiDir ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting Smart Resume-Job Matching System" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Start Backend API on Port 8008
Write-Host "[1/2] Launching Backend API on http://localhost:8008..." -ForegroundColor Yellow
$BackendCmd = "cd '$ApiDir'; `$env:PYTHONPATH = '.;.venv\Lib\site-packages'; & '$PythonExe' -m uvicorn app.main:app --host 0.0.0.0 --port 8008 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendCmd

# Start Frontend Client on Port 5173
Write-Host "[2/2] Launching Frontend Client on http://localhost:5173..." -ForegroundColor Yellow
$FrontendCmd = "cd '$WebDir'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $FrontendCmd

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Services Started Successfully!" -ForegroundColor Green
Write-Host " - Web App:        http://localhost:5173" -ForegroundColor White
Write-Host " - Admin Portal:   http://localhost:5173/admin/login" -ForegroundColor White
Write-Host " - API Swagger:    http://localhost:8008/docs" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

# Open default browser
Start-Process "http://localhost:5173"
