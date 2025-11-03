# Restart Backend via ALB
# Uses the stable domain instead of changing IPs

$cluster = "tooltip-companion-cluster"
$region = "us-east-1"
$backendUrl = "https://backend.tooltipcompanion.com"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "     Backend Restart via ALB" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check backend status
Write-Host "Step 1: Checking backend health..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$backendUrl/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Backend is healthy!" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Backend is working - no restart needed." -ForegroundColor Green
    exit 0
} catch {
    Write-Host "❌ Backend not responding: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Step 2: Finding ECS service..." -ForegroundColor Yellow
try {
    # Get service ARN
    $services = aws ecs list-services --cluster $cluster --region $region --output json 2>&1 | ConvertFrom-Json
    
    if ($services.serviceArns.Count -eq 0) {
        Write-Host "❌ No services found!" -ForegroundColor Red
        exit 1
    }
    
    $serviceName = $services.serviceArns[0].Split('/')[-1]
    Write-Host "✅ Found service: $serviceName" -ForegroundColor Green
    
    # Get current status
    $serviceInfo = aws ecs describe-services --cluster $cluster --services $serviceName --region $region --output json 2>&1 | ConvertFrom-Json
    $service = $serviceInfo.services[0]
    
    Write-Host "   Current tasks: $($service.runningCount) / $($service.desiredCount)" -ForegroundColor White
    
    Write-Host ""
    Write-Host "Step 3: Restarting service..." -ForegroundColor Yellow
    
    # Force new deployment
    $updateOutput = aws ecs update-service `
        --cluster $cluster `
        --service $serviceName `
        --force-new-deployment `
        --region $region `
        --output json 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Restart initiated!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Waiting for backend to come back online..." -ForegroundColor Cyan
        
        # Wait and test
        $maxRetries = 12
        $retryCount = 0
        while ($retryCount -lt $maxRetries) {
            Start-Sleep -Seconds 10
            try {
                $response = Invoke-RestMethod -Uri "$backendUrl/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
                Write-Host "✅ Backend is back online!" -ForegroundColor Green
                Write-Host "   Status: $($response.status)" -ForegroundColor Green
                Write-Host "   Browser: $($response.browser)" -ForegroundColor Green
                exit 0
            } catch {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-Host "   Still starting... ($retryCount/$maxRetries)" -ForegroundColor Yellow
                }
            }
        }
        
        Write-Host ""
        Write-Host "⚠️  Backend taking longer than expected to start" -ForegroundColor Yellow
        Write-Host "   Check again: curl $backendUrl/health" -ForegroundColor White
    } else {
        Write-Host "❌ Failed to restart: $updateOutput" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual restart:" -ForegroundColor Yellow
    Write-Host "  AWS Console → ECS → Clusters → $cluster → Services → Update → Force new deployment"
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan


