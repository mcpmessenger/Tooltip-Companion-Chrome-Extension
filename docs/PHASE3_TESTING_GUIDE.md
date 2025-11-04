# Phase 3: AI Utility Expansion - Testing Guide

## Overview

Phase 3 adds three major AI utility features that are immediately visible and testable:

1. **Dynamic Summarization Tooltip** - Auto-generates page summaries for long articles
2. **Link Safety Check** - Analyzes link safety and shows indicators
3. **Auto-Generated Action Prompts** - Suggests contextual actions based on page analysis

## Testing Checklist

### ✅ Phase 1 & 2 Prerequisites
- [x] MCP protocol formalized and standardized
- [x] Context payload structure implemented
- [x] Semantic HTML extraction working
- [x] Interactive elements analysis working
- [x] OCR text cleanup processor integrated

### 🧪 Phase 3 Features to Test

#### 1. Dynamic Summarization Tooltip

**How to Test:**
1. Hover over a link to a long article or blog post (>2000 words)
2. Wait for tooltip to appear with screenshot
3. After a few seconds, a "📝 Page Summary" section should appear below the screenshot
4. The summary should be 3 sentences and under 300 characters

**Expected Behavior:**
- Summary appears automatically for long articles
- Summary is cached (won't regenerate on subsequent hovers)
- Summary uses LLM for long articles, simple extraction for short pages
- Summary container has proper styling and is visible

**Test URLs:**
- Long Wikipedia articles
- Blog posts (Medium, Dev.to)
- News articles
- Documentation pages

#### 2. Link Safety Check

**How to Test:**
1. Hover over any link
2. After tooltip appears, a safety indicator should appear at the top
3. Shows one of: ✅ Safe Link, ⚠️ Use Caution, ❌ Unsafe Link
4. Includes brief reasons if not safe

**Expected Behavior:**
- Safety check runs asynchronously (doesn't block tooltip display)
- Shows appropriate icon and color coding
- Displays reasons for caution/unsafe status
- Checks URL patterns (shorteners, IP addresses, HTTP vs HTTPS)
- Compares with current page domain

**Test URLs:**
- Same domain links (should show ✅ Safe)
- HTTPS links (should show ✅ Safe)
- HTTP links (should show ⚠️ Caution)
- URL shorteners (bit.ly, tinyurl.com - should show ⚠️ Caution)
- External domains (should show ✅ Safe if reputable)

#### 3. Auto-Generated Action Prompts

**How to Test:**
1. Open chat interface (click extension icon → chat)
2. After hovering over a link, action suggestions should appear in chat
3. Suggestions are based on:
   - Page analysis suggested actions
   - Interactive elements (buttons, forms)
   - Page type (article, product, etc.)

**Expected Behavior:**
- Action suggestions appear in chat after tooltip context is loaded
- Suggestions are clickable or formatted as prompts
- Maximum 5 suggestions shown
- Suggestions are contextual to the page type

**MCP Tool:**
- `suggest_actions` prompt can be called via MCP
- Returns structured suggestions with type, label, description, source

## Integration Points

### Backend (MCP Server)

**New MCP Tools:**
```javascript
// Summarize page
{
  tool: 'summarize_page',
  arguments: { url: 'https://...', maxLength: 300 }
}

// Check link safety
{
  tool: 'check_link_safety',
  arguments: { url: 'https://...', context: {...} }
}
```

**New MCP Resources:**
- `tooltip://summary/{url}` - Cached page summaries

**New MCP Prompts:**
- `suggest_actions` - Generate contextual action suggestions

### Frontend (Content Script)

**New Functions:**
- `fetchPageSummary(url)` - Fetches summary via MCP
- `fetchLinkSafety(url, currentUrl)` - Fetches safety check via MCP
- `updateTooltipWithSummary(summaryData)` - Updates tooltip UI with summary
- `updateTooltipWithSafetyCheck(safetyData)` - Updates tooltip UI with safety indicator

**Background Script:**
- New message handler: `mcp-call` - Generic MCP tool call handler

## Files Modified

### Backend
- `playwright_service/handlers/summarize-page.js` - NEW
- `playwright_service/handlers/check-link-safety.js` - NEW
- `playwright_service/mcp-server.js` - Added handlers for new tools
- `playwright_service/server.js` - Integrated Phase 3 handlers

### Frontend
- `content.js` - Added summary and safety check integration
- `background.js` - Added MCP tool call handler

## Known Limitations

1. **Summarization:**
   - Only triggers for long articles (>2000 words or article page type)
   - Requires OpenAI API key for LLM-based summaries
   - Falls back to simple extraction if API unavailable

2. **Safety Check:**
   - Basic pattern matching (not ML-based threat detection)
   - Doesn't check against real-time threat databases
   - Deep analysis requires page capture (adds latency)

3. **Action Prompts:**
   - Currently only available via MCP prompt (not auto-displayed in chat yet)
   - Suggestions are heuristic-based (not AI-generated)

## Next Steps

1. **Test summarization** on various article types
2. **Test safety checks** on different URL patterns
3. **Integrate action prompts** into chat UI (auto-display)
4. **Add caching** for safety checks (already implemented)
5. **Performance optimization** for async loading

## Performance Notes

- Summarization and safety checks run **asynchronously** after tooltip display
- They don't block the initial tooltip rendering
- Results are cached:
  - Summaries: 24 hours TTL
  - Safety checks: 1 hour TTL
- Multiple tooltips won't trigger duplicate requests (cached)

## Debugging

**Enable verbose logging:**
```javascript
// In browser console
localStorage.setItem('tooltip-debug', 'true');
```

**Check MCP responses:**
- Open browser DevTools → Network tab
- Filter for `/mcp` requests
- Check request/response payloads

**Verify handlers:**
- Check backend logs for `summarize` and `safety` scope messages
- Verify cache hits/misses

