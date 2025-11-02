# MCP Debug Guide - Chat and OCR Issues

## Current Status
- ✅ Tooltips (screenshot capture) - Working
- ❌ Chat - Not working
- ❌ OCR - Not working

## Troubleshooting Steps

### 1. Check Which Protocol is Being Used

Open the browser console (F12) and look for these logs:

**If using REST:**
```
🌐 Using REST API for chat
🌐 Using REST API for OCR
```

**If using MCP:**
```
🔌 Using MCP protocol for chat
🔌 MCP chat - calling tool with: ...
🔌 MCP chat - raw result: ...
```

### 2. Check Extension Settings

1. Go to extension options page
2. Verify "Enable MCP Protocol" checkbox state
3. If checked: MCP is enabled (may need to disable)
4. If unchecked: REST should be used (default)

### 3. Check Backend URL

In extension options, verify:
- Backend URL is set correctly
- Should be: `http://34.238.170.86:3000` (or your local backend)
- No trailing slashes
- URL is accessible

### 4. Test REST Endpoints Directly

Open browser console and test:

```javascript
// Test chat endpoint
fetch('http://34.238.170.86:3000/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello', url: window.location.href })
})
.then(r => r.json())
.then(d => console.log('Chat response:', d))
.catch(e => console.error('Chat error:', e));

// Test OCR endpoint (with a dummy image)
fetch('http://34.238.170.86:3000/ocr-upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: 'data:image/png;base64,iVBORw0KGgoAAAANS...' })
})
.then(r => r.json())
.then(d => console.log('OCR response:', d))
.catch(e => console.error('OCR error:', e));
```

### 5. Check Service Worker Logs

1. Go to `chrome://extensions`
2. Find "Tooltip Companion"
3. Click "service worker" link (or "background page")
4. Check console for errors

Look for:
- MCP initialization errors
- Fetch errors
- Response parsing errors

### 6. Common Issues and Fixes

#### Issue: "MCP client initialization failed"
**Fix:** Disable MCP in settings, use REST instead

#### Issue: "Failed to fetch"
**Fix:** Check backend URL is correct and backend is running

#### Issue: "Invalid MCP response format"
**Fix:** MCP server may have an issue, fallback to REST should trigger

#### Issue: Silent failure (no errors, no response)
**Fix:** Check that `sendResponse` is being called correctly

### 7. Force REST Mode

If MCP is causing issues:

1. Open extension options
2. **Uncheck** "Enable MCP Protocol"
3. Save settings
4. Reload extension (`chrome://extensions` → Reload)
5. Test chat/OCR again

### 8. Check Network Tab

1. Open DevTools (F12)
2. Go to Network tab
3. Try sending a chat message
4. Look for requests to:
   - `/chat` (REST)
   - `/mcp` (MCP)
5. Check response status and content

### 9. Enable Verbose Logging

The code now includes debug logging. Check console for:
- `🔌 MCP chat - calling tool with:`
- `🔌 MCP chat - raw result:`
- `🔌 MCP chat - parsed data:`
- `❌ MCP chat error:`

These will help identify where the issue occurs.

## Quick Fix: Disable MCP

If MCP is causing problems, the quickest fix is:

1. **Open extension options**
2. **Uncheck "Enable MCP Protocol"**
3. **Save settings**
4. **Reload extension**

This will force REST mode which should work since tooltips are working.

## Next Steps

After debugging, share:
1. Which protocol is being used (check console logs)
2. Any error messages from console
3. Network tab showing failed requests
4. Whether MCP checkbox is enabled/disabled

This will help identify the exact issue.

