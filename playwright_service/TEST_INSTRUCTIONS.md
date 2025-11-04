# Testing Enhanced Page Analysis

This guide helps you test the Enhanced Page Analysis features that were just implemented.

## Prerequisites

1. **Set your OpenAI API key** in `server.js`:
   - Open `playwright_service/server.js`
   - Find line 22: `const BACKEND_OPENAI_API_KEY = ...`
   - Replace `'YOUR_OPENAI_API_KEY_HERE'` with your actual OpenAI API key

2. **Start the backend server**:
   ```bash
   cd playwright_service
   npm start
   ```
   The server should start on `http://localhost:3000`

## Test Methods

### Method 1: Using the Test Script (Recommended)

```bash
cd playwright_service
node test-enhanced-analysis.js [URL]
```

Example:
```bash
node test-enhanced-analysis.js https://example.com
node test-enhanced-analysis.js https://github.com
```

### Method 2: Using curl

**Test health endpoint:**
```bash
curl http://localhost:3000/health
```

**Test context endpoint (includes all enhanced features):**
```bash
curl -X POST http://localhost:3000/context \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Method 3: Using PowerShell (Windows)

**Test health:**
```powershell
Invoke-RestMethod -Uri http://localhost:3000/health -Method Get
```

**Test context:**
```powershell
$body = @{url = "https://example.com"} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/context -Method Post -Body $body -ContentType "application/json"
```

### Method 4: Using the Extension

1. Load the extension in Chrome
2. Navigate to any webpage
3. Hover over a link to trigger a tooltip
4. Open the chat panel
5. Ask: "What can you tell me about this page?"
6. The AI should use the enhanced analysis data

## What to Check

### ✅ Phase 1: LLM Semantic Analysis
- Check `analysis.analysisMethod === 'llm'` (should be 'llm' not 'keyword')
- Verify `analysis.pagePurpose` exists
- Verify `analysis.sentiment` exists
- Check that `analysis.keyTopics` and `analysis.suggestedActions` are more detailed

### ✅ Phase 2: HTML Metadata
- Check `analysis.htmlMetadata.title` exists
- Check `analysis.htmlMetadata.metaDescription` exists
- Check `analysis.htmlMetadata.h1Tags` array exists

### ✅ Phase 3: Visual Analysis
- Check `analysis.visualSummary` object exists
- Verify `visualSummary.layout` describes the page
- Verify `visualSummary.designStyle` is set
- Check `visualSummary.keyElements` array has items

## Expected Results

### With API Key Configured:
```json
{
  "analysis": {
    "pageType": "informational",
    "analysisMethod": "llm",
    "pagePurpose": "This page provides...",
    "sentiment": "neutral",
    "htmlMetadata": {
      "title": "Example Domain",
      "metaDescription": "...",
      "h1Tags": ["Example Domain"]
    },
    "visualSummary": {
      "layout": "Simple centered layout with header and main content",
      "designStyle": "minimalist",
      "colorScheme": "white background with blue accents",
      "keyElements": ["header", "main heading", "link"]
    }
  }
}
```

### Without API Key (Fallback):
```json
{
  "analysis": {
    "pageType": "unknown",
    "analysisMethod": "keyword",
    "htmlMetadata": {
      "title": "Example Domain",
      "h1Tags": ["Example Domain"]
    }
  }
}
```

## Troubleshooting

### "OpenAI API key not configured"
- Set `BACKEND_OPENAI_API_KEY` in `server.js` line 22
- Or set `OPENAI_API_KEY` environment variable

### "Vision model not working"
- Check that your API key has access to GPT-4o (vision-capable model)
- Verify the model name in `server.js` (should be 'gpt-4o')

### "LLM analysis falling back to keyword"
- Check API key is valid
- Check OpenAI API quota/balance
- Review server logs for error messages

## Server Logs

Watch the server console for detailed logging:
- `analysis.llm.start` - LLM analysis started
- `analysis.llm.success` - LLM analysis completed
- `analysis.vision.start` - Vision analysis started
- `analysis.vision.success` - Vision analysis completed
- `capture.html_metadata_extracted` - HTML metadata extracted

