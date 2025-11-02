# Set OpenAI API Key in ECS Task Definition
# This script updates the ECS task definition to include OPENAI_API_KEY environment variable

param(
    [Parameter(Mandatory=$true)]
    [string]$OpenAIKey,
    
    [string]$Region = "us-east-1",
    [string]$Cluster = "tooltip-companion-cluster",
    [string]$Service = "tooltip-companion-backend-service",
    [string]$TaskDefFamily = "tooltip-companion-backend"
)

Write-Host "=== Setting OpenAI API Key in ECS ===" -ForegroundColor Cyan
Write-Host ""

# Validate key format
if (-not $OpenAIKey.StartsWith('sk-')) {
    Write-Host "⚠️  Warning: OpenAI key should start with 'sk-'" -ForegroundColor Yellow
    $confirm = Read-Host "Continue anyway? (y/N)"
    if ($confirm -ne 'y') {
        exit 1
    }
}

# Step 1: Get current task definition
Write-Host "Step 1: Getting current task definition..." -ForegroundColor Yellow
try {
    $currentTaskDef = aws ecs describe-task-definition --task-definition $TaskDefFamily --region $Region --output json 2>&1 | ConvertFrom-Json
    if (-not $currentTaskDef) {
        Write-Host "❌ Could not get current task definition" -ForegroundColor Red
        exit 1
    }
    
    $taskDef = $currentTaskDef.taskDefinition
    Write-Host "✅ Current task definition version: $($taskDef.revision)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error getting task definition: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Update environment variables
Write-Host ""
Write-Host "Step 2: Updating environment variables..." -ForegroundColor Yellow

$containerDef = $taskDef.containerDefinitions[0]

# Initialize environment array if it doesn't exist
if (-not $containerDef.environment) {
    $containerDef.environment = @()
}

# Check if OPENAI_API_KEY already exists
$existingKey = $containerDef.environment | Where-Object { $_.name -eq 'OPENAI_API_KEY' }
if ($existingKey) {
    Write-Host "⚠️  OPENAI_API_KEY already exists, updating value..." -ForegroundColor Yellow
    $existingKey.value = $OpenAIKey
} else {
    Write-Host "➕ Adding OPENAI_API_KEY environment variable..." -ForegroundColor Green
    # Convert to array if it's a single object
    if ($containerDef.environment -is [PSCustomObject]) {
        $containerDef.environment = @($containerDef.environment)
    }
    $containerDef.environment += @{
        name = "OPENAI_API_KEY"
        value = $OpenAIKey
    }
}

# Step 3: Create new task definition JSON
Write-Host ""
Write-Host "Step 3: Creating new task definition..." -ForegroundColor Yellow

$newTaskDef = @{
    family = $taskDef.family
    networkMode = $taskDef.networkMode
    requiresCompatibilities = $taskDef.requiresCompatibilities
    cpu = $taskDef.cpu
    memory = $taskDef.memory
    containerDefinitions = @($containerDef)
} | ConvertTo-Json -Depth 10

# Add optional fields if they exist
if ($taskDef.executionRoleArn) {
    $newTaskDefObj = $newTaskDef | ConvertFrom-Json
    $newTaskDefObj | Add-Member -MemberType NoteProperty -Name "executionRoleArn" -Value $taskDef.executionRoleArn -Force
    $newTaskDef = $newTaskDefObj | ConvertTo-Json -Depth 10
}

if ($taskDef.taskRoleArn) {
    $newTaskDefObj = $newTaskDef | ConvertFrom-Json
    $newTaskDefObj | Add-Member -MemberType NoteProperty -Name "taskRoleArn" -Value $taskDef.taskRoleArn -Force
    $newTaskDef = $newTaskDefObj | ConvertTo-Json -Depth 10
}

$taskDefFile = "task-def-with-openai.json"
$newTaskDef | Out-File -FilePath $taskDefFile -Encoding UTF8
Write-Host "✅ Task definition JSON saved to: $taskDefFile" -ForegroundColor Green

# Step 4: Register new task definition
Write-Host ""
Write-Host "Step 4: Registering new task definition..." -ForegroundColor Yellow

try {
    $registerOutput = aws ecs register-task-definition --cli-input-json "file://$taskDefFile" --region $Region --output json 2>&1 | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to register task definition" -ForegroundColor Red
        Write-Host $registerOutput -ForegroundColor Red
        exit 1
    }
    
    $newRevision = $registerOutput.taskDefinition.revision
    Write-Host "✅ New task definition registered: ${TaskDefFamily}:${newRevision}" -ForegroundColor Green
    Write-Host "   OPENAI_API_KEY environment variable added" -ForegroundColor Green
} catch {
    Write-Host "❌ Error registering task definition: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 5: Update service
Write-Host ""
Write-Host "Step 5: Updating service with new task definition..." -ForegroundColor Yellow

try {
    $updateOutput = aws ecs update-service `
        --cluster $Cluster `
        --service $Service `
        --task-definition "${TaskDefFamily}:${newRevision}" `
        --force-new-deployment `
        --region $Region `
        --output json 2>&1 | ConvertFrom-Json
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Service update initiated!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The service will:" -ForegroundColor Cyan
        Write-Host "  1. Deploy new tasks with OPENAI_API_KEY" -ForegroundColor White
        Write-Host "  2. Start using backend default key for chat" -ForegroundColor White
        Write-Host "  3. Complete in 5-10 minutes" -ForegroundColor White
        Write-Host ""
        Write-Host "Monitor deployment:" -ForegroundColor Yellow
        Write-Host "  aws ecs describe-services --cluster $Cluster --services $Service --region $Region" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Could not update service automatically" -ForegroundColor Yellow
        Write-Host "   Please update manually:" -ForegroundColor Yellow
        Write-Host "   aws ecs update-service --cluster $Cluster --service $Service --task-definition ${TaskDefFamily}:${newRevision} --region $Region" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Could not update service: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   Task definition registered. Please update service manually in AWS Console." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "✅ OpenAI API key added to task definition" -ForegroundColor Green
Write-Host "✅ Service deployment initiated" -ForegroundColor Green
Write-Host ""
Write-Host "After deployment, users won't need to enter their own OpenAI key!" -ForegroundColor Green
Write-Host "Chat will work automatically using the backend's default key." -ForegroundColor Green
Write-Host ""

