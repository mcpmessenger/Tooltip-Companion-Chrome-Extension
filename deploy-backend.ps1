# Deploy Backend to AWS ECS
# Builds Docker image and pushes to ECR, then forces new deployment

$region = "us-east-1"
$cluster = "tooltip-companion-cluster"
$ecrRepo = "396608803476.dkr.ecr.us-east-1.amazonaws.com/tooltip-companion-backend"
$imageTag = "latest"
$taskDefFamily = "tooltip-companion-backend"

Write-Host "=== Deploying Backend to AWS ECS ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Docker is installed
Write-Host "Step 1: Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Step 2: Check AWS CLI is configured
Write-Host ""
Write-Host "Step 2: Checking AWS CLI configuration..." -ForegroundColor Yellow
try {
    $awsAccount = aws sts get-caller-identity --region $region --output json 2>&1 | ConvertFrom-Json
    if ($awsAccount.Account) {
        Write-Host "✅ AWS CLI configured. Account: $($awsAccount.Account)" -ForegroundColor Green
    } else {
        Write-Host "❌ AWS CLI not configured. Please run: aws configure" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ AWS CLI not configured or no permissions. Please run: aws configure" -ForegroundColor Red
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
Write-Host "   This may take a few minutes..." -ForegroundColor Gray

$dockerfilePath = "playwright_service\Dockerfile"
if (-not (Test-Path $dockerfilePath)) {
    Write-Host "❌ Dockerfile not found at: $dockerfilePath" -ForegroundColor Red
    exit 1
}

try {
    Set-Location playwright_service
    docker build -t "${ecrRepo}:${imageTag}" -t "${ecrRepo}:$(Get-Date -Format 'yyyyMMdd-HHmmss')" . 2>&1 | Write-Host
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
    docker push "${ecrRepo}:${imageTag}" 2>&1 | Write-Host
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

# Step 6: Find service name
Write-Host ""
Write-Host "Step 6: Finding ECS service..." -ForegroundColor Yellow

try {
    $services = aws ecs list-services --cluster $cluster --region $region --output json 2>&1 | ConvertFrom-Json
    if ($services.serviceArns.Count -eq 0) {
        Write-Host "⚠️  No services found in cluster" -ForegroundColor Yellow
        Write-Host "   Deployment complete, but no service to update" -ForegroundColor Yellow
        exit 0
    }
    
    # Try to find service matching our task definition
    $serviceName = $null
    foreach ($serviceArn in $services.serviceArns) {
        $svcName = $serviceArn.Split('/')[-1]
        $serviceInfo = aws ecs describe-services --cluster $cluster --services $svcName --region $region --output json 2>&1 | ConvertFrom-Json
        if ($serviceInfo.services[0].taskDefinition -like "*$taskDefFamily*") {
            $serviceName = $svcName
            Write-Host "✅ Found service: $serviceName" -ForegroundColor Green
            break
        }
    }
    
    if (-not $serviceName) {
        Write-Host "⚠️  Could not find service using $taskDefFamily" -ForegroundColor Yellow
        Write-Host "   Image pushed, but service update skipped" -ForegroundColor Yellow
        exit 0
    }
} catch {
    Write-Host "⚠️  Could not find service: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   Image pushed, but service update skipped" -ForegroundColor Yellow
    exit 0
}

# Step 7: Force new deployment
Write-Host ""
Write-Host "Step 7: Forcing new deployment..." -ForegroundColor Yellow

try {
    $updateOutput = aws ecs update-service `
        --cluster $cluster `
        --service $serviceName `
        --force-new-deployment `
        --region $region `
        --output json 2>&1 | ConvertFrom-Json
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Deployment initiated!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The service will now:" -ForegroundColor Cyan
        Write-Host "  1. Pull the new Docker image" -ForegroundColor White
        Write-Host "  2. Start new tasks with updated code" -ForegroundColor White
        Write-Host "  3. Gradually replace old tasks" -ForegroundColor White
        Write-Host "  4. Complete in 5-10 minutes" -ForegroundColor White
        Write-Host ""
        Write-Host "Monitor deployment:" -ForegroundColor Yellow
        Write-Host "  aws ecs describe-services --cluster $cluster --services $serviceName --region $region" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Check task status:" -ForegroundColor Yellow
        Write-Host "  aws ecs list-tasks --cluster $cluster --region $region" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Could not force deployment automatically" -ForegroundColor Yellow
        Write-Host "   Please update service manually:" -ForegroundColor Yellow
        Write-Host "   aws ecs update-service --cluster $cluster --service $serviceName --force-new-deployment --region $region" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Could not force deployment: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   Image pushed successfully. Please update service manually in AWS Console." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Deployment Summary ===" -ForegroundColor Cyan
Write-Host "✅ Docker image built" -ForegroundColor Green
Write-Host "✅ Image pushed to ECR" -ForegroundColor Green
if ($serviceName) {
    Write-Host "✅ Service deployment initiated" -ForegroundColor Green
}
Write-Host ""
Write-Host "Backend updates deployed! New code includes:" -ForegroundColor Cyan
Write-Host "  • Improved timeout handling (25s timeout, HTTP 504 for timeouts)" -ForegroundColor White
Write-Host "  • OCR processing with Tesseract.js" -ForegroundColor White
Write-Host "  • OpenAI chat integration (when API key provided)" -ForegroundColor White
Write-Host "  • Better error handling and messages" -ForegroundColor White
Write-Host ""




