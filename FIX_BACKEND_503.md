# Fix Backend 503 Service Temporarily Unavailable

## 🚨 Issue
Backend is returning `503 Service Temporarily Unavailable`. This usually means:
- Backend crashed on startup
- ECS task is not running
- Container health check is failing

## ✅ Quick Fix Steps

### Step 1: Check Backend Status

Run the diagnostic script:
```powershell
.\check-backend-logs.ps1
```

This will show:
- ✅ Is the task running?
- ✅ What are the recent errors?
- ✅ Can we reach the /capture endpoint?

### Step 2: Check if Task is Running

```powershell
aws ecs list-tasks --cluster tooltip-companion-cluster --region us-east-1
```

If no tasks are running, the backend crashed. Continue to Step 3.

### Step 3: View Recent Logs

```powershell
aws logs tail /ecs/tooltip-companion-backend --region us-east-1 --since 10m
```

Look for:
- ❌ `Failed to create screenshot directory` - File system permission issue
- ❌ `EACCES` or `ENOENT` - File system error
- ❌ `Cannot find module` - Missing npm packages
- ❌ `Out of memory` - Container needs more memory

### Step 4: Restart the Service

If the task crashed:

```powershell
# Force new deployment (restarts service)
aws ecs update-service \
  --cluster tooltip-companion-cluster \
  --service tooltip-companion-backend \
  --force-new-deployment \
  --region us-east-1
```

### Step 5: Check Health Endpoint

Wait 30 seconds, then test:
```bash
curl https://backend.tooltipcompanion.com/health
```

Expected: `{"status":"healthy",...}`

## 🔧 Common Causes & Fixes

### 1. Screenshot Directory Creation Failed

**Symptom:** `Failed to create screenshot directory` in logs

**Fix:** The code now handles this gracefully - it will fall back to base64 encoding if disk storage fails. If it's still crashing, check:

```powershell
# Check ECS task definition - ensure /tmp is writable
aws ecs describe-task-definition \
  --task-definition tooltip-companion-backend \
  --region us-east-1 \
  --query 'taskDefinition.containerDefinitions[0].mountPoints'
```

**Solution:** The updated code now won't crash if directory creation fails - it falls back to base64.

### 2. Container Out of Memory

**Symptom:** Task keeps restarting, logs show `Out of memory`

**Fix:** Increase memory in task definition:

```powershell
# Check current memory
aws ecs describe-task-definition \
  --task-definition tooltip-companion-backend \
  --region us-east-1 \
  --query 'taskDefinition.containerDefinitions[0].memory'

# Update if needed (minimum 512MB, recommended 1024MB)
```

### 3. Missing Environment Variables

**Symptom:** `process.env.PORT is undefined` or similar

**Fix:** Check task definition has required env vars:
- `PORT=3000`
- `OPENAI_API_KEY` (optional but recommended)

### 4. Docker Image Issues

**Symptom:** `Cannot find module` errors

**Fix:** Rebuild and redeploy:

```powershell
.\deploy-backend.ps1
```

## 📊 Health Check Endpoint

Once backend is running, test:
```bash
curl https://backend.tooltipcompanion.com/health
```

Should return:
```json
{
  "status": "healthy",
  "browser": "initialized",
  "cache": {
    "screenshots": 0,
    "analysis": 0
  }
}
```

## 🆘 If Still Not Working

1. **Check ALB Health Checks:**
   ```powershell
   aws elbv2 describe-target-health \
     --target-group-arn <your-target-group-arn> \
     --region us-east-1
   ```

2. **Check Security Groups:**
   - ALB → ECS: Port 3000 must be allowed
   - ECS → Internet: For Playwright browser

3. **Restart Everything:**
   ```powershell
   # Stop service
   aws ecs update-service \
     --cluster tooltip-companion-cluster \
     --service tooltip-companion-backend \
     --desired-count 0 \
     --region us-east-1
   
   # Wait 30 seconds
   Start-Sleep -Seconds 30
   
   # Start service
   aws ecs update-service \
     --cluster tooltip-companion-cluster \
     --service tooltip-companion-backend \
     --desired-count 1 \
     --region us-east-1
   ```

## ✅ Code Updates Made

I've updated the code to be more resilient:
- ✅ Screenshot directory creation won't crash the server
- ✅ Falls back to base64 encoding if disk storage fails
- ✅ Better error handling for file system operations

**Next Step:** Run `.\check-backend-logs.ps1` to see what the actual error is.

