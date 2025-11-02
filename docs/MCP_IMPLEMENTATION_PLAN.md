# MCP Migration Implementation Plan

## Overview

This document outlines the step-by-step migration from the current custom REST API architecture to the Model Context Protocol (MCP) as recommended in the feasibility analysis.

## Current Architecture

- **Client**: Chrome Extension (`content.js`, `background.js`)
- **Server**: Express.js backend (`server.js`) with Playwright
- **Communication**: Custom REST endpoints (`/capture`, `/chat`, `/ocr-upload`, etc.)
- **Transport**: Standard HTTP POST/GET requests

## Target MCP Architecture

- **Client**: MCP Client (extension-side)
- **Server**: MCP Server (backend)
- **Communication**: JSON-RPC 2.0 over Streamable HTTP (POST with SSE)
- **Features**: Resources, Tools, Prompts (as per MCP spec)

## Migration Phases

### Phase 1: MVP-1 - Transport Layer Migration (Current Focus)

**Goal**: Replace custom REST API with MCP JSON-RPC 2.0 protocol while maintaining existing functionality.

#### Tasks:
1. ✅ Create MCP client library (`mcp-client.js`) for the extension
   - JSON-RPC 2.0 request/response handling
   - Streamable HTTP transport with SSE support
   - Error handling and reconnection logic

2. ✅ Create MCP server wrapper (`mcp-server.js`) for backend
   - JSON-RPC 2.0 request handler
   - Method routing (initialize, tools/call, etc.)
   - SSE support for streaming responses

3. ✅ Implement MCP `initialize` handshake
   - Protocol version negotiation
   - Server capabilities exchange
   - Client capabilities declaration

4. ✅ Migrate `/capture` endpoint to MCP `tools/call`
   - Define `capture_screenshot` tool
   - Convert existing logic to MCP tool format
   - Maintain backward compatibility during transition

5. ✅ Update extension to use MCP client
   - Replace fetch() calls with MCP client methods
   - Update `background.js` message handlers
   - Update `content.js` tooltip system

#### Success Criteria:
- Existing functionality works identically
- All current endpoints accessible via MCP
- No breaking changes to user experience
- Can run both REST and MCP in parallel during transition

### Phase 2: MVP-2 - Context & Intelligence (Next)

**Goal**: Implement MCP Resources and structured context for "cognizant awareness."

#### Tasks:
1. Define MCP Resources for:
   - DOM context (link element + surrounding context)
   - Viewport screenshot reference
   - User intent hints
   - Page metadata

2. Implement Resource subscriptions
   - Client subscribes to resources
   - Server provides structured context payloads

3. Enhance tool responses with contextual summaries
   - Include OCR text as structured data
   - Page type analysis in standardized format
   - Suggested actions as MCP prompts

4. Implement MCP Prompts for contextual assistance
   - "analyze_page" prompt
   - "get_suggestions" prompt

#### Success Criteria:
- Contextual data structured per MCP spec
- LLM-ready resource payloads
- Improved "awareness" through structured context

### Phase 3: MVP-3 - Agentic Behavior (Future)

**Goal**: Enable advanced agentic features using MCP Tools and Sampling.

#### Tasks:
1. Implement additional MCP Tools:
   - `fill_form` - Pre-fill forms based on context
   - `extract_data` - Structured data extraction
   - `navigate` - Programmatic navigation
   - `take_action` - Execute user actions

2. Implement MCP Sampling
   - Server-initiated requests for more information
   - Proactive suggestions based on context

3. Stateful session management
   - Maintain browsing context across pages
   - Cross-page awareness and suggestions

#### Success Criteria:
- Agent can autonomously assist user
- Proactive suggestions based on browsing patterns
- Multi-page context awareness

## Technical Implementation Details

### MCP Protocol Specification

Following the official MCP specification:
- **Protocol**: JSON-RPC 2.0
- **Transport**: Streamable HTTP (POST for requests, SSE for responses)
- **Message Format**: JSON-RPC 2.0 objects

### File Structure

```
├── playwright_service/
│   ├── server.js (existing - will add MCP wrapper)
│   ├── mcp-server.js (new - MCP server implementation)
│   └── package.json (add MCP dependencies)
├── extension/
│   ├── background.js (existing - will use MCP client)
│   ├── content.js (existing - unchanged initially)
│   ├── mcp-client.js (new - MCP client library)
│   └── manifest.json (no changes needed)
└── MCP_IMPLEMENTATION_PLAN.md (this file)
```

### Dependencies

**Backend (`package.json`):**
- No additional dependencies needed initially (use native Node.js)

**Extension:**
- No additional dependencies (use native fetch API for SSE)

### Backward Compatibility

During Phase 1, maintain both REST and MCP endpoints:
- REST endpoints remain functional
- MCP endpoints available in parallel
- Feature flag to switch between modes
- Gradual migration path

## Testing Strategy

1. **Unit Tests**: MCP client/server protocol handling
2. **Integration Tests**: End-to-end MCP communication
3. **Backward Compatibility Tests**: Ensure REST still works
4. **Performance Tests**: Compare latency between REST and MCP

## Rollout Plan

1. **Development**: Implement MVP-1 in feature branch
2. **Testing**: Comprehensive testing with both protocols
3. **Staged Rollout**: Deploy with feature flag (MCP disabled by default)
4. **Beta Testing**: Enable MCP for beta users
5. **Full Migration**: Switch to MCP as default, deprecate REST
6. **Cleanup**: Remove REST endpoints after full migration

## Risk Mitigation

- **Complexity Risk**: Start with minimal MCP implementation, expand gradually
- **Latency Risk**: Optimize transport layer, maintain caching
- **Compatibility Risk**: Run both protocols in parallel during transition
- **Breaking Changes**: Feature flags and gradual rollout

## Success Metrics

- ✅ All existing functionality works via MCP
- ✅ No increase in latency (>10ms acceptable)
- ✅ Improved context structure (Phase 2)
- ✅ User satisfaction maintained or improved
- ✅ Code maintainability improved

## Timeline

- **Phase 1 (MVP-1)**: 2-3 days
- **Phase 2 (MVP-2)**: 3-5 days (after Phase 1)
- **Phase 3 (MVP-3)**: 5-7 days (after Phase 2)

---

**Status**: Phase 1 - In Progress
**Last Updated**: 2025-01-27

