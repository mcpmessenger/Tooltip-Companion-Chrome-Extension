# Quick Start Guide

## Installation (2 minutes)

1. **Download** or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right corner)
4. Click **Load unpacked** and select this extension folder
5. **Done!** Tooltips work immediately - hover over any link to see previews!

## Using AI Chat (Optional)

The AI chat feature requires an OpenAI API key:

1. **Get your API key** from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Click the extension icon 📎 and paste your API key
3. Click **Save Settings**
4. Start chatting! Click the 📎 icon on any webpage

**That's it!** Everything works with the production backend automatically.

---

## Current Status

✅ **Version:** 1.4.1  
✅ **Backend:** `https://backend.tooltipcompanion.com` (production)  
✅ **Status:** All features working  
✅ **No setup required:** Pre-configured

---

## Troubleshooting

### 502 Errors?

Run the diagnostic script:

```powershell
.\diagnose-and-fix-502.ps1
```

Or restart the backend:

```powershell
.\restart-backend-alb.ps1
```

### Extension not working?

1. Go to `chrome://extensions/`
2. Remove the extension
3. Reload unpacked
4. Test again

---

**Need more help?** See [README.md](README.md) for full documentation.

