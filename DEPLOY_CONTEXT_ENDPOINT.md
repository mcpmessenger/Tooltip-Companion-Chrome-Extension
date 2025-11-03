# Deploy /context Endpoint to Production Backend

## 🚨 Issue

The frontend is trying to use the new `/context` endpoint, but it's returning `404 - Endpoint POST /context not found`. This means the backend hasn't been deployed with the updated code yet.

## ✅ Solution: Deploy Updated Backend

The `/context` endpoint code is already written in `playwright_service/server.js`. You just need to deploy it.

## Quick Deploy Steps

### Option 1: Use Existing Deploy Script (Recommended)

```powershell
# Run the existing deployment script
.\deploy-backend.ps1
```

This script will:
1. Build a Docker image with the updated code
2. Push to ECR
3. Force ECS to redeploy with the new image

### Option 2: Manual ECS Update

If you need to update just the task definition:

```powershell
# 1. Build and push Docker image
cd playwright_service
docker build -t tooltip-companion-backend .
docker tag tooltip-companion-backend:latest 396608803476.dkr.ecr.us-east-1.amazonaws.com/tooltip-companion-backend:latest

# 2. Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 396608803476.dkr.ecr.us-east-1.amazonaws.com

# 3. Push image
docker push 396608803476.dkr.ecr.us-east-1.amazonaws.com/tooltip-companion-backend:latest

# 4. Force new deployment
aws ecs update-service --cluster tooltip-companion-cluster --service tooltip-companion-backend --force-new-deployment --region us-east-1
```

## ✅ What Gets Deployed

The new backend includes:
- ✅ `/context` endpoint - Returns screenshot + analysis in one call
- ✅ `/screenshot/:token` endpoint - Serves screenshot files (signed URLs)
- ✅ File-based screenshot storage (saves to disk, not memory)
- ✅ Automatic cleanup of old screenshots

## 🧪 Verify Deployment

After deploying, test the endpoint:

```bash
curl -X POST https://backend.tooltipcompanion.com/context \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Expected response:
```json
{
  "url": "https://example.com",
  "screenshot": "/screenshot/abc123...",
  "screenshotUrl": "/screenshot/abc123...",
  "analysis": {
    "pageType": "unknown",
    "keyTopics": [],
    "suggestedActions": [],
    "confidence": 0
  },
  "text": "...",
  "cached": false,
  "timestamp": "2025-01-XX..."
}
```

## 🔄 Fallback Behavior

The frontend now has **automatic fallback**:
- If `/context` returns 404 → Falls back to `/capture` + `/analyze`
- Extension will still work, just slightly slower (2 requests instead of 1)
- Once backend is deployed, it will automatically use the faster `/context` endpoint

## 📝 Notes

- **Screenshot Storage**: The new backend saves screenshots to `/tmp/screenshots/` on the ECS container
- **Cleanup**: Old screenshots auto-delete after 5 minutes
- **Backward Compatible**: Old `/capture` endpoint still works
- **No Breaking Changes**: Frontend gracefully handles both old and new backend versions

---

**Status**: ⏳ Waiting for backend deployment  
**Action**: Run `.\deploy-backend.ps1` to deploy the new endpoint

