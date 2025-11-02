# Documentation Cleanup Recommendations

This document lists files that can be removed or archived before pushing to GitHub.

## Files to Remove

These are temporary deployment/setup files that are no longer needed:

### AWS Deployment Scripts (Temporary)
- `add-alb-permissions.ps1`
- `alb-permissions-policy.json`
- `check-backend-logs.ps1`
- `check-task-definition.ps1`
- `configure-aws-user.ps1`
- `deploy-backend.ps1`
- `fix-backend-task.ps1`
- `fix-backend-with-profile.ps1`
- `get-backend-url.ps1`
- `set-openai-key-ecs.ps1`
- `setup-alb-and-domain.ps1`
- `setup-route53-dns.ps1`

### Temporary JSON Files
- `clean-td.json`
- `current-task-def-full.json`
- `current-td.json`
- `new-task-def.json`
- `task-def-clean.json`
- `task-def-new.json`
- `task-def-openai-clean.json`
- `task-def-with-openai.json`
- `task-definition-clean.json`
- `task-definition-new.json`
- `temp-logs.json`

### One-Time Setup Documentation
- `ADD_ECS_PERMISSIONS.md`
- `ADD_PERMISSIONS_FOR_ALB.md`
- `BACKEND_FIX_RECOMMENDATIONS.md`
- `BACKEND_IP_UPDATE_COMPLETE.md`
- `CLI_SETUP_OPTIONS.md`
- `FIX_BACKEND_MEMORY.md`
- `fix-backend-500-error.md`
- `GET_BACKEND_URL.md`
- `HYBRID_ALB_SETUP.md`
- `MANUAL_ALB_SETUP.md`
- `PRODUCTION_BACKEND_URL.md`
- `QUICK_ALB_SETUP.md`
- `SET_OPENAI_KEY.md`
- `SETUP_COMPLETE_SUMMARY.md`
- `SETUP_DEDICATED_AWS_USER.md`
- `SETUP_STABLE_BACKEND_DOMAIN.md`
- `TROUBLESHOOT_BLOCKED_REQUESTS.md`
- `VERIFY_OPENAI_KEY.md`
- `Developer Instructions_ Tooltip Companion Chrome Extension.md`
- `MCP_INTEGRATION_COMPLETE.md` (already moved to docs/)

### Archive Directories
- `OneDrive/` - Contains old versions and unrelated projects
- `v1.4.1-extracted/` - Extracted extension files (already packaged)

### Packages
- `tooltip-companion-v1.4.1.zip` - Can be regenerated

## Keep These Files

### Core Documentation
- `README.md` - Main documentation
- `CONTRIBUTING.md` - Contribution guidelines
- `privacy-policy.md` - Privacy policy
- `docs/` - All documentation in docs folder

### Core Extension Files
- `manifest.json`
- `background.js`
- `content.js`
- `options.html`
- `options.js`
- `mcp-client.js`
- `icons/`

### Backend Files
- `playwright_service/` (entire directory)
  - `server.js`
  - `mcp-server.js`
  - `package.json`
  - `Dockerfile`
  - `README.md`
  - `.gitignore`

## Recommended Actions

1. **Move to archive**: Create an `archive/` folder for historical reference
2. **Delete temp files**: Remove all `*.json` temp files and `*.ps1` deployment scripts
3. **Clean up OneDrive folder**: Remove or archive the `OneDrive/` directory
4. **Update .gitignore**: Ensure all temp files are ignored going forward

## Script to Clean Up

```powershell
# Create archive folder
New-Item -ItemType Directory -Path "archive" -Force

# Move temporary files to archive
Move-Item -Path "*.ps1" -Destination "archive\" -ErrorAction SilentlyContinue
Move-Item -Path "*task-def*.json" -Destination "archive\" -ErrorAction SilentlyContinue
Move-Item -Path "*current*.json" -Destination "archive\" -ErrorAction SilentlyContinue
Move-Item -Path "*clean*.json" -Destination "archive\" -ErrorAction SilentlyContinue
Move-Item -Path "*new*.json" -Destination "archive\" -ErrorAction SilentlyContinue
Move-Item -Path "temp-*.json" -Destination "archive\" -ErrorAction SilentlyContinue

# Remove extracted folder
Remove-Item -Path "v1.4.1-extracted" -Recurse -Force -ErrorAction SilentlyContinue

# Remove zip file (can be regenerated)
Remove-Item -Path "*.zip" -Force -ErrorAction SilentlyContinue
```

## After Cleanup

1. Verify extension still loads in Chrome
2. Test core features (tooltips, chat, OCR)
3. Ensure backend still runs locally
4. Commit changes with message: "docs: Clean up temporary files and organize documentation"

