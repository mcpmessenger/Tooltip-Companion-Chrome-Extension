# Diagnose and Fix Backend 502 Bad Gateway Errors
# Comprehensive diagnostic script with automatic fixes

$cluster = "tooltip-companion-cluster"
$region = "us-east-1"
$serviceName = "tooltip-companion-backend-service"
$backendUrl = "https://backend.tooltipcompanion.com"
$logGroup = "/ecs/tooltip-companion-backend"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "     Diagnose & Fix Backend 502 Bad Gateway Errors" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$issuesFound = @()
$fixesApplied = @()

# ============================================================================
# STEP 1: Test Backend Health Endpoint
# ============================================================================
Write-Host "STEP 1: Testing Backend Health Endpoint" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

try {
    $healthResponse = Invoke-RestMethod -Uri "$backendUrl/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Health endpoint is responding!" -ForegroundColor Green
    Write-Host "   Status: $($healthResponse.status)" -ForegroundColor Cyan
    Write-Host "   Browser: $($healthResponse.browser)" -ForegroundColor Cyan
    
    if ($healthResponse.status -ne "healthy") {
        $issuesFound += "Backend health endpoint reports unhealthy status"
    }
} catch {
    $statusCode = $null
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
    }
    
    if ($statusCode -eq 502) {
        Write-Host "❌ Health endpoint returning 502 Bad Gateway" -ForegroundColor Red
        $issuesFound += "Backend returning 502 Bad Gateway"
    } elseif ($statusCode -eq 503) {
        Write-Host "❌ Health endpoint returning 503 Service Unavailable" -ForegroundColor Red
        $issuesFound += "Backend returning 503 Service Unavailable"
    } else {
        Write-Host "❌ Health endpoint error: $($_.Exception.Message)" -ForegroundColor Red
        if ($statusCode) {
            Write-Host "   Status Code: $statusCode" -ForegroundColor Red
            $issuesFound += "Backend returning HTTP $statusCode"
        } else {
            $issuesFound += "Backend not reachable: $($_.Exception.Message)"
        }
    }
}

Write-Host ""

# ============================================================================
# STEP 2: Check ECS Service Status
# ============================================================================
Write-Host "STEP 2: Checking ECS Service Status" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

try {
    $services = aws ecs describe-services --cluster $cluster --services $serviceName --region $region --output json 2>&1 | ConvertFrom-Json
    
    if ($services.services.Count -eq 0) {
        Write-Host "❌ Service '$serviceName' not found!" -ForegroundColor Red
        $issuesFound += "ECS service not found"
    } else {
        $service = $services.services[0]
        Write-Host "✅ Service found: $serviceName" -ForegroundColor Green
        Write-Host "   Desired Count: $($service.desiredCount)" -ForegroundColor Cyan
        Write-Host "   Running Count: $($service.runningCount)" -ForegroundColor Cyan
        Write-Host "   Pending Count: $($service.pendingCount)" -ForegroundColor Cyan
        
        if ($service.runningCount -eq 0) {
            Write-Host "❌ No tasks are running!" -ForegroundColor Red
            $issuesFound += "No ECS tasks running"
        } elseif ($service.runningCount -lt $service.desiredCount) {
            Write-Host "⚠️  Not all tasks are running ($($service.runningCount)/$($service.desiredCount))" -ForegroundColor Yellow
            $issuesFound += "Only $($service.runningCount) of $($service.desiredCount) tasks running"
        }
        
        # Check deployment status
        if ($service.deployments.Count -gt 0) {
            $primaryDeployment = $service.deployments | Where-Object { $_.status -eq "PRIMARY" } | Select-Object -First 1
            if ($primaryDeployment) {
                Write-Host "   Deployment Status: $($primaryDeployment.status)" -ForegroundColor Cyan
                if ($primaryDeployment.runningCount -lt $primaryDeployment.desiredCount) {
                    Write-Host "⚠️  Deployment not complete" -ForegroundColor Yellow
                    $issuesFound += "Deployment not fully rolled out"
                }
            }
        }
    }
} catch {
    Write-Host "❌ Error checking service: $($_.Exception.Message)" -ForegroundColor Red
    $issuesFound += "Cannot access ECS service: $($_.Exception.Message)"
}

Write-Host ""

# ============================================================================
# STEP 3: Check Running Tasks
# ============================================================================
Write-Host "STEP 3: Checking Running Tasks" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

try {
    $tasks = aws ecs list-tasks --cluster $cluster --service-name $serviceName --region $region --desired-status RUNNING --output json 2>&1 | ConvertFrom-Json
    
    if (-not $tasks.taskArns -or $tasks.taskArns.Count -eq 0) {
        Write-Host "❌ No running tasks found!" -ForegroundColor Red
        $issuesFound += "No running ECS tasks"
    } else {
        Write-Host "✅ Found $($tasks.taskArns.Count) running task(s)" -ForegroundColor Green
        
        foreach ($taskArn in $tasks.taskArns) {
            $taskId = $taskArn.Split('/')[-1]
            Write-Host "   Checking task: $taskId" -ForegroundColor Cyan
            
            $taskDetails = aws ecs describe-tasks --cluster $cluster --tasks $taskArn --region $region --output json 2>&1 | ConvertFrom-Json
            $task = $taskDetails.tasks[0]
            
            Write-Host "      Status: $($task.lastStatus)" -ForegroundColor $(if ($task.lastStatus -eq "RUNNING") { "Green" } else { "Red" })
            Write-Host "      Health: $($task.healthStatus)" -ForegroundColor $(if ($task.healthStatus -eq "HEALTHY") { "Green" } else { "Yellow" })
            
            if ($task.lastStatus -ne "RUNNING") {
                $issuesFound += "Task $taskId is not RUNNING (status: $($task.lastStatus))"
            }
            
            if ($task.healthStatus -and $task.healthStatus -ne "HEALTHY") {
                $issuesFound += "Task $taskId is not HEALTHY (status: $($task.healthStatus))"
            }
            
            # Check stop code (indicates why task stopped if it did)
            if ($task.stopCode) {
                Write-Host "      Stop Code: $($task.stopCode)" -ForegroundColor Red
                $issuesFound += "Task stopped with code: $($task.stopCode)"
            }
            
            # Check memory
            if ($task.memory) {
                $memoryMB = [int]$task.memory
                Write-Host "      Memory: ${memoryMB}MB" -ForegroundColor Cyan
                if ($memoryMB -lt 2048) {
                    Write-Host "      ⚠️  WARNING: Memory may be insufficient for Playwright" -ForegroundColor Yellow
                    $issuesFound += "Task memory ${memoryMB} MB may be insufficient"
                }
            }
        }
    }
} catch {
    Write-Host "❌ Error checking tasks: $($_.Exception.Message)" -ForegroundColor Red
    $issuesFound += "Cannot list tasks: $($_.Exception.Message)"
}

Write-Host ""

# ============================================================================
# STEP 4: Check Recent Logs for Errors
# ============================================================================
Write-Host "STEP 4: Checking Recent Logs for Errors" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

try {
    $logStreams = aws logs describe-log-streams --log-group-name $logGroup --region $region --order-by LastEventTime --descending --max-items 1 --output json 2>&1 | ConvertFrom-Json
    
    if ($logStreams.logStreams.Count -gt 0) {
        $logStream = $logStreams.logStreams[0].logStreamName
        Write-Host "✅ Latest log stream: $logStream" -ForegroundColor Green
        
        $startTime = [int64]((Get-Date).AddMinutes(-30).ToUniversalTime() - (Get-Date "1970-01-01")).TotalMilliseconds
        
        $events = aws logs get-log-events --log-group-name $logGroup --log-stream-name $logStream --region $region --start-time $startTime --limit 50 --output json 2>&1 | ConvertFrom-Json
        
        $errorEvents = $events.events | Where-Object { 
            $_.message -match "(?i)(error|exception|failed|502|503|crash|oom|out of memory|ECONNREFUSED|timeout)" 
        } | Select-Object -Last 10
        
        if ($errorEvents.Count -gt 0) {
            Write-Host "⚠️  Found $($errorEvents.Count) error-related entries:" -ForegroundColor Yellow
            foreach ($event in $errorEvents) {
                $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds($event.timestamp).LocalDateTime
                Write-Host "   [$timestamp] $($event.message.Substring(0, [Math]::Min(100, $event.message.Length)))" -ForegroundColor Red
            }
            
            # Look for specific patterns
            $oomErrors = $events.events | Where-Object { $_.message -match "(?i)(oom|out of memory)" }
            if ($oomErrors.Count -gt 0) {
                $issuesFound += "Out of memory errors detected in logs"
                Write-Host "   ❌ OUT OF MEMORY errors found!" -ForegroundColor Red
            }
            
            $crashErrors = $events.events | Where-Object { $_.message -match "(?i)(crash|fatal|uncaught exception)" }
            if ($crashErrors.Count -gt 0) {
                $issuesFound += "Crash or fatal errors detected in logs"
            }
        } else {
            Write-Host "✅ No obvious errors in recent logs" -ForegroundColor Green
        }
    } else {
        Write-Host "⚠️  No log streams found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not check logs: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# STEP 5: Summary and Recommendations
# ============================================================================
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "                    DIAGNOSIS SUMMARY" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($issuesFound.Count -eq 0) {
    Write-Host "✅ No obvious issues found!" -ForegroundColor Green
    Write-Host ""
    Write-Host "However, if you're still getting 502 errors:" -ForegroundColor Yellow
    Write-Host "1. Check ALB target health in AWS Console" -ForegroundColor White
    Write-Host "2. Verify security groups allow ALB → ECS traffic" -ForegroundColor White
    Write-Host "3. Check if there's a network issue" -ForegroundColor White
} else {
    Write-Host "⚠️  Found $($issuesFound.Count) issue(s):" -ForegroundColor Yellow
    foreach ($issue in $issuesFound) {
        Write-Host "   • $issue" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "                    RECOMMENDED FIXES" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Determine if restart is needed
$needsRestart = $false
if ($issuesFound -match "No.*tasks running" -or 
    $issuesFound -match "not RUNNING" -or 
    $issuesFound -match "not HEALTHY" -or
    $issuesFound -match "Out of memory" -or
    $issuesFound -match "502 Bad Gateway") {
    $needsRestart = $true
}

if ($needsRestart) {
    Write-Host "⚠️  RESTART RECOMMENDED" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Would you like to restart the backend service now? (Y/N)" -ForegroundColor Cyan
    $response = Read-Host
    
    if ($response -eq "Y" -or $response -eq "y" -or $response -eq "yes") {
        Write-Host ""
        Write-Host "Restarting service..." -ForegroundColor Yellow
        
        try {
            $updateOutput = aws ecs update-service `
                --cluster $cluster `
                --service $serviceName `
                --force-new-deployment `
                --region $region `
                --output json 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Restart initiated!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Waiting for service to recover..." -ForegroundColor Cyan
                
                $maxRetries = 20
                $retryCount = 0
                while ($retryCount -lt $maxRetries) {
                    Start-Sleep -Seconds 10
                    try {
                        $healthResponse = Invoke-RestMethod -Uri "$backendUrl/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
                        if ($healthResponse.status -eq "healthy") {
                            Write-Host "✅ Backend is back online and healthy!" -ForegroundColor Green
                            Write-Host "   Status: $($healthResponse.status)" -ForegroundColor Green
                            Write-Host "   Browser: $($healthResponse.browser)" -ForegroundColor Green
                            $fixesApplied += "Backend service restarted successfully"
                            break
                        }
                    } catch {
                        $retryCount++
                        if ($retryCount -lt $maxRetries) {
                            Write-Host "   Still starting... ($retryCount/$maxRetries)" -ForegroundColor Yellow
                        }
                    }
                }
                
                if ($retryCount -ge $maxRetries) {
                    Write-Host "⚠️  Backend taking longer than expected" -ForegroundColor Yellow
                    Write-Host "   Check status manually: curl $backendUrl/health" -ForegroundColor White
                }
            } else {
                Write-Host "❌ Failed to restart: $updateOutput" -ForegroundColor Red
            }
        } catch {
            Write-Host "❌ Error restarting: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host ""
        Write-Host "To restart manually, run:" -ForegroundColor Yellow
        Write-Host "  aws ecs update-service --cluster $cluster --service $serviceName --force-new-deployment --region $region" -ForegroundColor White
    }
} else {
    Write-Host "✅ Service appears to be running normally" -ForegroundColor Green
    Write-Host ""
    Write-Host "If 502 errors persist, check:" -ForegroundColor Yellow
    Write-Host "1. ALB target group health (AWS Console)" -ForegroundColor White
    Write-Host "2. Security group rules" -ForegroundColor White
    Write-Host "3. Backend application logs for specific errors" -ForegroundColor White
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "                    NEXT STEPS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($fixesApplied.Count -gt 0) {
    Write-Host "✅ Fixes Applied:" -ForegroundColor Green
    foreach ($fix in $fixesApplied) {
        Write-Host "   • $fix" -ForegroundColor Green
    }
    Write-Host ""
}

Write-Host "1. Test the backend:" -ForegroundColor Yellow
Write-Host "   curl $backendUrl/health" -ForegroundColor White
Write-Host ""
Write-Host "2. Reload the extension in Chrome" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Test tooltips on a webpage" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Monitor console for 502 errors" -ForegroundColor Yellow
Write-Host ""
Write-Host "To view full logs:" -ForegroundColor Yellow
Write-Host "   aws logs tail $logGroup --region $region --follow" -ForegroundColor White
Write-Host ""

