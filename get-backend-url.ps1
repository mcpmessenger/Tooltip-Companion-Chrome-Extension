# Get Current Backend URL from ECS
# Automatically detects the public IP of the running ECS task

$cluster = "tooltip-companion-cluster"
$region = "us-east-1"
$port = "3000"

Write-Host "=== Getting Current Backend URL ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get running tasks
Write-Host "Step 1: Finding running ECS tasks..." -ForegroundColor Yellow
try {
    $tasks = aws ecs list-tasks --cluster $cluster --region $region --desired-status RUNNING --output json 2>&1 | ConvertFrom-Json
    
    if (-not $tasks.taskArns -or $tasks.taskArns.Count -eq 0) {
        Write-Host "❌ No running tasks found in cluster" -ForegroundColor Red
        Write-Host ""
        Write-Host "Check if service is running:" -ForegroundColor Yellow
        Write-Host "  aws ecs describe-services --cluster $cluster --services tooltip-companion-backend-service --region $region"
        exit 1
    }
    
    Write-Host "✅ Found $($tasks.taskArns.Count) running task(s)" -ForegroundColor Green
    $taskArn = $tasks.taskArns[0]
    Write-Host "   Task: $($taskArn.Split('/')[-1])" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error listing tasks: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Get task details
Write-Host ""
Write-Host "Step 2: Getting task network details..." -ForegroundColor Yellow
try {
    $taskDetails = aws ecs describe-tasks --cluster $cluster --tasks $taskArn --region $region --output json 2>&1 | ConvertFrom-Json
    $task = $taskDetails.tasks[0]
    
    if (-not $task) {
        Write-Host "❌ Task details not found" -ForegroundColor Red
        exit 1
    }
    
    # Get network interface ID
    $eniId = $null
    if ($task.attachments) {
        foreach ($attachment in $task.attachments) {
            foreach ($detail in $attachment.details) {
                if ($detail.name -eq 'networkInterfaceId') {
                    $eniId = $detail.value
                    break
                }
            }
            if ($eniId) { break }
        }
    }
    
    if (-not $eniId) {
        Write-Host "❌ Could not find network interface ID" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Network Interface: $eniId" -ForegroundColor Green
} catch {
    Write-Host "❌ Error getting task details: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Get public IP
Write-Host ""
Write-Host "Step 3: Getting public IP address..." -ForegroundColor Yellow
try {
    $eniDetails = aws ec2 describe-network-interfaces --network-interface-ids $eniId --region $region --output json 2>&1 | ConvertFrom-Json
    $eni = $eniDetails.NetworkInterfaces[0]
    
    if (-not $eni) {
        Write-Host "❌ Network interface not found" -ForegroundColor Red
        exit 1
    }
    
    $publicIp = $eni.Association.PublicIp
    $privateIp = $eni.PrivateIpAddress
    
    if (-not $publicIp) {
        Write-Host "❌ Public IP not found (task may not have public IP configured)" -ForegroundColor Red
        Write-Host "   Private IP: $privateIp" -ForegroundColor Gray
        exit 1
    }
    
    Write-Host "✅ Public IP: $publicIp" -ForegroundColor Green
    Write-Host "   Private IP: $privateIp" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error getting network interface details: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Test backend connectivity
Write-Host ""
Write-Host "Step 4: Testing backend connectivity..." -ForegroundColor Yellow
$backendUrl = "http://${publicIp}:${port}"

try {
    $response = Invoke-WebRequest -Uri "$backendUrl/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend is reachable and healthy!" -ForegroundColor Green
        $healthy = $true
    } else {
        Write-Host "⚠️  Backend responded but status code: $($response.StatusCode)" -ForegroundColor Yellow
        $healthy = $false
    }
} catch {
    Write-Host "❌ Backend is NOT reachable" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
    $healthy = $false
}

# Step 5: Display results
Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "          CURRENT BACKEND URL" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend URL:" -ForegroundColor Yellow
Write-Host "  $backendUrl" -ForegroundColor $(if ($healthy) { "Green" } else { "Yellow" })
Write-Host ""
Write-Host "Task Details:" -ForegroundColor Yellow
Write-Host "  Task ID: $($taskArn.Split('/')[-1])" -ForegroundColor Gray
Write-Host "  Public IP: $publicIp" -ForegroundColor Gray
Write-Host "  Private IP: $privateIp" -ForegroundColor Gray
Write-Host "  Status: $($task.lastStatus)" -ForegroundColor Gray
Write-Host ""
Write-Host "Health Status:" -ForegroundColor Yellow
if ($healthy) {
    Write-Host "  ✅ Backend is healthy and responding" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Backend may not be fully ready yet" -ForegroundColor Yellow
    Write-Host "     (Task might still be starting up)" -ForegroundColor Gray
}
Write-Host ""

# Step 6: Show next steps
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "          NEXT STEPS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "To update extension with this URL:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1: Manual Update (Recommended)" -ForegroundColor White
Write-Host "  1. Open chrome://extensions/" -ForegroundColor Gray
Write-Host "  2. Find 'Tooltip Companion'" -ForegroundColor Gray
Write-Host "  3. Click 'Options'" -ForegroundColor Gray
Write-Host "  4. Paste this URL: $backendUrl" -ForegroundColor Cyan
Write-Host "  5. Click 'Save Settings'" -ForegroundColor Gray
Write-Host "  6. Reload extension and refresh pages" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 2: Copy to Clipboard" -ForegroundColor White
Write-Host "  Run this command to copy URL:" -ForegroundColor Gray
Write-Host "  '$backendUrl' | Set-Clipboard" -ForegroundColor Cyan
Write-Host ""

# Copy to clipboard automatically
try {
    $backendUrl | Set-Clipboard
    Write-Host "✅ Backend URL copied to clipboard!" -ForegroundColor Green
    Write-Host "   Just paste it in extension Options → Backend URL" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "⚠️  Could not copy to clipboard automatically" -ForegroundColor Yellow
}

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

