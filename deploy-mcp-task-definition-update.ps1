# Deploy MCP Backend - Create New Task Definition Revision
# This script creates a new task definition revision to force ECS to pull the latest image

$region = "us-east-1"
$cluster = "tooltip-companion-cluster"
$serviceName = "tooltip-companion-backend-service"
$ecrRepo = "396608803476.dkr.ecr.us-east-1.amazonaws.com/tooltip-companion-backend"
$taskDefFamily = "tooltip-companion-backend"

Write-Host "=== Deploy MCP Backend - Force Task Definition Update ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check AWS CLI
Write-Host "Step 1: Checking AWS CLI configuration..." -ForegroundColor Yellow
try {
    $awsAccount = aws sts get-caller-identity --region $region --output json 2>&1 | ConvertFrom-Json
    if ($awsAccount.Account) {
        Write-Host "✅ AWS CLI configured. Account: $($awsAccount.Account)" -ForegroundColor Green
    } else {
        Write-Host "❌ AWS CLI not configured." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ AWS CLI not configured or no permissions." -ForegroundColor Red
    exit 1
}

# Step 2: Get current task definition
Write-Host ""
Write-Host "Step 2: Getting current task definition..." -ForegroundColor Yellow
try {
    $currentService = aws ecs describe-services --cluster $cluster --services $serviceName --region $region --output json | ConvertFrom-Json
    $currentTaskDefArn = $currentService.services[0].taskDefinition
    Write-Host "✅ Current task definition: $currentTaskDefArn" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get current task definition: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Create new task definition revision
Write-Host ""
Write-Host "Step 3: Creating new task definition revision..." -ForegroundColor Yellow

# Use the simplest approach: register a new revision using the current definition as template
$tempTaskDefFile = "temp-task-def-$([System.Guid]::NewGuid().ToString('N')).json"

try {
    # Get full task definition and extract just the taskDefinition part
    $fullTaskDef = aws ecs describe-task-definition --task-definition $currentTaskDefArn --region $region --output json | ConvertFrom-Json
    
    # Remove read-only fields that can't be in register-task-definition input
    $td = $fullTaskDef.taskDefinition
    $td.PSObject.Properties.Remove('taskDefinitionArn')
    $td.PSObject.Properties.Remove('revision')
    $td.PSObject.Properties.Remove('status')
    $td.PSObject.Properties.Remove('requiresAttributes')
    $td.PSObject.Properties.Remove('placementConstraints')
    $td.PSObject.Properties.Remove('compatibilities')
    $td.PSObject.Properties.Remove('registeredAt')
    $td.PSObject.Properties.Remove('registeredBy')
    
    # Convert taskDefinition to JSON (pretty format)
    $taskDefJson = $td | ConvertTo-Json -Depth 100
    
    # Save to temp file without BOM
    [System.IO.File]::WriteAllText((Resolve-Path .).Path + "\" + $tempTaskDefFile, $taskDefJson, [System.Text.UTF8Encoding]::new($false))
    
    Write-Host "   Task definition exported, creating new revision..." -ForegroundColor Gray
    
    # Register new revision from the exported file
    $registerOutput = aws ecs register-task-definition --cli-input-json "file://$tempTaskDefFile" --region $region --output json | ConvertFrom-Json
    
    if ($registerOutput.taskDefinition) {
        $newTaskDefArn = $registerOutput.taskDefinition.taskDefinitionArn
        $newRevision = $registerOutput.taskDefinition.revision
        
        Write-Host "✅ New task definition created!" -ForegroundColor Green
        Write-Host "   ARN: $newTaskDefArn" -ForegroundColor Gray
        Write-Host "   Revision: $newRevision" -ForegroundColor Gray
    } else {
        throw "Registration returned no task definition"
    }
} catch {
    Write-Host "❌ Failed to register new task definition: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    if (Test-Path $tempTaskDefFile) {
        Write-Host "Saved JSON file for debugging: $tempTaskDefFile" -ForegroundColor Gray
    }
    exit 1
} finally {
    Remove-Item $tempTaskDefFile -ErrorAction SilentlyContinue
}

# Step 4: Update ECS service
Write-Host ""
Write-Host "Step 4: Updating ECS service to use new revision..." -ForegroundColor Yellow

try {
    $updateOutput = aws ecs update-service `
        --cluster $cluster `
        --service $serviceName `
        --task-definition $newTaskDefArn `
        --force-new-deployment `
        --region $region `
        --output json 2>&1 | ConvertFrom-Json
    
    if ($updateOutput.service) {
        Write-Host "✅ Service update initiated!" -ForegroundColor Green
    } else {
        throw "Update returned no service"
    }
} catch {
    Write-Host "❌ Failed to update service: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Success summary
Write-Host ""
Write-Host "=== Deployment Initiated Successfully ===" -ForegroundColor Green
Write-Host ""
Write-Host "ECS will now:" -ForegroundColor Cyan
Write-Host "  1. Pull the latest Docker image from ECR" -ForegroundColor White
Write-Host "  2. Start new tasks with the MCP endpoint" -ForegroundColor White
Write-Host "  3. Gradually replace old tasks" -ForegroundColor White
Write-Host "  4. Complete deployment in 5-10 minutes" -ForegroundColor White
Write-Host ""
Write-Host "Monitor deployment progress:" -ForegroundColor Yellow
Write-Host "  aws ecs describe-services --cluster $cluster --services $serviceName --region $region" -ForegroundColor Gray
Write-Host ""
Write-Host "Get the new backend URL:" -ForegroundColor Yellow
Write-Host "  aws ecs list-tasks --cluster $cluster --region $region" -ForegroundColor Gray
Write-Host ""
Write-Host "Test MCP endpoint after deployment:" -ForegroundColor Green
Write-Host "  `$body = @{ jsonrpc = '2.0'; id = 1; method = 'ping' } | ConvertTo-Json" -ForegroundColor Gray
Write-Host "  Invoke-RestMethod -Uri 'http://NEW_IP:3000/mcp' -Method POST -Body `$body -ContentType 'application/json'" -ForegroundColor Gray
Write-Host ""
Write-Host "Expected response: {'jsonrpc':'2.0','id':1,'result':'pong'}" -ForegroundColor Cyan
Write-Host ""

