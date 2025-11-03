# Production Backend

## Current Backend URL

```
https://backend.tooltipcompanion.com
```

✅ **HTTPS working**  
✅ **Production ready**  
✅ **Stable DNS**  
✅ **All endpoints operational**

## Service Status

- **Status**: ✅ Healthy and Running
- **Deployment**: AWS ECS Fargate
- **Cluster**: `tooltip-companion-cluster`
- **Service**: `tooltip-companion-backend-service`
- **Region**: `us-east-1`
- **Port**: `3000`
- **Load Balancer**: ALB with HTTPS/SSL

## Backend Endpoints

### REST API
- `GET /health` - Health check ✅
- `POST /capture` - Screenshot generation ✅
- `POST /ocr-upload` - OCR text extraction ✅
- `POST /chat` - AI chat with context ✅

### Model Context Protocol (MCP)
- `POST /mcp` - JSON-RPC 2.0 endpoint ✅
  - `initialize` - Protocol handshake
  - `tools/list` - List available tools
  - `tools/call` - Call tools (capture_screenshot, chat, ocr_upload, analyze_page)
  - `resources/list` - List available resources

## Testing the Backend

```powershell
# Health check
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/health" -Method GET

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "...",
#   "uptime": ...,
#   "browser": "initialized",
#   "cache": {...},
#   "features": {...},
#   "config": {...}
# }
```

## Troubleshooting Scripts

If you encounter 502 errors:

```powershell
# Run diagnostic script
.\diagnose-and-fix-502.ps1

# Or restart backend
.\restart-backend-alb.ps1

# Check logs
.\check-backend-logs.ps1
```

## Deployment

To deploy updates to the backend:

```powershell
# Full deployment (builds and deploys)
.\deploy-backend.ps1

# Or complete MCP deployment
.\deploy-mcp-complete.ps1
```

---

**Last Updated**: 2025-11-03  
**Backend URL**: `https://backend.tooltipcompanion.com`  
**Status**: ✅ Production Ready
