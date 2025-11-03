# Complete MCP Deployment Script
# Builds Docker image, pushes to ECR, creates new task definition, and updates service

$region = "us-east-1"
$cluster = "tooltip-companion-cluster"
$ecrRepo = "396608803476.dkr.ecr.us-east-1.amazonaws.com/tooltip-companion-backend"
$imageTag = "latest"
$taskDefFamily = "tooltip-companion-backend"
$serviceName = "tooltip-companion-backend-service"

Write-Host "=== Complete MCP Backend Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Docker
Write-Host "Step 1: Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Step 2: Check AWS CLI
Write-Host ""
Write-Host "Step 2: Checking AWS CLI..." -ForegroundColor Yellow
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

# Step 3: Login to ECR
Write-Host ""
Write-Host "Step 3: Logging into ECR..." -ForegroundColor Yellow
try {
    aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $ecrRepo 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ ECR login successful" -ForegroundColor Green
    } else {
        Write-Host "❌ ECR login failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ ECR login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Build Docker image
Write-Host ""
Write-Host "Step 4: Building Docker image..." -ForegroundColor Yellow
Write-Host "   This may take 5-10 minutes..." -ForegroundColor Gray

$dockerfilePath = "playwright_service\Dockerfile"
if (-not (Test-Path $dockerfilePath)) {
    Write-Host "❌ Dockerfile not found at: $dockerfilePath" -ForegroundColor Red
    exit 1
}

try {
    Set-Location playwright_service
    docker build -t "${ecrRepo}:${imageTag}" -t "${ecrRepo}:$(Get-Date -Format 'yyyyMMdd-HHmmss')" . 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker image built successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Docker build failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
} catch {
    Write-Host "❌ Docker build failed: $($_.Exception.Message)" -ForegroundColor Red
    Set-Location ..
    exit 1
}

# Step 5: Push image to ECR
Write-Host ""
Write-Host "Step 5: Pushing image to ECR..." -ForegroundColor Yellow
Write-Host "   This may take a few minutes..." -ForegroundColor Gray

try {
    docker push "${ecrRepo}:${imageTag}" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Image pushed successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Image push failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Image push failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 6: Create new task definition revision
Write-Host ""
Write-Host "Step 6: Creating new task definition revision..." -ForegroundColor Yellow

$tempTaskDefFile = "temp-task-def-$([System.Guid]::NewGuid().ToString('N')).json"

try {
    # Get current task definition
    $currentService = aws ecs describe-services --cluster $cluster --services $serviceName --region $region --output json | ConvertFrom-Json
    $currentTaskDefArn = $currentService.services[0].taskDefinition
    Write-Host "   Current task definition: $currentTaskDefArn" -ForegroundColor Gray
    
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
    
    Write-Host "   Creating new revision..." -ForegroundColor Gray
    
    # Register new revision
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
    Write-Host "Error details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    if (Test-Path $tempTaskDefFile) {
        Write-Host "Saved JSON file for debugging: $tempTaskDefFile" -ForegroundColor Gray
    }
    exit 1
} finally {
    Remove-Item $tempTaskDefFile -ErrorAction SilentlyContinue
}

# Step 7: Update ECS service
Write-Host ""
Write-Host "Step 7: Updating ECS service..." -ForegroundColor Yellow

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
    exit 1
}

# Success summary
Write-Host ""
Write-Host "=== Deployment Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  ✅ Docker image built (with MCP code)" -ForegroundColor Green
Write-Host "  ✅ Image pushed to ECR" -ForegroundColor Green
Write-Host "  ✅ New task definition created (revision $newRevision)" -ForegroundColor Green
Write-Host "  ✅ ECS service update initiated" -ForegroundColor Green
Write-Host ""
Write-Host "The service will now:" -ForegroundColor Cyan
Write-Host "  1. Pull the latest Docker image from ECR" -ForegroundColor White
Write-Host "  2. Start new tasks with the MCP endpoint at /mcp" -ForegroundColor White
Write-Host "  3. Gradually replace old tasks" -ForegroundColor White
Write-Host "  4. Complete deployment in 5-10 minutes" -ForegroundColor White
Write-Host ""
Write-Host "Monitor deployment progress:" -ForegroundColor Yellow
Write-Host "  aws ecs describe-services --cluster $cluster --services $serviceName --region $region" -ForegroundColor Gray
Write-Host ""
Write-Host "Get the new backend URL:" -ForegroundColor Yellow
Write-Host "  aws ecs list-tasks --cluster $cluster --region $region" -ForegroundColor Gray
Write-Host ""
Write-Host "After deployment completes, test MCP endpoint:" -ForegroundColor Green
Write-Host "  `$body = @{ jsonrpc = '2.0'; id = 1; method = 'ping' } | ConvertTo-Json" -ForegroundColor Gray
Write-Host "  Invoke-RestMethod -Uri 'http://NEW_IP:3000/mcp' -Method POST -Body `$body -ContentType 'application/json'" -ForegroundColor Gray
Write-Host ""
Write-Host "Expected response: {'jsonrpc':'2.0','id':1,'result':'pong'}" -ForegroundColor Cyan
Write-Host ""

