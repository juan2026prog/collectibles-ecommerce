Write-Host "Starting E2E Tests..." -ForegroundColor Cyan

Write-Host "Starting dev server..." -ForegroundColor Yellow
$devJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\59897\Documents\Collectibles2026\project\frontend"
    npm run dev
}

Write-Host "Waiting for server to be ready..." -ForegroundColor Yellow
$serverReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $serverReady = $true
            Write-Host "Server ready!" -ForegroundColor Green
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $serverReady) {
    Write-Host "Server failed to start" -ForegroundColor Red
    Stop-Job -Job $devJob -ErrorAction SilentlyContinue
    Remove-Job -Job $devJob -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "Running E2E tests..." -ForegroundColor Yellow
Set-Location "C:\Users\59897\Documents\Collectibles2026\project\frontend"
npx playwright test --reporter=list

Write-Host "Stopping dev server..." -ForegroundColor Yellow
Stop-Job -Job $devJob -ErrorAction SilentlyContinue
Remove-Job -Job $devJob -ErrorAction SilentlyContinue

Write-Host "Done!" -ForegroundColor Green
