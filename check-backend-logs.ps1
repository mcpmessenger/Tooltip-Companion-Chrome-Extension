# Check Backend Logs and Diagnose HTTP 500 Errors
# Run this script with AWS CLI configured

$logGroup = "/ecs/tooltip-companion-backend"
$region = "us-east-1"
$cluster = "tooltip-companion-cluster"

Write-Host "=== ECS Backend Diagnostic Script ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check running tasks
Write-Host "1. Checking running tasks..." -ForegroundColor Yellow
$tasks = aws ecs list-tasks --cluster $cluster --region $region --output json | ConvertFrom-Json
if ($tasks.taskArns.Count -eq 0) {
    Write-Host "❌ No running tasks found!" -ForegroundColor Red
    exit 1
}

$taskArn = $tasks.taskArns[0]
Write-Host "✅ Task running: $($taskArn.Split('/')[-1])" -ForegroundColor Green

# 2. Get task details
Write-Host "`n2. Getting task details..." -ForegroundColor Yellow
$taskDetails = aws ecs describe-tasks --cluster $cluster --tasks $taskArn --region $region --output json | ConvertFrom-Json
$status = $taskDetails.tasks[0].lastStatus
$health = $taskDetails.tasks[0].healthStatus
Write-Host "Status: $status" -ForegroundColor $(if ($status -eq "RUNNING") { "Green" } else { "Red" })
Write-Host "Health: $health" -ForegroundColor $(if ($health -eq "HEALTHY") { "Green" } else { "Yellow" })

# 3. Get log stream
Write-Host "`n3. Getting recent logs..." -ForegroundColor Yellow
$logStreams = aws logs describe-log-streams --log-group-name $logGroup --region $region --order-by LastEventTime --descending --max-items 1 --output json | ConvertFrom-Json
if ($logStreams.logStreams.Count -eq 0) {
    Write-Host "❌ No log streams found!" -ForegroundColor Red
    exit 1
}

$logStream = $logStreams.logStreams[0].logStreamName
Write-Host "Log Stream: $logStream" -ForegroundColor Cyan

# 4. Get recent error logs
Write-Host "`n4. Checking for errors in last 30 minutes..." -ForegroundColor Yellow
$startTime = [int64]((Get-Date).AddMinutes(-30).ToUniversalTime() - (Get-Date "1970-01-01")).TotalMilliseconds

# Get raw log events and filter
$events = aws logs get-log-events --log-group-name $logGroup --log-stream-name $logStream --region $region --start-time $startTime --limit 100 --output json | ConvertFrom-Json
$errorEvents = $events.events | Where-Object { $_.message -match "error|Error|ERROR|500|exception|Exception|failed|Failed" } | Select-Object -Last 20

if ($errorEvents.Count -eq 0) {
    Write-Host "⚠️  No obvious errors in recent logs" -ForegroundColor Yellow
} else {
    Write-Host "Found $($errorEvents.Count) error-related log entries:" -ForegroundColor Red
    $errorEvents | ForEach-Object {
        $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds($_.timestamp).LocalDateTime
        Write-Host "  [$timestamp] $($_.message)" -ForegroundColor Red
    }
}

# 5. Test health endpoint
Write-Host "`n5. Testing /health endpoint..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/health" -Method GET -TimeoutSec 10
    Write-Host "✅ Health endpoint working!" -ForegroundColor Green
    Write-Host "   Status: $($healthResponse.status)" -ForegroundColor Cyan
    Write-Host "   Browser: $($healthResponse.browser)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Health endpoint error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "   Status Code: $statusCode" -ForegroundColor Red
    }
}

# 6. Test /context endpoint (new consolidated endpoint)
Write-Host "`n6. Testing /context endpoint..." -ForegroundColor Yellow
$testBody = @{ url = "https://example.com" } | ConvertTo-Json -Compress
try {
    $response = Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/context" -Method POST -Body $testBody -ContentType "application/json" -TimeoutSec 30
    Write-Host "✅ /context endpoint working!" -ForegroundColor Green
    Write-Host "   Has screenshot: $($response.screenshot -ne $null)" -ForegroundColor Cyan
    Write-Host "   Has analysis: $($response.analysis -ne $null)" -ForegroundColor Cyan
    if ($response.analysis) {
        Write-Host "   Page type: $($response.analysis.pageType)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ /context endpoint error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "   Status Code: $statusCode" -ForegroundColor Red
    }
    Write-Host "   (Backend may not have /context endpoint yet - this is OK)" -ForegroundColor Yellow
}

# 7. Test /capture endpoint (fallback)
Write-Host "`n7. Testing /capture endpoint (fallback)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/capture" -Method POST -Body $testBody -ContentType "application/json" -TimeoutSec 30
    Write-Host "✅ /capture endpoint working!" -ForegroundColor Green
} catch {
    Write-Host "❌ /capture endpoint error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "   Status Code: $statusCode" -ForegroundColor Red
        
        # Try to get error response body
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "   Response: $responseBody" -ForegroundColor Yellow
        } catch {
            Write-Host "   (Could not read error response body)" -ForegroundColor Gray
        }
    }
}

# 6. Recommendations
Write-Host "`n=== Recommendations ===" -ForegroundColor Cyan
Write-Host "1. Check CloudWatch Logs for detailed error messages"
Write-Host "2. Verify Playwright is installed in the Docker image"
Write-Host "3. Check if container has enough memory/resources"
Write-Host "4. Review task definition for environment variables"
Write-Host "5. Test with a simpler URL first (e.g., example.com)"

Write-Host "`nTo view full logs, run:" -ForegroundColor Yellow
Write-Host "aws logs tail $logGroup --region $region --follow" -ForegroundColor White

