# Fix 502 Bad Gateway Error

## 🚨 Issue
Backend is returning `502 Bad Gateway`. This means the ALB (Application Load Balancer) can't properly communicate with the backend service.

## 🔍 Root Cause Analysis

**Task Status: ACTIVATING**
- The ECS task is in `ACTIVATING` state, which means it's still starting up
- During startup, the ALB health checks might fail, causing 502 errors
- Once the task reaches `RUNNING` and passes health checks, 502 errors should stop

## ✅ Solutions

### Solution 1: Wait for Task to Start (Usually 1-2 minutes)

The task needs to:
1. Start the container
2. Initialize Playwright browser
3. Pass ALB health checks

**Check status:**
```powershell
.\check-backend-logs.ps1
```

**Or manually check:**
```powershell
aws ecs list-tasks --cluster tooltip-companion-cluster --region us-east-1
```

### Solution 2: Force New Deployment (If Task Stuck)

If the task stays in ACTIVATING for more than 5 minutes:

```powershell
aws ecs update-service `
  --cluster tooltip-companion-cluster `
  --service tooltip-companion-backend `
  --force-new-deployment `
  --region us-east-1
```

### Solution 3: Check ALB Target Health

```powershell
# Get target group ARN from ALB
$targetGroups = aws elbv2 describe-target-groups --region us-east-1 --output json | ConvertFrom-Json
$targetGroupArn = ($targetGroups.TargetGroups | Where-Object { $_.TargetGroupName -like "*tooltip*" }).TargetGroupArn

# Check health
aws elbv2 describe-target-health `
  --target-group-arn $targetGroupArn `
  --region us-east-1
```

**Expected:** Targets should show `healthy` state

### Solution 4: Check Health Check Configuration

The ALB health check should:
- Path: `/health`
- Protocol: HTTP
- Port: 3000 (or container port)
- Interval: 30 seconds
- Timeout: 5 seconds
- Healthy threshold: 2
- Unhealthy threshold: 3

## 🔧 Code Improvements Made

I've improved the `/screenshot/:token` endpoint to:
- ✅ Better error handling (won't crash on missing files)
- ✅ Proper 404 responses (instead of hanging)
- ✅ Logging for debugging
- ✅ Graceful handling of file system errors

## 📊 Verify Backend is Working

Once task shows `RUNNING`:

```powershell
# Test health
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/health" -Method GET

# Test /context endpoint
$body = @{url="https://example.com"} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/context" -Method POST -Body $body -ContentType "application/json"
```

## 🆘 If 502 Persists After 5 Minutes

1. **Check CloudWatch Logs:**
   ```powershell
   aws logs tail /ecs/tooltip-companion-backend --region us-east-1 --follow
   ```

2. **Check for Errors:**
   - Look for "Error" or "Exception" in logs
   - Check if Playwright browser initializes
   - Verify screenshot directory creation

3. **Check Security Groups:**
   - ALB security group must allow inbound on port 443
   - ECS security group must allow inbound from ALB on port 3000
   - ECS security group must allow outbound for Playwright

4. **Restart Service:**
   ```powershell
   # Scale down
   aws ecs update-service `
     --cluster tooltip-companion-cluster `
     --service tooltip-companion-backend `
     --desired-count 0 `
     --region us-east-1
   
   # Wait 30 seconds
   Start-Sleep -Seconds 30
   
   # Scale up
   aws ecs update-service `
     --cluster tooltip-companion-cluster `
     --service tooltip-companion-backend `
     --desired-count 1 `
     --region us-east-1
   ```

## ✅ Expected Behavior

After task starts:
- Task status: `RUNNING`
- Health status: `HEALTHY` (after passing health checks)
- `/health` endpoint: Returns `{"status":"healthy",...}`
- `/context` endpoint: Works normally
- 502 errors: Stop occurring

---

**Status:** ⏳ Task is ACTIVATING - waiting for startup to complete  
**Action:** Wait 1-2 minutes, then test again. If 502 persists, check logs and ALB target health.

