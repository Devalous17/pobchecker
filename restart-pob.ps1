$ErrorActionPreference = "Stop"

$projectPath = "C:\Users\natha\Documents\poething"
Set-Location $projectPath

# Stop only the local development server currently listening on port 3000.
$listeners = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "Stopping $($process.ProcessName) on port 3000..." -ForegroundColor Yellow
        Stop-Process -Id $process.Id -Force
    }
}

$env:POB_ENGINE_URL = "http://127.0.0.1:8080"
Write-Host "Starting PoB Reality Check at http://localhost:3000" -ForegroundColor Green
npm.cmd run dev
