# Production Backend Service URL

## Current Backend URL

**Public IP Address (Direct Access):**
```
http://34.238.160.197:3000
```

**⚠️ Note:** IP addresses may change when tasks restart. Use a Load Balancer for a stable endpoint.

**Previous IP (deprecated):**
- ~~http://54.211.114.152:3000~~ (old task, no longer active)

## Service Status

- **Status**: ✅ Healthy and Running
- **Deployment**: AWS ECS Fargate
- **Cluster**: `tooltip-companion-cluster`
- **Region**: `us-east-1`
- **Port**: `3000`

## Verified Endpoints

- ✅ `GET /health` - Health check endpoint (working)
- ⚠️ `GET /` - Service information endpoint (returns 404 - not critical)
- ❌ `POST /capture` - Screenshot generation (**HTTP 500 Error - Backend issue**)
- ⚠️ `POST /ocr-upload` - OCR text extraction (not tested)
- ⚠️ `POST /chat` - AI chat with context (not tested)

### Known Issues

**Backend `/capture` endpoint is returning HTTP 500:**
- Health check works fine
- Screenshot capture fails with Internal Server Error
- This indicates a backend service problem, not an extension issue
- **Action Required**: Check backend logs and fix the `/capture` endpoint

## Important Notes

⚠️ **IP Address May Change**: This IP address is directly associated with the ECS Fargate task. If the task restarts or is recreated, the IP address may change.

### Recommendation

For production use, consider:
1. **Load Balancer**: Set up an Application Load Balancer (ALB) or Network Load Balancer (NLB) for a stable endpoint
2. **Route53 DNS**: Create a custom domain pointing to the load balancer
3. **HTTPS**: Configure SSL/TLS certificate for secure connections

## Testing the Backend

You can test the backend directly:

```powershell
# Health check
Invoke-WebRequest -Uri "http://54.211.114.152:3000/health" -Method GET

# Expected response:
# {"status":"healthy","timestamp":"...","uptime":...,"browser":"initialized","cache":{...}}
```

## Extension Configuration

To use this backend in the extension:

1. Open Chrome Extensions (`chrome://extensions/`)
2. Click "Options" on the Tooltip Companion extension
3. Enter the backend URL: `http://54.211.114.152:3000`
4. Click "Save Settings"

---

**Last Updated**: 2025-11-01
**Service**: tooltip-companion-cluster (1 active service, 1 running task)

