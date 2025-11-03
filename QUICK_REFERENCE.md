# Quick Reference Guide

## Essential Files

### Core Extension Files
- `manifest.json` - Extension configuration
- `background.js` - Service worker (MCP client, REST fallback)
- `content.js` - Content scripts (tooltips, chat widget)
- `options.html/js` - Settings page
- `mcp-client.js` - MCP client library

### Documentation
- `README.md` - Full documentation
- `QUICK_START.md` - Installation guide
- `STEP_BY_STEP_FIX_502.md` - 502 error troubleshooting
- `PRODUCTION_BACKEND_URL.md` - Backend information
- `CONTRIBUTING.md` - Contribution guidelines
- `privacy-policy.md` - Privacy policy
- `CHANGELOG.md` - Version history

### Utility Scripts
- `diagnose-and-fix-502.ps1` - Diagnostic script for 502 errors
- `restart-backend-alb.ps1` - Restart backend via ALB
- `check-backend-logs.ps1` - View backend logs
- `deploy-backend.ps1` - Deploy backend updates
- `deploy-mcp-complete.ps1` - Full MCP deployment

## Quick Commands

### Check Backend Health
```powershell
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/health" -Method GET
```

### Diagnose 502 Errors
```powershell
.\diagnose-and-fix-502.ps1
```

### Restart Backend
```powershell
.\restart-backend-alb.ps1
```

### Check Backend Logs
```powershell
.\check-backend-logs.ps1
```

### Deploy Updates
```powershell
# Full backend deployment
.\deploy-backend.ps1

# Complete MCP deployment
.\deploy-mcp-complete.ps1
```

## Production Information

- **Backend URL:** `https://backend.tooltipcompanion.com`
- **Version:** 1.4.1
- **Cluster:** `tooltip-companion-cluster`
- **Service:** `tooltip-companion-backend-service`
- **Region:** `us-east-1`

## Common Tasks

### Install Extension
1. Chrome → `chrome://extensions/`
2. Enable Developer mode
3. Load unpacked
4. Select extension folder

### Configure OpenAI API Key
1. Click extension icon 📎
2. Paste API key
3. Save settings

### Reload Extension
1. Chrome → `chrome://extensions/`
2. Click reload button
3. Test on webpage

### Troubleshoot 502
1. Run `.\diagnose-and-fix-502.ps1`
2. Follow prompts
3. Restart if needed

---

**Need help?** Check `QUICK_START.md` for installation or `STEP_BY_STEP_FIX_502.md` for troubleshooting.

