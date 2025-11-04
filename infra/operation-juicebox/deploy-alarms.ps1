# Deploy CloudWatch Alarms for Operation Juicebox Phase 1
# Queries ECS service to get ALB/TargetGroup dimensions, then deploys alarms

$region = "us-east-1"
$cluster = "tooltip-companion-cluster"
$taskDefFamily = "tooltip-companion-backend"

Write-Host "=== Operation Juicebox: Deploying CloudWatch Alarms ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check AWS CLI
Write-Host "Step 1: Checking AWS CLI..." -ForegroundColor Yellow
try {
    $awsAccount = aws sts get-caller-identity --region $region --output json 2>&1 | ConvertFrom-Json
    if ($awsAccount.Account) {
        Write-Host "✅ AWS CLI configured. Account: $($awsAccount.Account)" -ForegroundColor Green
    } else {
        Write-Host "❌ AWS CLI not configured" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ AWS CLI not configured: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Find ECS service
Write-Host ""
Write-Host "Step 2: Finding ECS service..." -ForegroundColor Yellow

try {
    $services = aws ecs list-services --cluster $cluster --region $region --output json 2>&1 | ConvertFrom-Json
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
        Write-Host "❌ Could not find ECS service" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error finding service: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Get load balancer info
Write-Host ""
Write-Host "Step 3: Getting load balancer information..." -ForegroundColor Yellow

try {
    $serviceDetails = aws ecs describe-services --cluster $cluster --services $serviceName --region $region --output json 2>&1 | ConvertFrom-Json
    $loadBalancers = $serviceDetails.services[0].loadBalancers
    
    if ($loadBalancers.Count -eq 0) {
        Write-Host "⚠️  No load balancer found for service" -ForegroundColor Yellow
        Write-Host "   Will deploy alarms without ALB dimensions" -ForegroundColor Yellow
        $targetGroupArn = $null
        $albArn = $null
    } else {
        $targetGroupArn = $loadBalancers[0].targetGroupArn
        Write-Host "✅ Found target group: $($targetGroupArn.Split('/')[-1])" -ForegroundColor Green
        
        # Get ALB ARN from target group
        $tgDetails = aws elbv2 describe-target-groups --target-group-arns $targetGroupArn --region $region --output json 2>&1 | ConvertFrom-Json
        $albArn = $tgDetails.TargetGroups[0].LoadBalancerArns[0]
        $albName = $albArn.Split('/')[-1]
        Write-Host "✅ Found ALB: $albName" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Could not get load balancer info: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   Will deploy alarms without ALB dimensions" -ForegroundColor Yellow
    $targetGroupArn = $null
    $albArn = $null
}

# Step 4: Create/update CloudFormation stack
Write-Host ""
Write-Host "Step 4: Deploying CloudWatch alarms..." -ForegroundColor Yellow

$stackName = "operation-juicebox-alarms"

# Prepare template with actual values
$templatePath = Join-Path $PSScriptRoot "cloudwatch-alarms.yml"
$tempTemplate = Join-Path $env:TEMP "cloudwatch-alarms-filled.yml"

if ($albArn -and $targetGroupArn) {
    $templateContent = Get-Content $templatePath -Raw
    $templateContent = $templateContent -replace '<TODO:ALB-METRIC-DIMENSION>', $albArn.Split('/')[-1]
    $templateContent = $templateContent -replace '<TODO:TARGET-GROUP-DIMENSION>', $targetGroupArn.Split('/')[-1]
    $templateContent | Set-Content $tempTemplate
    Write-Host "✅ Template prepared with ALB dimensions" -ForegroundColor Green
} else {
    Copy-Item $templatePath $tempTemplate
    Write-Host "⚠️  Template prepared without ALB dimensions (manual update needed)" -ForegroundColor Yellow
}

try {
    # Check if stack exists
    $stackExists = aws cloudformation describe-stacks --stack-name $stackName --region $region 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Updating existing stack..." -ForegroundColor Gray
        aws cloudformation update-stack `
            --stack-name $stackName `
            --template-body file://$tempTemplate `
            --parameters ParameterKey=ClusterName,ParameterValue=$cluster ParameterKey=ServiceName,ParameterValue=$serviceName ParameterKey=AlarmTopicArn,ParameterValue="" `
            --region $region `
            --capabilities CAPABILITY_IAM 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Stack update initiated" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Stack may already be up to date, or update failed" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   Creating new stack..." -ForegroundColor Gray
        aws cloudformation create-stack `
            --stack-name $stackName `
            --template-body file://$tempTemplate `
            --parameters ParameterKey=ClusterName,ParameterValue=$cluster ParameterKey=ServiceName,ParameterValue=$serviceName ParameterKey=AlarmTopicArn,ParameterValue="" `
            --region $region `
            --capabilities CAPABILITY_IAM 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Stack creation initiated" -ForegroundColor Green
        } else {
            Write-Host "❌ Stack creation failed" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "❌ CloudFormation operation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if (Test-Path $tempTemplate) {
        Remove-Item $tempTemplate
    }
}

Write-Host ""
Write-Host "=== Alarm Deployment Summary ===" -ForegroundColor Cyan
Write-Host "✅ CloudWatch alarms deployed/updated" -ForegroundColor Green
Write-Host ""
Write-Host "Alarms created:" -ForegroundColor Yellow
Write-Host "  • CPU Utilization > 80% (ojx-$cluster-$serviceName-cpu-high)" -ForegroundColor White
Write-Host "  • Memory Utilization > 80% (ojx-$cluster-$serviceName-memory-high)" -ForegroundColor White
if ($albArn) {
    Write-Host "  • 5XX Error Rate >= 5/min (ojx-$cluster-$serviceName-5xx-rate)" -ForegroundColor White
    Write-Host "  • Healthy Hosts < 1 (ojx-$cluster-$serviceName-target-health)" -ForegroundColor White
} else {
    Write-Host "  ⚠️  ALB alarms need manual dimension update" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Monitor alarms:" -ForegroundColor Yellow
Write-Host "  aws cloudwatch describe-alarms --alarm-name-prefix ojx-$cluster-$serviceName --region $region" -ForegroundColor Gray
Write-Host ""
Write-Host "View in console:" -ForegroundColor Yellow
Write-Host "  https://console.aws.amazon.com/cloudwatch/home?region=$region#alarmsV2:" -ForegroundColor Gray
Write-Host ""

