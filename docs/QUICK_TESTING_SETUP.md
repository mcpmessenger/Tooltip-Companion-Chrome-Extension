# Quick Testing Setup for Phase 3 Features

## ✅ What You Need to Do

### 1. **Update Backend** (Required)
The backend has new files and handlers that need to be loaded.

**Steps:**
```bash
# Navigate to backend directory
cd playwright_service

# Make sure new dependencies are installed (if any)
npm install

# Restart the backend server
npm start
# OR if running directly:
node server.js
```

**Verify backend is running:**
- Check terminal for: `Playwright Tooltip Backend Service started` on port 3000
- Visit: `http://localhost:3000/health` in browser
- Should see: `{"status":"healthy",...}`

### 2. **Configure Extension for Local Testing** (Required)
Point the extension to your local backend.

**Option A: Via Options Page**
1. Click extension icon → **Options** (or right-click extension → Options)
2. Set **Backend URL** to: `http://localhost:3000`
3. Make sure **Use MCP Protocol** is checked ✅
4. Click **Save**

**Option B: Via Browser Console** (Quick test)
1. Open any webpage
2. Press F12 → Console tab
3. Run:
```javascript
chrome.storage.sync.set({
  backendUrl: 'http://localhost:3000',
  useMCP: true
}, () => {
  console.log('✅ Backend URL set to localhost');
  location.reload(); // Reload page to apply
});
```

### 3. **Reload Extension** (Required)
You modified `content.js` and `background.js`, so the extension must reload.

**Method 1: Chrome Extension Management**
1. Go to `chrome://extensions/`
2. Find **Tooltip Companion**
3. Click the **🔄 Reload** button (circular arrow icon)

**Method 2: Keyboard Shortcut**
- Press `Ctrl+R` (Windows) or `Cmd+R` (Mac) on the extensions page

**Method 3: Hard Reload**
1. Go to `chrome://extensions/`
2. Toggle **Developer mode** ON
3. Click **🔄 Reload** on Tooltip Companion
4. Refresh any open pages (`F5` or `Ctrl+R`)

## 🧪 Testing Checklist

After completing steps 1-3 above:

### Test 1: Safety Check (Easiest)
1. Open any webpage with links
2. Hover over a link
3. **Expected**: Safety indicator appears at top of tooltip (✅ Safe, ⚠️ Caution, or ❌ Unsafe)
4. **Timing**: Should appear within 1-2 seconds after tooltip

### Test 2: Page Summary (Requires Long Article)
1. Find a link to a long article (>2000 words)
   - Wikipedia articles work well
   - News articles
   - Blog posts (Medium, Dev.to)
2. Hover over the link
3. Wait for tooltip to show screenshot
4. **Expected**: After 2-5 seconds, "📝 Page Summary" section appears below screenshot
5. **Content**: Should be 3 sentences, under 300 characters

### Test 3: Action Prompts (MCP Prompt)
1. Open chat interface (extension icon → chat)
2. Use MCP prompt via backend:
   ```bash
   curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{
       "jsonrpc": "2.0",
       "id": 1,
       "method": "prompts/get",
       "params": {
         "name": "suggest_actions",
         "arguments": {
           "url": "https://example.com"
         }
       }
     }'
   ```

## 🔍 Troubleshooting

### Backend Not Starting?
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Mac/Linux

# Check backend logs for errors
# Look for: "Failed to start server" or module not found errors
```

### Extension Not Loading?
- Check browser console for errors: `F12` → Console
- Look for: `❌ MCP tool call error` or `Failed to fetch`
- Verify backend URL in extension storage:
  ```javascript
  chrome.storage.sync.get(['backendUrl'], (items) => {
    console.log('Backend URL:', items.backendUrl);
  });
  ```

### Features Not Appearing?
1. **Check MCP is enabled**: Extension options → "Use MCP Protocol" should be checked
2. **Check backend logs**: Look for `summarize` or `safety` scope messages
3. **Check browser console**: Look for `Failed to fetch page summary` or similar
4. **Verify new files exist**:
   - `playwright_service/handlers/summarize-page.js`
   - `playwright_service/handlers/check-link-safety.js`

### Safety Check Not Showing?
- May take 1-2 seconds (async load)
- Check browser console for: `Failed to fetch safety check`
- Verify MCP tool is registered: Backend should log `🔌 MCP tool call requested: check_link_safety`

### Summary Not Showing?
- Only triggers for **long articles** (>2000 words or article page type)
- Check browser console for: `Failed to fetch page summary`
- May require OpenAI API key for LLM summaries (fallback to simple extraction)

## 📊 Expected Behavior

### Normal Flow:
1. Hover over link → Tooltip appears with screenshot
2. **Safety indicator** appears at top (async, ~1-2s)
3. For long articles: **Summary** appears below screenshot (async, ~2-5s)
4. Both are cached for faster subsequent loads

### Console Logs to Watch:
```
🔌 MCP tool call requested: check_link_safety
🔌 MCP tool call requested: summarize_page
✅ Page summarization completed
✅ Link safety check completed
```

## 🚀 Quick Start Command Reference

```bash
# Terminal 1: Start Backend
cd playwright_service
npm start

# Terminal 2: Verify Backend
curl http://localhost:3000/health

# Browser: Configure Extension
# 1. chrome://extensions/ → Reload extension
# 2. Options → Set backend URL: http://localhost:3000
# 3. Enable MCP protocol
# 4. Reload any open pages
```

---

**Ready to test!** Start with Test 1 (Safety Check) - it's the easiest and fastest to verify.

