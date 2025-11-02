# Get Current Backend URL

## Quick Command

Run this script to automatically get the current backend URL from your ECS task:

```powershell
.\get-backend-url.ps1
```

## What It Does

1. **Finds running ECS task** in `tooltip-companion-cluster`
2. **Gets public IP address** from the task's network interface
3. **Tests backend health** by calling `/health` endpoint
4. **Copies URL to clipboard** automatically for easy pasting
5. **Shows instructions** for updating the extension

## Output Example

```
═══════════════════════════════════════════════════
          CURRENT BACKEND URL
═══════════════════════════════════════════════════

Backend URL:
  http://34.238.160.197:3000

Task Details:
  Task ID: f1d389246a8c453d8b96da51906ce6ed
  Public IP: 34.238.160.197
  Private IP: 172.31.43.110
  Status: RUNNING

Health Status:
  ✅ Backend is healthy and responding
```

## When to Use

- After deploying backend updates (IP may change)
- When extension can't connect to backend
- To verify current backend is running
- Before updating extension settings

## Updating Extension

After running the script, the URL is automatically copied to your clipboard. Then:

1. Open `chrome://extensions/`
2. Find "Tooltip Companion"
3. Click "Options"
4. Paste the URL in "Backend Service URL" field
5. Click "Save Settings"
6. Reload extension and refresh pages

---

**Note:** IP addresses change when ECS tasks restart. Run this script whenever you need to update the backend URL.

