# Step-by-Step Guide to Fix Backend 502 Errors

**Created:** Based on your 502 Bad Gateway errors  
**Goal:** Get your backend working again

## Quick Start

I've created a diagnostic script for you. Here's how to use it:

### Option 1: Run the Diagnostic Script (Recommended)

1. **Open PowerShell** (as Administrator if possible)

2. **Navigate to your project:**
   ```powershell
   cd "C:\Users\senti\OneDrive\Desktop\Tooltip Companion Extension"
   ```

3. **Run the diagnostic script:**
   ```powershell
   .\diagnose-and-fix-502.ps1
   ```

The script will:
- ✅ Check backend health
- ✅ Verify ECS tasks are running
- ✅ Check recent logs for errors
- ✅ Offer to automatically restart the service if needed
- ✅ Wait for the backend to come back online

### Option 2: Manual Steps

If you prefer to do it manually, follow these steps:

---

## Step 1: Check Backend Health

**Test if backend is responding:**
```powershell
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/health" -Method GET
```

**Expected:** JSON response with `"status": "healthy"`  
**If 502:** Backend is down - proceed to Step 2

---

## Step 2: Check ECS Task Status

**List running tasks:**
```powershell
aws ecs list-tasks --cluster tooltip-companion-cluster --service-name tooltip-companion-backend-service --region us-east-1
```

**Check task details:**
```powershell
# Replace <TASK-ARN> with task ID from above
aws ecs describe-tasks --cluster tooltip-companion-cluster --tasks <TASK-ARN> --region us-east-1
```

**What to look for:**
- ✅ `lastStatus: "RUNNING"`
- ✅ `healthStatus: "HEALTHY"`
- ❌ If `STOPPED` or `UNHEALTHY` → Task needs restart

---

## Step 3: Check Recent Logs

**View recent errors:**
```powershell
aws logs tail /ecs/tooltip-companion-backend --region us-east-1 --since 30m
```

**Or use the existing script:**
```powershell
.\check-backend-logs.ps1
```

**Look for:**
- Out of memory errors
- Playwright crashes
- Connection refused errors
- Application startup failures

---

## Step 4: Restart the Service

**If tasks are stopped or unhealthy, restart:**

**Option A: Use existing script (easiest):**
```powershell
.\restart-backend-alb.ps1
```

**Option B: Manual restart:**
```powershell
aws ecs update-service `
  --cluster tooltip-companion-cluster `
  --service tooltip-companion-backend-service `
  --force-new-deployment `
  --region us-east-1
```

**Option C: Via AWS Console:**
1. Go to AWS Console → ECS
2. Navigate to: Clusters → `tooltip-companion-cluster` → Services → `tooltip-companion-backend-service`
3. Click "Update"
4. Check "Force new deployment"
5. Click "Update"

---

## Step 5: Wait for Recovery

**After restart, wait 1-2 minutes, then test:**
```powershell
# Test health endpoint
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/health" -Method GET

# Test context endpoint
$body = @{ url = "https://example.com" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/context" -Method POST -Body $body -ContentType "application/json"
```

**Expected:** Successful responses with screenshot data

---

## Step 6: Test Extension

1. **Reload extension in Chrome:**
   - Go to `chrome://extensions/`
   - Find "Tooltip Companion"
   - Click reload button (🔄)

2. **Test on a webpage:**
   - Visit any website
   - Hover over a link
   - Check browser console (F12) for errors

3. **Look for:**
   - ✅ Successful context fetches
   - ✅ Screenshot images loading
   - ❌ No more 502 errors

---

## Common Issues & Solutions

### Issue: Tasks Keep Stopping

**Possible causes:**
- Out of memory (OOM)
- Application crash
- Health check failures

**Solutions:**
1. Check logs for OOM errors
2. Increase task memory (recommended: 4GB)
3. Check health check configuration

### Issue: ALB Returns 502 but Tasks Are Running

**Possible causes:**
- Security group blocking traffic
- Health check failing
- Wrong port configured

**Solutions:**
1. Verify ALB target group health in AWS Console
2. Check security groups allow ALB → ECS traffic
3. Verify health check path: `/health`
4. Verify health check port: `3000`

### Issue: Backend Starts but Crashes Quickly

**Possible causes:**
- Playwright not installed in Docker image
- Missing dependencies
- Environment variables not set

**Solutions:**
1. Check Docker image includes Playwright
2. Review task definition for required env vars
3. Check logs for specific error messages

---

## Verification Checklist

After fixing, verify:

- [ ] Health endpoint returns `200 OK`
- [ ] Context endpoint returns screenshot + analysis
- [ ] ECS tasks show `RUNNING` and `HEALTHY`
- [ ] No 502 errors in extension console
- [ ] Screenshots display in tooltips
- [ ] Recent logs show no errors

---

## Getting Help

If issues persist:

1. **Check logs for specific errors:**
   ```powershell
   aws logs tail /ecs/tooltip-companion-backend --region us-east-1 --follow
   ```

2. **Check ALB target health:**
   - AWS Console → EC2 → Target Groups
   - Find target group for backend
   - Check health status of targets

3. **Review task definition:**
   ```powershell
   aws ecs describe-task-definition --task-definition tooltip-companion-backend --region us-east-1
   ```

---

## Quick Reference Commands

```powershell
# Check health
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/health" -Method GET

# List tasks
aws ecs list-tasks --cluster tooltip-companion-cluster --service-name tooltip-companion-backend-service --region us-east-1

# Restart service
aws ecs update-service --cluster tooltip-companion-cluster --service tooltip-companion-backend-service --force-new-deployment --region us-east-1

# View logs
aws logs tail /ecs/tooltip-companion-backend --region us-east-1 --follow

# Run diagnostic script
.\diagnose-and-fix-502.ps1
```

---

**Status:** ✅ Diagnostic script ready  
**Next:** Run `.\diagnose-and-fix-502.ps1` to get started!

