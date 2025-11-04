/**
 * @fileoverview Context Payload Type Definitions
 * Standardized data structures for Tooltip Companion extension
 * @version 1.0.0
 */

/**
 * @typedef {Object} ContextPayload
 * @property {PageMetadata} page - Page metadata information
 * @property {ContentData} content - Content data extracted from the page
 * @property {PageAnalysis} analysis - AI analysis of the page
 * @property {InteractiveElements} [interactive] - Interactive elements on the page
 * @property {TooltipEvent[]} [tooltipHistory] - Tooltip event history
 * @property {MCPResourceMetadata} [mcpResource] - MCP Resource metadata (if applicable)
 */

/**
 * @typedef {Object} PageMetadata
 * @property {string} url - Page URL
 * @property {string} title - Page title
 * @property {{width: number, height: number}} viewport - Viewport dimensions
 * @property {string} timestamp - ISO 8601 timestamp
 */

/**
 * @typedef {Object} ContentData
 * @property {SemanticContent} [semantic] - Semantic HTML extraction
 * @property {OCRData} ocr - OCR text extraction
 * @property {HTMLMetadata} metadata - HTML metadata
 */

/**
 * @typedef {Object} SemanticContent
 * @property {string} [mainContent] - Main content from <main> or <article>
 * @property {ArticleContent[]} [articles] - Array of article elements
 * @property {SectionContent[]} [sections] - Array of section elements
 * @property {Object<string, *>} [structuredData] - JSON-LD, microdata, etc.
 */

/**
 * @typedef {Object} ArticleContent
 * @property {string} title - Article title
 * @property {string} content - Article content
 * @property {string} [url] - Article URL
 */

/**
 * @typedef {Object} SectionContent
 * @property {string} heading - Section heading
 * @property {string} content - Section content
 * @property {number} [level] - Heading level (1-6)
 */

/**
 * @typedef {Object} OCRData
 * @property {string} text - Raw OCR text
 * @property {string} [cleaned] - Preprocessed/cleaned OCR text
 * @property {number} confidence - OCR confidence (0-1)
 * @property {string[]} [artifacts] - Known OCR artifacts/failures
 */

/**
 * @typedef {Object} HTMLMetadata
 * @property {string} title - Page title
 * @property {string} [description] - Meta description
 * @property {string[]} headings - Array of h1-h6 headings
 */

/**
 * @typedef {Object} PageAnalysis
 * @property {string} pageType - Type of page (e.g., "article", "product", "homepage", "unknown")
 * @property {string[]} keyTopics - Array of key topics identified
 * @property {Action[]} suggestedActions - Suggested actions for the user
 * @property {number} confidence - Analysis confidence (0-1)
 * @property {string} [pagePurpose] - Purpose of the page
 * @property {'positive'|'neutral'|'negative'} [sentiment] - Sentiment analysis
 * @property {'llm'|'keyword'|'vision'|'hybrid'} [analysisMethod] - Analysis method used
 * @property {VisualSummary} [visualSummary] - Visual analysis from vision model
 * @property {HTMLMetadata} [htmlMetadata] - HTML metadata (legacy)
 */

/**
 * @typedef {Object} VisualSummary
 * @property {string} layout - Page layout description
 * @property {string[]} keyElements - Key visual elements
 * @property {string} designStyle - Design style
 * @property {string} colorScheme - Color scheme
 * @property {string} visualHierarchy - Visual hierarchy description
 * @property {number} confidence - Visual analysis confidence (0-1)
 */

/**
 * @typedef {Object} Action
 * @property {string} label - Action label/text
 * @property {string} [description] - Action description
 * @property {string} [type] - Action type (e.g., "button", "link", "form")
 */

/**
 * @typedef {Object} InteractiveElements
 * @property {ButtonElement[]} buttons - Button elements
 * @property {FormElement[]} forms - Form elements
 * @property {LinkElement[]} links - Link elements
 */

/**
 * @typedef {Object} ButtonElement
 * @property {string} text - Button text
 * @property {string} [purpose] - Computed purpose/context
 * @property {'enabled'|'disabled'|'hidden'} state - Button state
 * @property {{x: number, y: number, visible: boolean}} location - Button location
 * @property {number} importance - Importance score (0-1)
 */

/**
 * @typedef {Object} FormElement
 * @property {FormField[]} fields - Form fields
 * @property {string} [action] - Form action URL
 * @property {string} [method] - Form method (GET, POST, etc.)
 */

/**
 * @typedef {Object} FormField
 * @property {string} name - Field name
 * @property {string} type - Input type
 * @property {boolean} required - Whether field is required
 * @property {string} [label] - Field label
 */

/**
 * @typedef {Object} LinkElement
 * @property {string} text - Link text
 * @property {string} url - Link URL
 * @property {string} [purpose] - Link purpose/context
 * @property {boolean} visible - Whether link is visible
 */

/**
 * @typedef {Object} TooltipEvent
 * @property {string} url - Event URL
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string} [type] - Event type (e.g., "hover", "click")
 * @property {string} [element] - Element type (e.g., "link", "button")
 */

/**
 * @typedef {Object} MCPResourceMetadata
 * @property {string} uri - Resource URI (e.g., "tooltip://context/{url}")
 * @property {string} mimeType - MIME type (e.g., "application/json")
 * @property {string} timestamp - ISO 8601 timestamp
 */

/**
 * @typedef {Object} ScreenshotData
 * @property {string} [screenshotUrl] - URL to screenshot
 * @property {string} [screenshot] - URL or data URI (alias for screenshotUrl)
 * @property {string} [originalScreenshotUrl] - Original URL before processing
 * @property {string} [screenshotDataUri] - Base64 data URI (if preferDataUri was true)
 */

/**
 * Migrate old context format to new ContextPayload format
 * @param {Object} oldContext - Old context format
 * @returns {ContextPayload} Standardized context payload
 */
function migrateToContextPayload(oldContext) {
  return {
    page: {
      url: oldContext.url || '',
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
      semantic: oldContext.semantic
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

/**
 * Validate ContextPayload structure
 * @param {ContextPayload} context - Context payload to validate
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
function validateContextPayload(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('Context payload must be an object');
  }
  if (!context.page || typeof context.page !== 'object') {
    throw new Error('Missing or invalid page metadata');
  }
  if (!context.page.url || typeof context.page.url !== 'string') {
    throw new Error('Missing page.url');
  }
  if (!context.content || typeof context.content !== 'object') {
    throw new Error('Missing or invalid content data');
  }
  if (!context.content.ocr || typeof context.content.ocr !== 'object') {
    throw new Error('Missing or invalid OCR data');
  }
  if (!context.content.ocr.text || typeof context.content.ocr.text !== 'string') {
    throw new Error('Missing content.ocr.text');
  }
  if (!context.analysis || typeof context.analysis !== 'object') {
    throw new Error('Missing or invalid analysis');
  }
  if (!context.analysis.pageType || typeof context.analysis.pageType !== 'string') {
    throw new Error('Missing analysis.pageType');
  }
  return true;
}

/**
 * Build a standardized ContextPayload from various data sources
 * @param {Object} params - Parameters for building context
 * @param {string} params.url - Page URL
 * @param {string} [params.title] - Page title
 * @param {Object} [params.viewport] - Viewport dimensions
 * @param {string} [params.ocrText] - OCR text
 * @param {Object} [params.analysis] - Page analysis
 * @param {Object} [params.semantic] - Semantic content
 * @param {Object} [params.interactive] - Interactive elements
 * @param {TooltipEvent[]} [params.tooltipHistory] - Tooltip history
 * @returns {ContextPayload} Standardized context payload
 */
function buildContextPayload(params) {
  const {
    url,
    title = '',
    viewport = { width: 800, height: 600 },
    ocrText = '',
    analysis = null,
    semantic = null,
    interactive = null,
    tooltipHistory = null
  } = params;

  return {
    page: {
      url,
      title,
      viewport,
      timestamp: new Date().toISOString()
    },
    content: {
      ocr: {
        text: ocrText,
        confidence: 0.7,
        cleaned: ocrText // Will be cleaned by backend processor
      },
      metadata: {
        title,
        description: '',
        headings: []
      },
      semantic: semantic || undefined
    },
    analysis: analysis || {
      pageType: 'unknown',
      keyTopics: [],
      suggestedActions: [],
      confidence: 0
    },
    interactive: interactive || undefined,
    tooltipHistory: tooltipHistory || undefined
  };
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    migrateToContextPayload,
    validateContextPayload,
    buildContextPayload
  };
}

// Export to global scope for browser use
if (typeof window !== 'undefined') {
  window.ContextPayloadTypes = {
    migrateToContextPayload,
    validateContextPayload,
    buildContextPayload
  };
}

// Export for service worker
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.ContextPayloadTypes = {
    migrateToContextPayload,
    validateContextPayload,
    buildContextPayload
  };
}

