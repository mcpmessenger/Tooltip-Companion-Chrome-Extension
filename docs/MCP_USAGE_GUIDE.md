# MCP Usage Guide

## Overview

The Tooltip Companion extension now supports the Model Context Protocol (MCP) as an alternative to the traditional REST API. This guide explains how to use the MCP implementation.

## Architecture

### Backend (MCP Server)

The backend now exposes an MCP endpoint at `/mcp` that accepts JSON-RPC 2.0 requests.

**Location**: `playwright_service/server.js` + `playwright_service/mcp-server.js`

**Features**:
- JSON-RPC 2.0 protocol implementation
- MCP Tools: `capture_screenshot`, `chat`, `ocr_upload`, `analyze_page`
- MCP Resources: Context resources for structured browsing data
- MCP Prompts: Pre-defined prompt templates

### Frontend (MCP Client)

The extension includes an MCP client library that can be used instead of direct REST API calls.

**Location**: `mcp-client.js`

**Features**:
- JSON-RPC 2.0 client implementation
- Tool calling interface
- Resource reading interface
- Prompt interface

## Backend API

### MCP Endpoint

**POST** `/mcp`

Accepts JSON-RPC 2.0 request objects:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "capture_screenshot",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

### Available MCP Methods

#### `initialize`

Initialize MCP connection and negotiate protocol version.

**Request**:
```json
{
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
}
```

**Response**:
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
      "sessionId": "session_..."
    }
  }
}
```

#### `tools/list`

List all available MCP tools.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "capture_screenshot",
        "description": "Capture a screenshot of a web page using Playwright",
        "inputSchema": { ... }
      },
      ...
    ]
  }
}
```

#### `tools/call`

Call an MCP tool.

**Example - Capture Screenshot**:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "capture_screenshot",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

**Example - Chat**:
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "chat",
    "arguments": {
      "message": "Hello",
      "currentUrl": "https://example.com",
      "openaiKey": "sk-..."
    }
  }
}
```

## Frontend Usage

### Using MCP Client in Extension

```javascript
// In background.js or content.js
importScripts('mcp-client.js'); // For background.js
// or
// <script src="mcp-client.js"></script> // For content.js

// Initialize MCP client
const mcpClient = new MCPClient('http://localhost:3000');

// Initialize connection
await mcpClient.initialize();

// Call a tool
const result = await mcpClient.callTool('capture_screenshot', {
  url: 'https://example.com'
});

// Parse result
const resultData = JSON.parse(result.content[0].text);
const screenshot = resultData.screenshot;
```

### Comparison: REST vs MCP

**REST API (Current)**:
```javascript
fetch(`${backendUrl}/capture`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com' })
})
.then(res => res.json())
.then(data => {
  const screenshot = data.screenshot;
});
```

**MCP Protocol (New)**:
```javascript
const mcpClient = new MCPClient(backendUrl);
await mcpClient.initialize();
const result = await mcpClient.callTool('capture_screenshot', {
  url: 'https://example.com'
});
const resultData = JSON.parse(result.content[0].text);
const screenshot = resultData.screenshot;
```

## Migration Status

### Phase 1: MVP-1 (Transport Layer) - ✅ COMPLETE

- [x] MCP server implementation
- [x] MCP client library
- [x] JSON-RPC 2.0 protocol support
- [x] Tool routing (`capture_screenshot`, `chat`, `ocr_upload`, `analyze_page`)
- [x] Backward compatibility (REST endpoints still work)

### Phase 2: MVP-2 (Context & Intelligence) - 🔄 NEXT

- [ ] Enhanced Resources with structured context
- [ ] DOM context capture
- [ ] Viewport screenshot references
- [ ] User intent hints
- [ ] Enhanced Prompts for contextual assistance

### Phase 3: MVP-3 (Agentic Behavior) - 📋 FUTURE

- [ ] Additional tools (`fill_form`, `extract_data`, `navigate`)
- [ ] MCP Sampling support
- [ ] Stateful session management
- [ ] Multi-page context awareness

## Backward Compatibility

The backend maintains **full backward compatibility** with the existing REST API:

- `/capture` - Still works
- `/chat` - Still works
- `/ocr-upload` - Still works
- `/analyze/:url` - Still works

Both REST and MCP endpoints can be used simultaneously. The extension currently uses REST by default, with MCP available as an opt-in feature.

## Testing MCP

### Test with curl

```bash
# Initialize
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'

# Call tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "capture_screenshot",
      "arguments": {
        "url": "https://example.com"
      }
    }
  }'
```

## Next Steps

1. **Enable MCP in Extension**: Add feature flag to switch between REST and MCP
2. **Enhance Resources**: Implement structured context payloads (Phase 2)
3. **Add Prompts**: Implement contextual prompt templates
4. **Performance Testing**: Compare REST vs MCP latency
5. **User Testing**: Beta test MCP implementation

---

**Status**: MVP-1 Complete ✅ | Ready for MVP-2 🔄
**Last Updated**: 2025-01-27

