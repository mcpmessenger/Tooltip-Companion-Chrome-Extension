# Commit & Deploy Plan: Operation Juicebox + Enhanced Page Analysis

**Date:** 2025-01-03  
**Branch:** `operation-juicebox-v1.5`  
**Status:** Ready to commit and deploy

## ✅ What's Ready to Commit

### Operation Juicebox (Phase 1 & 2)
- ✅ **Phase 1**: Backend stabilization, logging, retry logic, circuit breaker
- ✅ **Phase 2**: CSP-aware fallback, data URI support, buffer normalization

### Enhanced Page Analysis (All 3 Phases - COMPLETE)
- ✅ **Phase 1**: LLM semantic analysis (`analyzePageWithLLM`)
- ✅ **Phase 2**: HTML metadata extraction (title, meta description, h1 tags)
- ✅ **Phase 3**: Vision model analysis (`analyzePageWithVisionModel`)

### Additional Features
- ✅ Unified template system (`tooltip-template.js`)
- ✅ Enhanced chat intelligence
- ✅ Test scripts and documentation

### Minimal Workflow Code (Safe to Include)
- ⚠️ One system prompt line mentioning "WORKFLOW ASSISTANT" - very low risk, safe to include

## 📦 Files to Commit

### Core Implementation Files
```
✅ content.js - CSP fallback, template integration, chat improvements
✅ tooltip-template.js - Unified template system
✅ playwright_service/server.js - Phase 1, 2, and Enhanced Page Analysis
✅ playwright_service/mcp-server.js - Enhanced context passing
✅ manifest.json - Template script reference
✅ playwright_service/logger.js - Structured logging
✅ playwright_service/README.md - Updated documentation
```

### Documentation Files
```
✅ docs/OPERATION_JUICEBOX.md - Complete operation plan
✅ docs/OPERATION_JUICEBOX_STATUS.md - Status summary
✅ docs/PURPOSE_AND_VISION.md - Vision document
✅ Enhanced Page Analysis.md - Implementation plan
✅ playwright_service/TEST_INSTRUCTIONS.md - Testing guide
✅ playwright_service/test-enhanced-analysis.js - Test script
```

### Infrastructure Files
```
✅ infra/operation-juicebox/ - CloudWatch alarms, ECS review scripts
```

## 🚀 Commit Steps

### Step 1: Stage Safe Files

```powershell
cd "OneDrive/Desktop/Tooltip Companion Extension"

# Core implementation
git add content.js
git add tooltip-template.js
git add playwright_service/server.js
git add playwright_service/mcp-server.js
git add manifest.json
git add playwright_service/logger.js
git add playwright_service/README.md

# Documentation
git add docs/OPERATION_JUICEBOX.md
git add docs/OPERATION_JUICEBOX_STATUS.md
git add docs/PURPOSE_AND_VISION.md
git add "Enhanced Page Analysis.md"
git add playwright_service/TEST_INSTRUCTIONS.md
git add playwright_service/test-enhanced-analysis.js

# Infrastructure
git add infra/operation-juicebox/

# Optional: Add other new docs if desired
git add COMMIT_PLAN.md
git add COMMIT_AND_DEPLOY_PLAN.md
```

### Step 2: Commit with Detailed Message

```powershell
git commit -m "🧃 Operation Juicebox: Phase 1 & 2 Complete + Enhanced Page Analysis

✅ Phase 1: Backend Stabilization & Observability
- Structured JSON logging (pino logger) with correlation fields
- Retry logic with exponential backoff
- Host-level circuit breaker for upstream navigation calls
- CloudWatch alarms deployed (CPU, Memory, 5XX, Healthy Hosts)
- Enhanced health endpoint with telemetry
- ECS capacity review completed

✅ Phase 2: CSP-Aware Fallback & Compatibility
- Data URI fallback for strict CSP sites (banking, GitHub)
- Automatic retry with preferDataUri when CSP blocks HTTP images
- Buffer normalization for Node.js Buffer objects in screenshot responses
- MCP support for CSP-safe screenshots
- Tested on Wells Fargo and GitHub

✅ Enhanced Page Analysis (All 3 Phases Complete)
- Phase 1: LLM semantic analysis (GPT-4) - pagePurpose, sentiment, keyCTAs
- Phase 2: HTML metadata extraction (title, meta description, h1 tags)
- Phase 3: Vision model analysis (GPT-4o) - layout, design style, visual hierarchy
- Full-page screenshot capture for visual analysis
- Graceful fallback to keyword-based analysis if LLM/Vision unavailable

✅ Template System & Chat Intelligence
- Unified tooltip template system (tooltip-template.js)
- Enhanced chat intelligence with context-aware responses
- Proactive tooltip summaries
- Improved page awareness

📝 Documentation
- Added OPERATION_JUICEBOX_STATUS.md with deployment strategy
- Added PURPOSE_AND_VISION.md for workflow assistant vision
- Updated OPERATION_JUICEBOX.md with latest progress
- Added Enhanced Page Analysis implementation plan
- Added test scripts and instructions

Ready for production deployment to https://backend.tooltipcompanion.com"
```

### Step 3: Push to GitHub

```powershell
git push origin operation-juicebox-v1.5
```

## 🚀 Deploy to Production Backend

### Prerequisites
- ✅ AWS CLI configured
- ✅ Docker Desktop running
- ✅ ECR access permissions
- ✅ ECS deployment permissions

### Deployment Steps

**Option 1: Use Deployment Script (Recommended)**

```powershell
cd "OneDrive/Desktop/Tooltip Companion Extension"
.\deploy-backend.ps1
```

**Option 2: Manual Deployment**

1. **Build and push Docker image:**
   ```powershell
   cd playwright_service
   docker build -t tooltip-companion-backend .
   docker tag tooltip-companion-backend:latest 396608803476.dkr.ecr.us-east-1.amazonaws.com/tooltip-companion-backend:latest
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 396608803476.dkr.ecr.us-east-1.amazonaws.com
   docker push 396608803476.dkr.ecr.us-east-1.amazonaws.com/tooltip-companion-backend:latest
   ```

2. **Force new ECS deployment:**
   ```powershell
   aws ecs update-service --cluster tooltip-companion-cluster --service tooltip-companion-backend-service --force-new-deployment --region us-east-1
   ```

### Important: Environment Variables

Before deploying, ensure these environment variables are set in ECS task definition:

- ✅ `OPENAI_API_KEY` - Required for Enhanced Page Analysis (LLM + Vision)
- ✅ `PORT=3000` - Backend port
- ✅ Any other required variables (check task definition)

**To check current environment variables:**
```powershell
aws ecs describe-task-definition --task-definition tooltip-companion-backend --region us-east-1 | Select-String -Pattern "OPENAI_API_KEY"
```

**To update environment variables if needed:**
1. Update task definition JSON
2. Register new task definition revision
3. Update service to use new revision

## ✅ Post-Deployment Testing

### 1. Health Check
```powershell
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/health" -Method GET
```

**Expected:**
- `status: "healthy"`
- `config.openaiKeyConfigured: true` (if API key is set)
- `features.enhancedAnalysis: true`

### 2. Test Enhanced Page Analysis

**Using test script:**
```powershell
cd playwright_service
$env:BACKEND_URL="https://backend.tooltipcompanion.com"
node test-enhanced-analysis.js https://example.com
```

**Using curl:**
```powershell
$body = @{url = "https://example.com"} | ConvertTo-Json
Invoke-RestMethod -Uri "https://backend.tooltipcompanion.com/context" -Method Post -Body $body -ContentType "application/json"
```

**Check for:**
- ✅ `analysis.analysisMethod === "llm"` (if API key configured)
- ✅ `analysis.htmlMetadata` exists
- ✅ `analysis.visualSummary` exists (if API key configured)
- ✅ `analysis.pagePurpose` exists
- ✅ `analysis.sentiment` exists

### 3. Test Extension Integration

1. Load extension in Chrome
2. Navigate to any webpage
3. Hover over a link to trigger tooltip
4. Open chat panel
5. Ask: "What can you tell me about this page?"
6. Verify AI uses enhanced analysis data

### 4. Test CSP Fallback

1. Navigate to GitHub (strict CSP)
2. Hover over a link
3. Verify tooltip displays (should use data URI fallback)
4. Check browser console for no CSP errors

## 📊 Monitor After Deployment

### CloudWatch Alarms (Already Deployed)
- ✅ CPU > 80%
- ✅ Memory > 80%
- ✅ 5XX errors >= 5
- ✅ Healthy hosts < 1

### Check Logs
```powershell
.\check-backend-logs.ps1
```

**Look for:**
- `analysis.llm.success` - LLM analysis working
- `analysis.vision.success` - Vision analysis working
- `capture.html_metadata_extracted` - HTML metadata extraction
- `capture.fallback_base64` - CSP fallback usage

## ⚠️ Rollback Plan

If issues occur:

1. **Quick Rollback:**
   ```powershell
   # Revert to previous task definition
   aws ecs update-service --cluster tooltip-companion-cluster --service tooltip-companion-backend-service --task-definition tooltip-companion-backend:PREVIOUS_REVISION --region us-east-1
   ```

2. **Or revert commit:**
   ```powershell
   git revert HEAD
   git push origin operation-juicebox-v1.5
   ```

## 📝 Summary

**What's Being Deployed:**
- ✅ Operation Juicebox Phase 1 & 2 (production-ready, tested)
- ✅ Enhanced Page Analysis all 3 phases (complete, ready for testing)
- ✅ Template system and chat improvements

**What's NOT Being Deployed:**
- ❌ Full workflow analysis (only minimal prompt change included, which is safe)

**Estimated Deployment Time:** 5-10 minutes  
**Risk Level:** Low (Phase 1 & 2 tested, Enhanced Analysis has fallbacks)

---

**Ready to proceed?** Start with Step 1 (staging files) above! 🚀

