# Review ECS Capacity for Operation Juicebox Phase 1
# Checks current configuration against recommended settings

$region = "us-east-1"
$cluster = "tooltip-companion-cluster"
$taskDefFamily = "tooltip-companion-backend"

Write-Host "=== Operation Juicebox: ECS Capacity Review ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check AWS CLI
Write-Host "Step 1: Checking AWS CLI..." -ForegroundColor Yellow
try {
    aws sts get-caller-identity --region $region --output json 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ AWS CLI configured" -ForegroundColor Green
    } else {
        Write-Host "❌ AWS CLI not configured" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ AWS CLI error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Get service info
Write-Host ""
Write-Host "Step 2: Gathering ECS service information..." -ForegroundColor Yellow

try {
    $services = aws ecs list-services --cluster $cluster --region $region --output json 2>&1 | ConvertFrom-Json
    $serviceName = $null
    
    foreach ($serviceArn in $services.serviceArns) {
        $svcName = $serviceArn.Split('/')[-1]
        $serviceInfo = aws ecs describe-services --cluster $cluster --services $svcName --region $region --output json 2>&1 | ConvertFrom-Json
        if ($serviceInfo.services[0].taskDefinition -like "*$taskDefFamily*") {
            $serviceName = $svcName
            break
        }
    }
    
    if (-not $serviceName) {
        Write-Host "❌ Could not find ECS service" -ForegroundColor Red
        exit 1
    }
    
    $serviceDetails = aws ecs describe-services --cluster $cluster --services $serviceName --region $region --output json 2>&1 | ConvertFrom-Json
    $service = $serviceDetails.services[0]
    
    Write-Host "✅ Found service: $serviceName" -ForegroundColor Green
} catch {
    Write-Host "❌ Error getting service: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Get task definition
Write-Host ""
Write-Host "Step 3: Analyzing task definition..." -ForegroundColor Yellow

try {
    $taskDefArn = $service.taskDefinition
    $taskDef = aws ecs describe-task-definition --task-definition $taskDefArn --region $region --output json 2>&1 | ConvertFrom-Json
    $containerDef = $taskDef.taskDefinition.containerDefinitions[0]
    
    Write-Host "✅ Task definition retrieved" -ForegroundColor Green
} catch {
    Write-Host "❌ Error getting task definition: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Review against checklist
Write-Host ""
Write-Host "=== Capacity Review Results ===" -ForegroundColor Cyan
Write-Host ""

# 1. Task Definition
Write-Host "1. Task Definition" -ForegroundColor Yellow
$memory = $containerDef.memory
$cpu = $containerDef.cpu
$memoryOk = $memory -ge 4096
$cpuOk = $cpu -ge 2048

Write-Host "   Memory: $memory MiB" -ForegroundColor $(if ($memoryOk) { "Green" } else { "Red" })
Write-Host "   CPU: $cpu units" -ForegroundColor $(if ($cpuOk) { "Green" } else { "Red" })

if (-not $memoryOk) {
    Write-Host "   ⚠️  Recommended: >= 4096 MiB for Playwright workloads" -ForegroundColor Yellow
}
if (-not $cpuOk) {
    Write-Host "   ⚠️  Recommended: >= 2048 CPU units" -ForegroundColor Yellow
}

$ulimits = $containerDef.ulimits
if ($ulimits) {
    $nofile = $ulimits | Where-Object { $_.name -eq "nofile" }
    if ($nofile) {
        Write-Host "   ✅ File descriptor ulimit configured: $($nofile.softLimit)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  No file descriptor ulimit configured (recommended for Playwright)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  No ulimits configured" -ForegroundColor Yellow
}

$healthCheck = $containerDef.healthCheck
if ($healthCheck) {
    $gracePeriod = $healthCheck.startPeriod
    if ($gracePeriod -ge 60) {
        Write-Host "   ✅ Health check grace period: ${gracePeriod}s (>= 60s)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Health check grace period: ${gracePeriod}s (recommended >= 60s)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  No health check configured" -ForegroundColor Yellow
}

# 2. Service Scaling
Write-Host ""
Write-Host "2. Service Scaling" -ForegroundColor Yellow
$desiredCount = $service.desiredCount
$runningCount = $service.runningCount

Write-Host "   Desired count: $desiredCount" -ForegroundColor $(if ($desiredCount -ge 2) { "Green" } else { "Yellow" })
Write-Host "   Running count: $runningCount" -ForegroundColor $(if ($runningCount -eq $desiredCount) { "Green" } else { "Yellow" })

if ($desiredCount -lt 2) {
    Write-Host "   ⚠️  Recommended: >= 2 for zero-downtime deployments" -ForegroundColor Yellow
}

# Check auto scaling
$scalingPolicies = aws application-autoscaling describe-scaling-policies `
    --service-namespace ecs `
    --resource-id "service/$cluster/$serviceName" `
    --region $region `
    --output json 2>&1 | ConvertFrom-Json

if ($scalingPolicies.ScalingPolicies.Count -gt 0) {
    Write-Host "   ✅ Auto scaling configured" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  No auto scaling policy configured" -ForegroundColor Yellow
}

# 3. Platform Checks
Write-Host ""
Write-Host "3. Platform Configuration" -ForegroundColor Yellow

$loadBalancers = $service.loadBalancers
if ($loadBalancers.Count -gt 0) {
    Write-Host "   ✅ Load balancer configured" -ForegroundColor Green
    
    $targetGroupArn = $loadBalancers[0].targetGroupArn
    $tgHealth = aws elbv2 describe-target-health --target-group-arn $targetGroupArn --region $region --output json 2>&1 | ConvertFrom-Json
    
    $healthyTargets = ($tgHealth.TargetHealthDescriptions | Where-Object { $_.TargetHealth.State -eq "healthy" }).Count
    $totalTargets = $tgHealth.TargetHealthDescriptions.Count
    
    Write-Host "   Target health: $healthyTargets/$totalTargets healthy" -ForegroundColor $(if ($healthyTargets -eq $totalTargets -and $totalTargets -gt 0) { "Green" } else { "Yellow" })
} else {
    Write-Host "   ⚠️  No load balancer configured" -ForegroundColor Yellow
}

# 4. Instrumentation
Write-Host ""
Write-Host "4. Instrumentation" -ForegroundColor Yellow

$logConfiguration = $containerDef.logConfiguration
if ($logConfiguration -and $logConfiguration.logDriver -eq "awslogs") {
    Write-Host "   ✅ CloudWatch Logs configured" -ForegroundColor Green
    $logGroup = $logConfiguration.options.'awslogs-group'
    if ($logGroup) {
        $logGroupDetails = aws logs describe-log-groups --log-group-name-prefix $logGroup --region $region --output json 2>&1 | ConvertFrom-Json
        if ($logGroupDetails.logGroups.Count -gt 0) {
            $retentionDays = $logGroupDetails.logGroups[0].retentionInDays
            if ($retentionDays -ge 14) {
                Write-Host "   ✅ Log retention: ${retentionDays} days (>= 14 days)" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  Log retention: ${retentionDays} days (recommended >= 14 days)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "   ⚠️  CloudWatch Logs not configured" -ForegroundColor Yellow
}

# Check for alarms
$alarms = aws cloudwatch describe-alarms --alarm-name-prefix "ojx-$cluster-$serviceName" --region $region --output json 2>&1 | ConvertFrom-Json
if ($alarms.MetricAlarms.Count -gt 0) {
    Write-Host "   ✅ CloudWatch alarms deployed: $($alarms.MetricAlarms.Count) alarms" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  No Operation Juicebox alarms found (run deploy-alarms.ps1)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Review Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Address any warnings above" -ForegroundColor White
Write-Host "  2. Deploy CloudWatch alarms (if not done): .\deploy-alarms.ps1" -ForegroundColor White
Write-Host "  3. Deploy backend updates: ..\..\deploy-backend.ps1" -ForegroundColor White
Write-Host ""

