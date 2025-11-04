# Model Context Protocol (MCP) Specification
## Tooltip Companion Extension

**Version:** 1.0.0  
**Protocol Version:** 2024-11-05  
**Last Updated:** November 3, 2025  
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Protocol](#protocol)
3. [Transport](#transport)
4. [Initialization](#initialization)
5. [Tools](#tools)
6. [Resources](#resources)
7. [Prompts](#prompts)
8. [Error Handling](#error-handling)
9. [Versioning](#versioning)
10. [Examples](#examples)
11. [Migration Guide](#migration-guide)

---

## Overview

The Tooltip Companion MCP implementation provides a standardized JSON-RPC 2.0 interface for AI-powered browser extension features. This protocol enables:

- **Context-Aware Screenshot Capture**: Capture web pages with full context (screenshot, analysis, OCR text)
- **Intelligent Chat Assistance**: Context-aware AI chat with browsing history awareness
- **OCR Processing**: Extract text from images for AI context
- **Page Analysis**: Semantic analysis of web pages for intelligent assistance

### Key Features

- **JSON-RPC 2.0**: Standard protocol for reliable request/response handling
- **HTTP Transport**: Simple POST-based communication (SSE support planned)
- **Backward Compatible**: REST API fallback for reliability
- **Versioned**: Protocol versioning for future compatibility

---

## Protocol

### Protocol Version

The MCP protocol version follows the format: `YYYY-MM-DD`

**Current Version:** `2024-11-05`

### JSON-RPC 2.0 Compliance

All MCP requests and responses follow the JSON-RPC 2.0 specification:

- **Request Format:**
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "method_name",
    "params": {}
  }
  ```

- **Response Format:**
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "result": {}
  }
  ```

- **Error Format:**
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32603,
      "message": "Internal error",
      "data": {}
    }
  }
  ```

### Notifications

Notifications are JSON-RPC 2.0 requests without an `id` field. The server does not send a response to notifications.

---

## Transport

### Endpoint

**Base URL:** `{backendUrl}/mcp`

**Method:** `POST`

**Content-Type:** `application/json`

**Accept:** `application/json`

### Request Flow

1. Client sends JSON-RPC 2.0 request to `POST /mcp`
2. Server processes request and returns JSON-RPC 2.0 response
3. Client handles response or error

### Example Request

```bash
curl -X POST https://backend.tooltipcompanion.com/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "tooltip-companion-extension",
        "version": "1.4.1"
      }
    }
  }'
```

---

## Initialization

### Method: `initialize`

Initialize the MCP connection and negotiate protocol version.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": {
        "listChanged": true
      },
      "sampling": {}
    },
    "clientInfo": {
      "name": "tooltip-companion-extension",
      "version": "1.4.1"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": {},
      "prompts": {}
    },
    "serverInfo": {
      "name": "tooltip-companion-mcp-server",
      "version": "1.0.0",
      "sessionId": "session_1234567890_abc123"
    }
  }
}
```

**Parameters:**
- `protocolVersion` (string, required): Client's protocol version
- `capabilities` (object, required): Client capabilities
  - `roots.listChanged` (boolean): Client supports resource list change notifications
  - `sampling` (object): Client supports sampling capabilities
- `clientInfo` (object, required): Client identification
  - `name` (string): Client name
  - `version` (string): Client version

**Response Fields:**
- `protocolVersion` (string): Server's protocol version
- `capabilities` (object): Server capabilities
- `serverInfo` (object): Server identification
  - `name` (string): Server name
  - `version` (string): Server version
  - `sessionId` (string): Session identifier

### Notification: `initialized`

After receiving the `initialize` response, the client must send an `initialized` notification.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "initialized",
  "params": {}
}
```

**Response:** None (notification)

---

## Tools

Tools are callable functions that perform specific operations. Tools are invoked via the `tools/call` method.

### Method: `tools/list`

List all available tools.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "capture_screenshot",
        "description": "Capture a screenshot of a web page using Playwright",
        "inputSchema": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "description": "The URL of the page to capture"
            },
            "preferDataUri": {
              "type": "boolean",
              "description": "Return screenshot as data URI (for CSP-restricted pages)"
            }
          },
          "required": ["url"]
        }
      }
      // ... other tools
    ]
  }
}
```

### Method: `tools/call`

Call a specific tool.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "capture_screenshot",
    "arguments": {
      "url": "https://example.com",
      "preferDataUri": false
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"screenshot\": \"https://...\", \"url\": \"https://example.com\", \"analysis\": {...}, \"text\": \"...\", \"timestamp\": \"2025-11-03T...\"}"
      }
    ]
  }
}
```

### Tool: `capture_screenshot`

Capture a screenshot of a web page with full context (screenshot, OCR text, analysis).

**Parameters:**
- `url` (string, required): The URL of the page to capture
- `preferDataUri` (boolean, optional): Return screenshot as data URI instead of URL (for CSP-restricted pages)

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"screenshot\": \"https://...\", \"screenshotUrl\": \"https://...\", \"originalScreenshotUrl\": \"https://...\", \"screenshotDataUri\": \"data:image/png;base64,...\", \"url\": \"https://example.com\", \"analysis\": {\"pageType\": \"article\", \"keyTopics\": [...], \"suggestedActions\": [...], \"confidence\": 0.85}, \"text\": \"Extracted OCR text...\", \"timestamp\": \"2025-11-03T12:00:00.000Z\"}"
    }
  ]
}
```

**Response Fields:**
- `screenshot` (string): Screenshot URL or data URI
- `screenshotUrl` (string): Screenshot URL (if available)
- `originalScreenshotUrl` (string): Original screenshot URL before processing
- `screenshotDataUri` (string, optional): Base64 data URI (if `preferDataUri` was true)
- `url` (string): Captured URL
- `analysis` (object, optional): Page analysis
  - `pageType` (string): Type of page (e.g., "article", "product", "homepage")
  - `keyTopics` (array): Array of key topics identified
  - `suggestedActions` (array): Suggested actions for the user
  - `confidence` (number): Analysis confidence (0-1)
- `text` (string): OCR-extracted text from screenshot
- `timestamp` (string): ISO 8601 timestamp

### Tool: `chat`

Send a chat message with context-aware AI assistance.

**Parameters:**
- `message` (string, required): The chat message from the user
- `currentUrl` (string, optional): The current page URL for context
- `openaiKey` (string, optional): Optional OpenAI API key (if not using backend key)
- `tooltipHistory` (array, optional): Recent tooltip events for context
- `tooltipContexts` (array, optional): Full tooltip contexts with analysis, OCR, metadata

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"response\": \"AI response text...\", \"reply\": \"AI response text...\"}"
    }
  ]
}
```

**Response Fields:**
- `response` (string): AI response text
- `reply` (string): AI response text (alias for `response`)

**Context Structure:**
The `tooltipContexts` array should contain objects with:
- `url` (string): Context URL
- `analysis` (object): Page analysis
- `ocrText` (string): OCR text
- `screenshot` (string): Screenshot URL or data URI
- `timestamp` (string): ISO 8601 timestamp

### Tool: `ocr_upload`

Extract text from an image using OCR.

**Parameters:**
- `image` (string, required): Base64 encoded image data (data URI or base64 string)

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"success\": true, \"text\": \"Extracted text...\", \"characterCount\": 1234, \"data\": {...}}"
    }
  ]
}
```

**Response Fields:**
- `success` (boolean): Whether OCR was successful
- `text` (string): Extracted text
- `characterCount` (number): Number of characters extracted
- `data` (object): Additional OCR metadata

### Tool: `analyze_page`

Get page analysis for a previously captured URL.

**Parameters:**
- `url` (string, required): The URL to analyze

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"analysis\": {\"pageType\": \"article\", \"keyTopics\": [...], \"suggestedActions\": [...], \"confidence\": 0.85, \"pagePurpose\": \"...\", \"sentiment\": \"positive\", \"analysisMethod\": \"llm\"}}"
    }
  ]
}
```

**Response Fields:**
- `analysis` (object): Page analysis
  - `pageType` (string): Type of page
  - `keyTopics` (array): Array of key topics
  - `suggestedActions` (array): Suggested actions
  - `confidence` (number): Analysis confidence (0-1)
  - `pagePurpose` (string, optional): Purpose of the page
  - `sentiment` (string, optional): Sentiment analysis ("positive", "neutral", "negative")
  - `analysisMethod` (string): Analysis method used ("llm", "keyword", "vision")

---

## Resources

Resources are structured data that can be read by the client. Resources are accessed via the `resources/read` method.

### Method: `resources/list`

List all available resources.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "resources": [
      {
        "uri": "tooltip://context/{url}",
        "name": "Tooltip Context",
        "description": "Full context for a URL (screenshot + analysis + OCR)",
        "mimeType": "application/json"
      }
    ]
  }
}
```

### Method: `resources/read`

Read a specific resource.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "resources/read",
  "params": {
    "uri": "tooltip://context/https%3A%2F%2Fexample.com",
    "options": {
      "preferDataUri": false
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "uri": "tooltip://context/https%3A%2F%2Fexample.com",
    "mimeType": "application/json",
    "text": "{\"type\": \"tooltip_context\", \"url\": \"https://example.com\", \"screenshotUrl\": \"https://...\", \"analysis\": {...}, \"text\": \"...\", \"timestamp\": \"2025-11-03T...\"}"
  }
}
```

### Resource: `tooltip://context/{url}`

Full context resource for a URL, including screenshot, analysis, and OCR text.

**URI Format:** `tooltip://context/{url}` where `{url}` is URL-encoded

**Parameters:**
- `preferDataUri` (boolean, optional): Return screenshot as data URI instead of URL

**Response:**
```json
{
  "type": "tooltip_context",
  "url": "https://example.com",
  "screenshotUrl": "https://...",
  "screenshot": "https://...",
  "originalScreenshotUrl": "https://...",
  "screenshotDataUri": "data:image/png;base64,...",
  "analysis": {
    "pageType": "article",
    "keyTopics": ["topic1", "topic2"],
    "suggestedActions": ["action1", "action2"],
    "confidence": 0.85
  },
  "text": "Extracted OCR text...",
  "timestamp": "2025-11-03T12:00:00.000Z"
}
```

---

## Prompts

Prompts are pre-defined templates for generating contextual assistance. Prompts are accessed via the `prompts/get` method.

### Method: `prompts/list`

List all available prompts.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "prompts/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "prompts": [
      {
        "name": "analyze_page_context",
        "description": "Analyze the current page context and provide insights",
        "arguments": [
          {
            "name": "url",
            "description": "The URL to analyze",
            "required": true
          }
        ]
      }
    ]
  }
}
```

### Method: `prompts/get`

Get a specific prompt with arguments.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "prompts/get",
  "params": {
    "name": "analyze_page_context",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "description": "Analysis for https://example.com",
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "Analyze this page: https://example.com"
        }
      },
      {
        "role": "assistant",
        "content": {
          "type": "text",
          "text": "{\"analysis\": {...}}"
        }
      }
    ]
  }
}
```

### Prompt: `analyze_page_context`

Analyze the current page context and provide insights.

**Arguments:**
- `url` (string, required): The URL to analyze

**Response:**
- `description` (string): Description of the analysis
- `messages` (array): Array of messages for the AI conversation
  - `role` (string): Message role ("user" or "assistant")
  - `content` (object): Message content
    - `type` (string): Content type ("text")
    - `text` (string): Message text

---

## Error Handling

### Standard JSON-RPC 2.0 Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse error | Invalid JSON was received |
| -32600 | Invalid Request | The JSON sent is not a valid Request object |
| -32601 | Method not found | The method does not exist / is not available |
| -32602 | Invalid params | Invalid method parameter(s) |
| -32603 | Internal error | Internal JSON-RPC error |

### Custom Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32000 | Server error | Server-side error (generic) |
| -32001 | Capture timeout | Screenshot capture timed out |
| -32002 | Capture failed | Screenshot capture failed |
| -32003 | Analysis failed | Page analysis failed |
| -32004 | OCR failed | OCR processing failed |
| -32005 | Chat failed | Chat processing failed |

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": {
      "details": "Additional error details",
      "stack": "Error stack trace (development only)"
    }
  }
}
```

### Error Handling Best Practices

1. **Always check for errors** in JSON-RPC responses
2. **Handle network errors** separately (connection failures, timeouts)
3. **Implement retry logic** for transient errors (5xx status codes)
4. **Fallback to REST API** if MCP fails completely
5. **Log errors** with sufficient context for debugging

---

## Versioning

### Protocol Version Format

Protocol versions follow the format: `YYYY-MM-DD`

Examples:
- `2024-11-05` - Initial protocol version
- `2025-01-15` - Future version with breaking changes

### Version Compatibility

- **Same Major Date**: Fully compatible (same year-month)
- **Different Date**: May have breaking changes; client and server must negotiate

### Version Negotiation

During `initialize`, the client sends its protocol version. The server responds with its protocol version. If versions are incompatible, the server should return an error or negotiate a compatible version.

### Backward Compatibility

- **New fields** are optional and should not break existing clients
- **Removed fields** should be deprecated first, then removed in a future version
- **Breaking changes** require a new protocol version date

---

## Examples

### Complete Initialization Flow

```javascript
// 1. Initialize
const initResponse = await mcpClient.call('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {
    roots: { listChanged: true },
    sampling: {}
  },
  clientInfo: {
    name: 'tooltip-companion-extension',
    version: '1.4.1'
  }
});

// 2. Send initialized notification
await mcpClient.notify('initialized', {});

// 3. List available tools
const tools = await mcpClient.listTools();
console.log('Available tools:', tools);

// 4. Call a tool
const result = await mcpClient.callTool('capture_screenshot', {
  url: 'https://example.com',
  preferDataUri: false
});
```

### Capture Screenshot with Context

```javascript
const result = await mcpClient.callTool('capture_screenshot', {
  url: 'https://example.com',
  preferDataUri: false
});

const data = JSON.parse(result.content[0].text);
console.log('Screenshot URL:', data.screenshotUrl);
console.log('Analysis:', data.analysis);
console.log('OCR Text:', data.text);
```

### Read Context Resource

```javascript
const resourceUri = `tooltip://context/${encodeURIComponent('https://example.com')}`;
const resource = await mcpClient.readResource(resourceUri, {
  preferDataUri: false
});

const context = JSON.parse(resource.text);
console.log('Full context:', context);
```

### Chat with Context

```javascript
const result = await mcpClient.callTool('chat', {
  message: 'What is this page about?',
  currentUrl: 'https://example.com',
  tooltipHistory: [
    { url: 'https://example.com', timestamp: '2025-11-03T12:00:00Z' }
  ],
  tooltipContexts: [
    {
      url: 'https://example.com',
      analysis: { pageType: 'article', keyTopics: ['AI', 'ML'] },
      ocrText: 'Extracted text...',
      screenshot: 'https://...',
      timestamp: '2025-11-03T12:00:00Z'
    }
  ]
});

const response = JSON.parse(result.content[0].text);
console.log('AI Response:', response.response);
```

---

## Migration Guide

### From REST API to MCP

#### Screenshot Capture

**Before (REST):**
```javascript
const response = await fetch(`${backendUrl}/capture`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, preferDataUri: false })
});
const data = await response.json();
```

**After (MCP):**
```javascript
const result = await mcpClient.callTool('capture_screenshot', {
  url,
  preferDataUri: false
});
const data = JSON.parse(result.content[0].text);
```

#### Chat

**Before (REST):**
```javascript
const response = await fetch(`${backendUrl}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message,
    url,
    tooltipHistory,
    openaiKey
  })
});
const data = await response.json();
```

**After (MCP):**
```javascript
const result = await mcpClient.callTool('chat', {
  message,
  currentUrl: url,
  tooltipHistory,
  tooltipContexts,
  openaiKey
});
const data = JSON.parse(result.content[0].text);
```

#### Context Fetching

**Before (REST):**
```javascript
const response = await fetch(`${backendUrl}/context`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, preferDataUri: false })
});
const data = await response.json();
```

**After (MCP):**
```javascript
const resourceUri = `tooltip://context/${encodeURIComponent(url)}`;
const resource = await mcpClient.readResource(resourceUri, {
  preferDataUri: false
});
const data = JSON.parse(resource.text);
```

### Fallback Strategy

Always implement fallback to REST API:

```javascript
async function captureScreenshot(url, preferDataUri = false) {
  try {
    // Try MCP first
    const result = await mcpClient.callTool('capture_screenshot', {
      url,
      preferDataUri
    });
    return JSON.parse(result.content[0].text);
  } catch (error) {
    console.warn('MCP failed, falling back to REST:', error);
    // Fallback to REST
    const response = await fetch(`${backendUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, preferDataUri })
    });
    return await response.json();
  }
}
```

---

## Appendix

### Changelog

#### Version 1.0.0 (2025-11-03)
- Initial MCP specification
- 4 tools: `capture_screenshot`, `chat`, `ocr_upload`, `analyze_page`
- 1 resource: `tooltip://context/{url}`
- 1 prompt: `analyze_page_context`
- Protocol version: `2024-11-05`

### Related Documents

- `MCP_IMPLEMENTATION_PLAN.md` - Implementation details
- `MCP_USAGE_GUIDE.md` - Usage guide for developers
- `MCP_AI_EXPANSION_STRATEGIC_PLAN.md` - Strategic expansion plan

### Support

For questions or issues with the MCP implementation:
- Review the implementation in `mcp-client.js` and `playwright_service/mcp-server.js`
- Check the usage guide: `docs/MCP_USAGE_GUIDE.md`
- Open an issue on the project repository

---

**Document Status:** Production Ready  
**Maintained By:** Tooltip Companion Development Team  
**Next Review:** After Phase 1 implementation (see Strategic Plan)

