# Context Payload Schema
## Standardized Data Structures for Tooltip Companion

**Version:** 1.0.0  
**Last Updated:** November 3, 2025  
**Status:** Production Ready

---

## Overview

This document defines the standardized context payload structures used throughout the Tooltip Companion extension for AI context-gathering and communication between the client and backend.

All context payloads follow these schemas to ensure consistency, type safety, and maintainability.

---

## TypeScript/JSDoc Definitions

### Core Interfaces

```typescript
/**
 * Standardized context payload structure
 * Used for all tooltip context data sent between client and backend
 */
interface ContextPayload {
  // Page metadata
  page: PageMetadata;
  
  // Content data
  content: ContentData;
  
  // AI analysis
  analysis: PageAnalysis;
  
  // Interactive elements
  interactive?: InteractiveElements;
  
  // Tooltip history (optional)
  tooltipHistory?: TooltipEvent[];
  
  // MCP Resource metadata (if applicable)
  mcpResource?: MCPResourceMetadata;
}

/**
 * Page metadata information
 */
interface PageMetadata {
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
  };
  timestamp: string; // ISO 8601 format
}

/**
 * Content data extracted from the page
 */
interface ContentData {
  // Semantic HTML extraction (structured content)
  semantic?: SemanticContent;
  
  // OCR text extraction
  ocr: OCRData;
  
  // HTML metadata
  metadata: HTMLMetadata;
}

/**
 * Semantic HTML content structure
 */
interface SemanticContent {
  mainContent?: string; // Main content from <main> or <article>
  articles?: ArticleContent[]; // Array of article elements
  sections?: SectionContent[]; // Array of section elements
  structuredData?: Record<string, any>; // JSON-LD, microdata, etc.
}

/**
 * Article content structure
 */
interface ArticleContent {
  title: string;
  content: string;
  url?: string;
}

/**
 * Section content structure
 */
interface SectionContent {
  heading: string;
  content: string;
  level?: number; // Heading level (1-6)
}

/**
 * OCR text data
 */
interface OCRData {
  text: string;
  cleaned?: string; // Preprocessed/cleaned OCR text
  confidence: number; // OCR confidence (0-1)
  artifacts?: string[]; // Known OCR artifacts/failures
}

/**
 * HTML metadata
 */
interface HTMLMetadata {
  title: string;
  description?: string;
  headings: string[]; // Array of h1-h6 headings
}

/**
 * Page analysis from AI/LLM
 */
interface PageAnalysis {
  pageType: string; // e.g., "article", "product", "homepage", "unknown"
  keyTopics: string[]; // Array of key topics identified
  suggestedActions: Action[]; // Suggested actions for the user
  confidence: number; // Analysis confidence (0-1)
  
  // Enhanced fields (optional)
  pagePurpose?: string; // Purpose of the page
  sentiment?: 'positive' | 'neutral' | 'negative';
  analysisMethod?: 'llm' | 'keyword' | 'vision' | 'hybrid';
  
  // Visual analysis (optional)
  visualSummary?: VisualSummary;
  
  // HTML metadata (optional, legacy)
  htmlMetadata?: HTMLMetadata;
}

/**
 * Visual summary from vision model
 */
interface VisualSummary {
  layout: string;
  keyElements: string[];
  designStyle: string;
  colorScheme: string;
  visualHierarchy: string;
  confidence: number; // Visual analysis confidence (0-1)
}

/**
 * Suggested action
 */
interface Action {
  label: string; // Action label/text
  description?: string; // Action description
  type?: string; // Action type (e.g., "button", "link", "form")
}

/**
 * Interactive elements on the page
 */
interface InteractiveElements {
  buttons: ButtonElement[];
  forms: FormElement[];
  links: LinkElement[];
}

/**
 * Button element information
 */
interface ButtonElement {
  text: string;
  purpose?: string; // Computed purpose/context
  state: 'enabled' | 'disabled' | 'hidden';
  location: {
    x: number;
    y: number;
    visible: boolean;
  };
  importance: number; // Importance score (0-1)
}

/**
 * Form element information
 */
interface FormElement {
  fields: FormField[];
  action?: string; // Form action URL
  method?: string; // Form method (GET, POST, etc.)
}

/**
 * Form field information
 */
interface FormField {
  name: string;
  type: string; // Input type
  required: boolean;
  label?: string;
}

/**
 * Link element information
 */
interface LinkElement {
  text: string;
  url: string;
  purpose?: string; // Link purpose/context
  visible: boolean;
}

/**
 * Tooltip event history entry
 */
interface TooltipEvent {
  url: string;
  timestamp: string; // ISO 8601 format
  type?: string; // Event type (e.g., "hover", "click")
  element?: string; // Element type (e.g., "link", "button")
}

/**
 * MCP Resource metadata
 */
interface MCPResourceMetadata {
  uri: string; // Resource URI (e.g., "tooltip://context/{url}")
  mimeType: string; // MIME type (e.g., "application/json")
  timestamp: string; // ISO 8601 format
}

/**
 * Screenshot data structure
 */
interface ScreenshotData {
  screenshotUrl?: string; // URL to screenshot
  screenshot?: string; // URL or data URI (alias for screenshotUrl)
  originalScreenshotUrl?: string; // Original URL before processing
  screenshotDataUri?: string; // Base64 data URI (if preferDataUri was true)
}
```

---

## Complete Context Payload Example

```json
{
  "page": {
    "url": "https://example.com/article",
    "title": "Example Article Title",
    "viewport": {
      "width": 800,
      "height": 600
    },
    "timestamp": "2025-11-03T12:00:00.000Z"
  },
  "content": {
    "semantic": {
      "mainContent": "Main article content here...",
      "articles": [
        {
          "title": "Article Title",
          "content": "Article content...",
          "url": "https://example.com/article"
        }
      ],
      "sections": [
        {
          "heading": "Introduction",
          "content": "Introduction content...",
          "level": 2
        }
      ],
      "structuredData": {
        "@type": "Article",
        "headline": "Example Article"
      }
    },
    "ocr": {
      "text": "Raw OCR text with artifacts...",
      "cleaned": "Cleaned OCR text without artifacts",
      "confidence": 0.85,
      "artifacts": ["common_ocr_artifact_1"]
    },
    "metadata": {
      "title": "Example Article Title",
      "description": "Article description",
      "headings": ["Main Heading", "Subheading 1", "Subheading 2"]
    }
  },
  "analysis": {
    "pageType": "article",
    "keyTopics": ["AI", "Machine Learning", "Technology"],
    "suggestedActions": [
      {
        "label": "Read Full Article",
        "description": "Continue reading the full article",
        "type": "link"
      }
    ],
    "confidence": 0.85,
    "pagePurpose": "Informational article about AI",
    "sentiment": "positive",
    "analysisMethod": "llm",
    "visualSummary": {
      "layout": "article",
      "keyElements": ["header", "content", "sidebar"],
      "designStyle": "modern",
      "colorScheme": "light",
      "visualHierarchy": "clear",
      "confidence": 0.8
    }
  },
  "interactive": {
    "buttons": [
      {
        "text": "Subscribe",
        "purpose": "Newsletter subscription",
        "state": "enabled",
        "location": {
          "x": 100,
          "y": 200,
          "visible": true
        },
        "importance": 0.9
      }
    ],
    "forms": [
      {
        "fields": [
          {
            "name": "email",
            "type": "email",
            "required": true,
            "label": "Email Address"
          }
        ],
        "action": "/subscribe",
        "method": "POST"
      }
    ],
    "links": [
      {
        "text": "Read More",
        "url": "/article/full",
        "purpose": "Continue reading",
        "visible": true
      }
    ]
  },
  "tooltipHistory": [
    {
      "url": "https://example.com",
      "timestamp": "2025-11-03T11:55:00.000Z",
      "type": "hover",
      "element": "link"
    }
  ],
  "mcpResource": {
    "uri": "tooltip://context/https%3A%2F%2Fexample.com%2Farticle",
    "mimeType": "application/json",
    "timestamp": "2025-11-03T12:00:00.000Z"
  }
}
```

---

## Legacy Compatibility

### Migration from Old Format

The old format used ad-hoc structures. Migration helpers are provided:

**Old Format:**
```javascript
{
  url: "https://example.com",
  screenshotUrl: "https://...",
  analysis: { pageType: "article", ... },
  text: "OCR text...",
  timestamp: "2025-11-03T12:00:00Z"
}
```

**New Format (ContextPayload):**
```javascript
{
  page: {
    url: "https://example.com",
    title: "...",
    viewport: { width: 800, height: 600 },
    timestamp: "2025-11-03T12:00:00Z"
  },
  content: {
    ocr: { text: "OCR text...", confidence: 0.85 },
    metadata: { title: "...", headings: [...] }
  },
  analysis: { pageType: "article", ... },
  // ... rest of structure
}
```

### Migration Helper Functions

```javascript
/**
 * Migrate old context format to new ContextPayload format
 * @param {Object} oldContext - Old context format
 * @returns {ContextPayload} Standardized context payload
 */
function migrateToContextPayload(oldContext) {
  return {
    page: {
      url: oldContext.url,
      title: oldContext.title || '',
      viewport: oldContext.viewport || { width: 800, height: 600 },
      timestamp: oldContext.timestamp || new Date().toISOString()
    },
    content: {
      ocr: {
        text: oldContext.text || oldContext.ocrText || '',
        confidence: oldContext.ocrConfidence || 0.7,
        cleaned: oldContext.cleanedText
      },
      metadata: {
        title: oldContext.title || '',
        description: oldContext.description || '',
        headings: oldContext.headings || []
      },
      semantic: oldContext.semantic || undefined
    },
    analysis: oldContext.analysis || {
      pageType: 'unknown',
      keyTopics: [],
      suggestedActions: [],
      confidence: 0
    },
    interactive: oldContext.interactive,
    tooltipHistory: oldContext.tooltipHistory,
    mcpResource: oldContext.mcpResource
  };
}
```

---

## Usage Guidelines

### 1. Always Use Standardized Structure

When creating context payloads, always use the `ContextPayload` interface:

```javascript
// ✅ Good
const context = {
  page: { url, title, viewport, timestamp },
  content: { ocr, metadata, semantic },
  analysis: { pageType, keyTopics, suggestedActions, confidence },
  // ...
};

// ❌ Bad
const context = {
  url,
  screenshotUrl,
  analysis,
  text
};
```

### 2. Include Screenshot Data Separately

Screenshot data should be included alongside the context payload, not inside it:

```javascript
const response = {
  ...screenshotData, // screenshotUrl, screenshotDataUri, etc.
  context: contextPayload // Full ContextPayload structure
};
```

### 3. Handle Optional Fields Gracefully

Always check for optional fields before accessing:

```javascript
if (context.interactive?.buttons?.length > 0) {
  // Use buttons
}

if (context.analysis?.visualSummary?.confidence > 0.8) {
  // Use visual summary
}
```

### 4. Validate Required Fields

Ensure required fields are present:

```javascript
function validateContextPayload(context) {
  if (!context.page?.url) throw new Error('Missing page.url');
  if (!context.content?.ocr?.text) throw new Error('Missing content.ocr.text');
  if (!context.analysis?.pageType) throw new Error('Missing analysis.pageType');
  return true;
}
```

---

## File Locations

These schemas are implemented in:

- **Client-side**: `content.js` - Context building functions
- **Background**: `background.js` - Context processing and forwarding
- **Backend**: `playwright_service/mcp-server.js` - Context payload construction
- **Backend**: `playwright_service/server.js` - Context data extraction

---

## Version History

### Version 1.0.0 (2025-11-03)
- Initial standardized schema
- Full TypeScript/JSDoc definitions
- Migration helpers for backward compatibility
- Complete examples and usage guidelines

---

**Document Status:** Production Ready  
**Maintained By:** Tooltip Companion Development Team  
**Related Documents:** `MCP_SPECIFICATION.md`, `MCP_AI_EXPANSION_STRATEGIC_PLAN.md`

