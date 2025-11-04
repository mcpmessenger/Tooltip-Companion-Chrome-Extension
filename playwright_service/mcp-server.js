// mcp-server.js - MCP Server Implementation for Tooltip Companion Backend
// Implements JSON-RPC 2.0 server with MCP protocol support

class MCPServer {
    constructor(captureHandler, chatHandler, ocrHandler, analysisHandler, summarizeHandler = null, safetyHandler = null) {
        // Store handlers for backend functionality
        this.captureHandler = captureHandler;
        this.chatHandler = chatHandler;
        this.ocrHandler = ocrHandler;
        this.analysisHandler = analysisHandler;
        this.summarizeHandler = summarizeHandler;
        this.safetyHandler = safetyHandler;

        // Session management
        this.sessions = new Map();
        
        // Tool definitions
        this.tools = [
            {
                name: 'capture_screenshot',
                description: 'Capture a screenshot of a web page using Playwright',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'The URL of the page to capture'
                        },
                        preferDataUri: {
                            type: 'boolean',
                            description: 'Return screenshot as data URI (for CSP-restricted pages)'
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'chat',
                description: 'Send a chat message with context-aware AI assistance',
                inputSchema: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string',
                            description: 'The chat message from the user'
                        },
                        currentUrl: {
                            type: 'string',
                            description: 'The current page URL for context'
                        },
                        openaiKey: {
                            type: 'string',
                            description: 'Optional OpenAI API key (if not using backend key)'
                        },
                        tooltipHistory: {
                            type: 'array',
                            description: 'Recent tooltip events for context'
                        }
                    },
                    required: ['message']
                }
            },
            {
                name: 'ocr_upload',
                description: 'Extract text from an image using OCR',
                inputSchema: {
                    type: 'object',
                    properties: {
                        image: {
                            type: 'string',
                            description: 'Base64 encoded image data'
                        }
                    },
                    required: ['image']
                }
            },
            {
                name: 'analyze_page',
                description: 'Get page analysis for a previously captured URL',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'The URL to analyze'
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'summarize_page',
                description: 'Generate a concise summary of a page for chat display (targets ~20 words but allows natural completion)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'The URL to summarize'
                        },
                        maxLength: {
                            type: 'number',
                            description: 'Maximum summary length in characters (flexible, allows natural completion)',
                            default: 500
                        },
                        targetWords: {
                            type: 'number',
                            description: 'Target word count for summary (default: 20, but allows natural completion up to ~100 words)',
                            default: 20
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'check_link_safety',
                description: 'Analyze link safety and relevance',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'The URL to check'
                        },
                        context: {
                            type: 'object',
                            description: 'Current page context for comparison'
                        }
                    },
                    required: ['url']
                }
            }
        ];

        // Resource definitions
        this.resources = [
            {
                uri: 'tooltip://context',
                name: 'Tooltip Context',
                description: 'Current tooltip browsing context',
                mimeType: 'application/json'
            },
            {
                uri: 'tooltip://summary/{url}',
                name: 'Page Summary',
                description: 'Cached page summary for a URL',
                mimeType: 'application/json'
            }
        ];

        // Prompt definitions
        this.prompts = [
            {
                name: 'analyze_page_context',
                description: 'Analyze the current page context and provide insights',
                arguments: [
                    {
                        name: 'url',
                        description: 'The URL to analyze',
                        required: true
                    }
                ]
            },
            {
                name: 'suggest_actions',
                description: 'Generate contextual action suggestions based on current page and hovered element',
                arguments: [
                    {
                        name: 'url',
                        description: 'The URL of the current page',
                        required: true
                    },
                    {
                        name: 'context',
                        description: 'Current page context (optional)',
                        required: false
                    }
                ]
            }
        ];
    }

    /**
     * Handle incoming JSON-RPC 2.0 request
     * @param {Object} request - JSON-RPC 2.0 request object
     * @returns {Promise<Object>} JSON-RPC 2.0 response
     */
    async handleRequest(request) {
        const { jsonrpc, id, method, params } = request;

        console.log(`🔌 MCP Server: Handling ${method} request (id: ${id})`);

        // Validate JSON-RPC 2.0 request
        if (jsonrpc !== '2.0') {
            console.error('❌ MCP Server: Invalid jsonrpc version:', jsonrpc);
            return {
                jsonrpc: '2.0',
                id: id || null,
                error: {
                    code: -32600,
                    message: 'Invalid Request',
                    data: 'jsonrpc must be "2.0"'
                }
            };
        }

        // Handle notifications (no id)
        if (id === undefined) {
            console.log(`🔌 MCP Server: Processing notification: ${method}`);
            await this.handleNotification(method, params);
            return null; // Notifications don't return responses
        }

        try {
            let result;

            // Route MCP methods
            console.log(`🔌 MCP Server: Routing to ${method} handler`);
            switch (method) {
                case 'initialize':
                    result = await this.handleInitialize(params);
                    break;

                case 'tools/list':
                    result = await this.handleToolsList();
                    break;

                case 'tools/call':
                    result = await this.handleToolCall(params);
                    break;

                case 'resources/list':
                    result = await this.handleResourcesList();
                    break;

                case 'resources/read':
                    // Handle summary resource separately
                    if (params.uri && params.uri.startsWith('tooltip://summary/')) {
                        result = await this.handleSummaryResourceRead(params);
                    } else {
                        result = await this.handleResourceRead(params);
                    }
                    break;

                case 'prompts/list':
                    result = await this.handlePromptsList();
                    break;

                case 'prompts/get':
                    result = await this.handlePromptGet(params);
                    break;

                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            return {
                jsonrpc: '2.0',
                id,
                result
            };
        } catch (error) {
            console.error(`❌ MCP method error (${method}):`, error);
            
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: error.code || -32603,
                    message: error.message || 'Internal error',
                    data: error.data || null
                }
            };
        }
    }

    /**
     * Handle notification (no response expected)
     */
    async handleNotification(method, params) {
        switch (method) {
            case 'initialized':
                // Client has finished initialization
                console.log('✅ MCP client initialized');
                break;
            
            default:
                console.log(`📨 MCP notification received: ${method}`);
        }
    }

    /**
     * Handle initialize request
     */
    async handleInitialize(params) {
        const { protocolVersion, capabilities, clientInfo } = params;
        
        // Generate session ID
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.sessions.set(sessionId, {
            clientInfo,
            capabilities,
            createdAt: Date.now()
        });

        console.log(`🚀 MCP client initializing: ${clientInfo?.name} v${clientInfo?.version}`);

        return {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {},
                resources: {},
                prompts: {}
            },
            serverInfo: {
                name: 'tooltip-companion-mcp-server',
                version: '1.0.0',
                sessionId
            }
        };
    }

    /**
     * Handle tools/list request
     */
    async handleToolsList() {
        return {
            tools: this.tools
        };
    }

    /**
     * Handle tools/call request
     */
    async handleToolCall(params) {
        const { name, arguments: args } = params;

        if (!name) {
            throw new Error('Tool name is required');
        }

        // Route to appropriate handler
        switch (name) {
            case 'capture_screenshot':
                if (!this.captureHandler) {
                    throw new Error('Capture handler not available');
                }
                const captureResult = await this.captureHandler(args.url, {
                    includeDataUri: !!args.preferDataUri
                });
                const screenshotUrl = captureResult?.screenshotUrl || captureResult?.dataUri || null;
                const screenshotDataUri = captureResult?.dataUri || (screenshotUrl && screenshotUrl.startsWith('data:image/') ? screenshotUrl : null);
                
                // Phase 1: Standardized Context Payload Structure
                // Phase 2: Include semantic HTML content
                const contextPayload = {
                    page: {
                        url: args.url,
                        title: captureResult?.title || captureResult?.analysis?.htmlMetadata?.title || '',
                        viewport: captureResult?.viewport || { width: 800, height: 600 },
                        timestamp: new Date().toISOString()
                    },
                    content: {
                        ocr: {
                            text: captureResult?.text || captureResult?.ocrData?.text || '',
                            cleaned: captureResult?.ocrData?.cleaned || captureResult?.text || '',
                            confidence: captureResult?.ocrData?.confidence || 0.7,
                            artifacts: captureResult?.ocrData?.artifacts || []
                        },
                        metadata: {
                            title: captureResult?.title || captureResult?.analysis?.htmlMetadata?.title || '',
                            description: captureResult?.description || captureResult?.analysis?.htmlMetadata?.metaDescription || '',
                            headings: captureResult?.headings || captureResult?.analysis?.htmlMetadata?.h1Tags || []
                        },
                        semantic: captureResult?.semantic || undefined // Phase 2: Semantic HTML content
                    },
                    analysis: captureResult?.analysis || {
                        pageType: 'unknown',
                        keyTopics: [],
                        suggestedActions: [],
                        confidence: 0
                    },
                    interactive: captureResult?.interactive || undefined // Phase 2: Interactive elements
                };
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                // Screenshot data (backward compatibility)
                                screenshot: captureResult?.dataUri || screenshotUrl,
                                screenshotUrl: screenshotUrl,
                                originalScreenshotUrl: captureResult?.originalUrl || screenshotUrl,
                                screenshotDataUri,
                                // Standardized context payload
                                context: contextPayload,
                                // Legacy fields (for backward compatibility)
                                url: args.url,
                                analysis: contextPayload.analysis,
                                text: contextPayload.content.ocr.text,
                                timestamp: contextPayload.page.timestamp
                            })
                        }
                    ]
                };

            case 'chat':
                if (!this.chatHandler) {
                    throw new Error('Chat handler not available');
                }
                const chatResponse = await this.chatHandler({
                    message: args.message,
                    currentUrl: args.currentUrl || args.url,
                    openaiKey: args.openaiKey,
                    tooltipHistory: args.tooltipHistory,
                    tooltipContexts: args.tooltipContexts,
                    chatHistory: args.chatHistory || []
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(chatResponse)
                        }
                    ]
                };

            case 'ocr_upload':
                if (!this.ocrHandler) {
                    throw new Error('OCR handler not available');
                }
                const ocrResult = await this.ocrHandler(args.image);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(ocrResult)
                        }
                    ]
                };

            case 'analyze_page':
                if (!this.analysisHandler) {
                    throw new Error('Analysis handler not available');
                }
                const analysis = await this.analysisHandler(args.url);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(analysis)
                        }
                    ]
                };

            case 'summarize_page':
                // Phase 3: Page summarization
                if (!this.summarizeHandler) {
                    throw new Error('Summarize handler not available');
                }
                const summarizeResult = await this.summarizeHandler(args, args.openaiKey);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(summarizeResult)
                        }
                    ]
                };

            case 'check_link_safety':
                // Phase 3: Link safety check
                if (!this.safetyHandler) {
                    throw new Error('Safety handler not available');
                }
                const safetyResult = await this.safetyHandler(args, args.openaiKey);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(safetyResult)
                        }
                    ]
                };

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    /**
     * Handle resources/list request
     */
    async handleResourcesList() {
        return {
            resources: this.resources
        };
    }

    /**
     * Handle summary resource read (Phase 3)
     */
    async handleSummaryResourceRead(params) {
        const { uri, options } = params || {};
        
        if (uri && uri.startsWith('tooltip://summary/')) {
            try {
                const encodedUrl = uri.replace('tooltip://summary/', '');
                const url = decodeURIComponent(encodedUrl);
                
                console.log(`🔌 MCP Summary Resource Read: Fetching summary for ${url}`);
                
                if (!this.summarizeHandler) {
                    throw new Error('Summarize handler not available');
                }
                
                const summaryResult = await this.summarizeHandler({ url, maxLength: 300 }, null);
                
                return {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                        type: 'page_summary',
                        url: url,
                        summary: summaryResult.summary,
                        confidence: summaryResult.confidence,
                        method: summaryResult.method,
                        timestamp: new Date().toISOString()
                    })
                };
            } catch (error) {
                console.error(`❌ MCP Summary Resource Read error for ${uri}:`, error.message);
                return {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                        type: 'page_summary',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }
        
        return {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
                type: 'page_summary',
                error: 'Invalid summary URI format',
                timestamp: new Date().toISOString()
            })
        };
    }

    async handleResourceRead(params) {
        const { uri, options } = params || {};
        
        // Phase 1: Extract URL from MCP Resource URI (format: tooltip://context/{url})
        if (uri && uri.startsWith('tooltip://context/')) {
            try {
                const encodedUrl = uri.replace('tooltip://context/', '');
                const url = decodeURIComponent(encodedUrl);
                const preferDataUri = !!(options?.preferDataUri);

                console.log(`🔌 MCP Resource Read: Fetching context for ${url}`);

                // Use handlers to get full context
                if (!this.captureHandler) {
                    throw new Error('Capture handler not available');
                }

                // Capture screenshot and get analysis
                const captureResult = await this.captureHandler(url, {
                    includeDataUri: preferDataUri
                });
                const screenshotUrl = captureResult?.screenshotUrl || captureResult?.dataUri || null;
                const screenshotDataUri = captureResult?.dataUri || (screenshotUrl && screenshotUrl.startsWith('data:image/') ? screenshotUrl : null);
                const finalScreenshot = preferDataUri && screenshotDataUri ? screenshotDataUri : screenshotUrl;

                // Get analysis from cache (captureHandler should have cached it)
                let analysis = {
                    pageType: 'unknown',
                    keyTopics: [],
                    suggestedActions: [],
                    confidence: 0
                };
                
                if (this.analysisHandler) {
                    try {
                        const analysisResult = await this.analysisHandler(url);
                        // analysisHandler returns { analysis, ... } or just analysis
                        if (analysisResult && analysisResult.analysis) {
                            analysis = analysisResult.analysis;
                        } else if (analysisResult && analysisResult.pageType) {
                            // analysisResult IS the analysis object
                            analysis = analysisResult;
                        } else if (analysisResult && !analysisResult.error) {
                            // Use result as-is if it looks like analysis
                            analysis = analysisResult;
                        }
                    } catch (e) {
                        console.warn('⚠️ Analysis handler failed, using default:', e.message);
                    }
                }
                
                // Structure response as MCP Resource with standardized ContextPayload
                // Phase 1: Standardized Context Payload Structure
                const contextPayload = {
                    page: {
                        url: url,
                        title: captureResult?.title || '',
                        viewport: captureResult?.viewport || { width: 800, height: 600 },
                        timestamp: new Date().toISOString()
                    },
                    content: {
                        ocr: {
                            text: captureResult?.text || captureResult?.ocrData?.text || '',
                            cleaned: captureResult?.ocrData?.cleaned || captureResult?.text || '',
                            confidence: captureResult?.ocrData?.confidence || 0.7,
                            artifacts: captureResult?.ocrData?.artifacts || []
                        },
                        metadata: {
                            title: captureResult?.title || '',
                            description: captureResult?.description || '',
                            headings: captureResult?.headings || []
                        },
                        semantic: captureResult?.semantic || undefined
                    },
                    analysis: captureResult?.analysis || analysis,
                    interactive: captureResult?.interactive || undefined,
                    mcpResource: {
                        uri: uri,
                        mimeType: 'application/json',
                        timestamp: new Date().toISOString()
                    }
                };

                // Include screenshot data separately (for backward compatibility)
                return {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                        // Screenshot data (backward compatibility)
                        screenshotUrl: finalScreenshot,
                        screenshot: finalScreenshot,
                        originalScreenshotUrl: captureResult?.originalUrl || screenshotUrl,
                        screenshotDataUri,
                        // Standardized context payload
                        context: contextPayload,
                        // Legacy fields (for backward compatibility)
                        type: 'tooltip_context',
                        url: url,
                        analysis: contextPayload.analysis,
                        text: contextPayload.content.ocr.text,
                        timestamp: contextPayload.page.timestamp
                    })
                };
            } catch (error) {
                console.error(`❌ MCP Resource Read error for ${uri}:`, error.message);
                // Return error structure
                return {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                        type: 'tooltip_context',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }
        
        // Fallback: Return basic context structure for other URIs
        return {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
                type: 'tooltip_context',
                timestamp: new Date().toISOString()
            })
        };
    }

    /**
     * Handle prompts/list request
     */
    async handlePromptsList() {
        return {
            prompts: this.prompts
        };
    }

    /**
     * Handle prompts/get request
     */
    async handlePromptGet(params) {
        const { name, arguments: args } = params;

        switch (name) {
            case 'analyze_page_context':
                if (!this.analysisHandler) {
                    throw new Error('Analysis handler not available');
                }
                const analysis = await this.analysisHandler(args.url);
                return {
                    description: `Analysis for ${args.url}`,
                    messages: [
                        {
                            role: 'user',
                            content: {
                                type: 'text',
                                text: `Analyze this page: ${args.url}`
                            }
                        },
                        {
                            role: 'assistant',
                            content: {
                                type: 'text',
                                text: JSON.stringify(analysis, null, 2)
                            }
                        }
                    ]
                };

            case 'suggest_actions':
                // Phase 3: Generate action suggestions
                if (!this.captureHandler) {
                    throw new Error('Capture handler not available');
                }
                
                try {
                    // Get page context
                    const captureResult = await this.captureHandler(args.url, { includeDataUri: false });
                    const context = args.context || {};
                    
                    // Generate suggestions based on page analysis and interactive elements
                    const suggestions = generateActionSuggestions(captureResult, context);
                    
                    return {
                        description: `Action suggestions for ${args.url}`,
                        messages: [
                            {
                                role: 'user',
                                content: {
                                    type: 'text',
                                    text: `Based on this page, what actions can I take?`
                                }
                            },
                            {
                                role: 'assistant',
                                content: {
                                    type: 'text',
                                    text: JSON.stringify(suggestions, null, 2)
                                }
                            }
                        ]
                    };
                } catch (error) {
                    throw new Error(`Failed to generate action suggestions: ${error.message}`);
                }

            default:
                throw new Error(`Unknown prompt: ${name}`);
        }
    }
}

/**
 * Generate action suggestions from page context (Phase 3)
 */
function generateActionSuggestions(captureResult, context) {
    const suggestions = [];
    
    // From analysis suggested actions
    if (captureResult?.analysis?.suggestedActions) {
        captureResult.analysis.suggestedActions.forEach((action, idx) => {
            suggestions.push({
                type: 'action',
                label: typeof action === 'string' ? action : action.label || `Action ${idx + 1}`,
                description: typeof action === 'object' ? action.description : '',
                source: 'analysis'
            });
        });
    }
    
    // From interactive elements
    if (captureResult?.interactive) {
        // Top 3 most important buttons
        if (captureResult.interactive.buttons) {
            captureResult.interactive.buttons
                .slice(0, 3)
                .forEach(button => {
                    suggestions.push({
                        type: 'button',
                        label: button.text,
                        description: button.purpose || `Click ${button.text}`,
                        source: 'interactive'
                    });
                });
        }
        
        // Form actions
        if (captureResult.interactive.forms && captureResult.interactive.forms.length > 0) {
            captureResult.interactive.forms.forEach(form => {
                suggestions.push({
                    type: 'form',
                    label: `Submit ${form.action || 'form'}`,
                    description: `Form with ${form.fields.length} field(s)`,
                    source: 'interactive'
                });
            });
        }
    }
    
    // Generic suggestions based on page type
    if (captureResult?.analysis?.pageType) {
        const pageType = captureResult.analysis.pageType.toLowerCase();
        
        if (pageType === 'article' || pageType === 'blog') {
            suggestions.push({
                type: 'suggestion',
                label: 'Read the full article',
                description: 'Continue reading the complete content',
                source: 'page_type'
            });
        }
        
        if (pageType === 'product') {
            suggestions.push({
                type: 'suggestion',
                label: 'View product details',
                description: 'Learn more about this product',
                source: 'page_type'
            });
        }
    }
    
    // Limit to 5 suggestions
    return suggestions.slice(0, 5);
}

module.exports = MCPServer;

