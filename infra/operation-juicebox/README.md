# Operation Juicebox Infrastructure Scaffolding

This directory contains infrastructure-as-code (IaC) scaffolding and operational runbooks that support Operation Juicebox.

## Contents

- `cloudwatch-alarms.yml` — CloudFormation template for ECS health, CPU, memory, and 5XX alarms
- `deploy-alarms.ps1` — PowerShell script to automatically deploy CloudWatch alarms (queries ECS to get ALB/TargetGroup)
- `review-ecs-capacity.ps1` — PowerShell script to review ECS capacity against Operation Juicebox recommendations
- `log-metrics-queries.md` — Sample CloudWatch Logs Insights queries for structured JSON logs
- `ecs-capacity-checklist.md` — Manual checklist for reviewing task sizing and scaling policies

## Quick Start

### Deploy CloudWatch Alarms

```powershell
cd infra/operation-juicebox
.\deploy-alarms.ps1
```

This script will:
1. Find your ECS service automatically
2. Query ALB and Target Group dimensions
3. Deploy CloudWatch alarms via CloudFormation

**Alarms created:**
- CPU Utilization > 80% (3 eval periods, 2 datapoints to alarm)
- Memory Utilization > 80% (3 eval periods, 2 datapoints to alarm)
- 5XX Error Rate >= 5/min (5 eval periods, 3 datapoints to alarm)
- Healthy Host Count < 1 (immediate alarm)

### Review ECS Capacity

```powershell
cd infra/operation-juicebox
.\review-ecs-capacity.ps1
```

This script will:
1. Analyze your current ECS task definition
2. Check service scaling configuration
3. Verify platform setup (load balancer, security groups)
4. Review instrumentation (CloudWatch Logs, alarms)

**Recommendations checked:**
- Memory >= 4096 MiB for Playwright workloads
- CPU >= 2048 units
- Desired count >= 2 for zero-downtime deployments
- Health check grace period >= 60s
- CloudWatch Logs retention >= 14 days

## Manual Deployment

If you prefer manual deployment:

1. Edit `cloudwatch-alarms.yml` and replace `<TODO:ALB-METRIC-DIMENSION>` and `<TODO:TARGET-GROUP-DIMENSION>` with actual values
2. Deploy via CloudFormation:
   ```bash
   aws cloudformation create-stack \
     --stack-name operation-juicebox-alarms \
     --template-body file://cloudwatch-alarms.yml \
     --parameters ParameterKey=ClusterName,ParameterValue=tooltip-companion-cluster \
                   ParameterKey=ServiceName,ParameterValue=tooltip-companion-backend-service \
     --region us-east-1
   ```

> **Note:** These scripts require AWS CLI configured with appropriate permissions (ECS, ELB, CloudWatch, CloudFormation).


