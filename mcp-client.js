// mcp-client.js - MCP Client Library for Tooltip Companion Extension
// Implements JSON-RPC 2.0 over Streamable HTTP (SSE support)

class MCPClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.requestId = 0;
        this.sessionId = null;
        this.initialized = false;
        this.pendingRequests = new Map();
        
        // SSE connection for streaming responses
        this.eventSource = null;
        this.streamingEnabled = false;
    }

    /**
     * Initialize MCP connection with server
     * @returns {Promise<Object>} Server capabilities and protocol info
     */
    async initialize() {
        if (this.initialized) {
            console.log('✅ MCP already initialized');
            return { initialized: true };
        }

        try {
            console.log('🔌 MCP: Starting initialization...');
            console.log('🔌 MCP: Base URL:', this.baseUrl);
            
            const response = await this.call('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: {
                        listChanged: true
                    },
                    sampling: {}
                },
                clientInfo: {
                    name: 'tooltip-companion-extension',
                    version: '1.4.1'
                }
            });

            console.log('🔌 MCP: Initialize response received:', {
                hasServerInfo: !!response.serverInfo,
                hasCapabilities: !!response.capabilities,
                protocolVersion: response.protocolVersion
            });

            // Store session info from initialize response
            if (response.serverInfo) {
                this.sessionId = response.serverInfo?.sessionId || null;
                console.log('🔌 MCP: Session ID:', this.sessionId);
            }

            // Send initialized notification
            console.log('🔌 MCP: Sending initialized notification...');
            await this.notify('initialized', {});

            this.initialized = true;
            console.log('✅ MCP: Initialization complete');
            return response;
        } catch (error) {
            console.error('❌ MCP initialization failed:', error);
            console.error('❌ MCP initialization error details:', {
                message: error.message,
                name: error.name,
                code: error.code,
                stack: error.stack?.substring(0, 500)
            });
            throw error;
        }
    }

    /**
     * Send JSON-RPC 2.0 request
     * @param {string} method - MCP method name
     * @param {Object} params - Method parameters
     * @returns {Promise<Object>} Response result
     */
    async call(method, params = {}) {
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params: params || {}
        };

        // Store pending request for response matching
        const pendingPromise = new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject, timestamp: Date.now() });
        });

        try {
            console.log(`🔌 MCP: Sending ${method} request (id: ${id}) to ${this.baseUrl}/mcp`);
            const response = await fetch(`${this.baseUrl}/mcp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(request)
            });

            console.log(`🔌 MCP: Response status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                    console.error('🔌 MCP: Error response body:', errorText);
                } catch (e) {
                    // Ignore
                }
                const error = new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText.substring(0, 200)}` : ''}`);
                error.statusCode = response.status;
                throw error;
            }

            const data = await response.json();
            console.log(`🔌 MCP: Response data:`, {
                hasResult: !!data.result,
                hasError: !!data.error,
                jsonrpc: data.jsonrpc,
                id: data.id
            });

            // Handle JSON-RPC 2.0 response
            if (data.error) {
                console.error('🔌 MCP: JSON-RPC error:', data.error);
                const error = new Error(data.error.message || 'MCP error');
                error.code = data.error.code;
                error.data = data.error.data;
                throw error;
            }

            // Resolve pending request
            if (this.pendingRequests.has(id)) {
                this.pendingRequests.get(id).resolve(data.result);
                this.pendingRequests.delete(id);
            }

            return data.result || {};
        } catch (error) {
            console.error(`🔌 MCP: Request failed for ${method}:`, error);
            // Reject pending request
            if (this.pendingRequests.has(id)) {
                this.pendingRequests.get(id).reject(error);
                this.pendingRequests.delete(id);
            }
            throw error;
        }
    }

    /**
     * Send JSON-RPC 2.0 notification (no response expected)
     * @param {string} method - MCP method name
     * @param {Object} params - Method parameters
     */
    async notify(method, params = {}) {
        const request = {
            jsonrpc: '2.0',
            method,
            params: params || {}
        };

        try {
            await fetch(`${this.baseUrl}/mcp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });
        } catch (error) {
            console.warn('⚠️ MCP notification failed (non-critical):', error);
        }
    }

    /**
     * Call an MCP Tool
     * @param {string} toolName - Name of the tool to call
     * @param {Object} arguments_ - Tool arguments
     * @returns {Promise<Object>} Tool result
     */
    async callTool(toolName, arguments_ = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        return await this.call('tools/call', {
            name: toolName,
            arguments: arguments_
        });
    }

    /**
     * List available MCP Tools
     * @returns {Promise<Array>} List of available tools
     */
    async listTools() {
        if (!this.initialized) {
            await this.initialize();
        }

        const response = await this.call('tools/list');
        return response.tools || [];
    }

    /**
     * List available MCP Resources
     * @returns {Promise<Array>} List of available resources
     */
    async listResources() {
        if (!this.initialized) {
            await this.initialize();
        }

        const response = await this.call('resources/list');
        return response.resources || [];
    }

    /**
     * Read an MCP Resource
     * @param {string} uri - Resource URI
     * @returns {Promise<Object>} Resource data
     */
    async readResource(uri, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        return await this.call('resources/read', { uri, options });
    }

    /**
     * List available MCP Prompts
     * @returns {Promise<Array>} List of available prompts
     */
    async listPrompts() {
        if (!this.initialized) {
            await this.initialize();
        }

        const response = await this.call('prompts/list');
        return response.prompts || [];
    }

    /**
     * Get an MCP Prompt
     * @param {string} name - Prompt name
     * @param {Object} arguments_ - Prompt arguments
     * @returns {Promise<Object>} Prompt result
     */
    async getPrompt(name, arguments_ = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        return await this.call('prompts/get', {
            name,
            arguments: arguments_
        });
    }

    /**
     * Cleanup and close connection
     */
    cleanup() {
        // Clear pending requests
        this.pendingRequests.forEach(({ reject }) => {
            reject(new Error('Connection closed'));
        });
        this.pendingRequests.clear();

        // Close SSE connection if open
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        this.initialized = false;
        this.sessionId = null;
    }
}

// Export MCPClient to the appropriate global scope based on environment
// This ensures compatibility across different JavaScript contexts:
// - Service Workers: use 'self' (no 'window' available)
// - Browser/Content Scripts: use 'window'
// - Node.js: use 'global'

const globalScope = (function() {
    // Detect the appropriate global scope
    if (typeof self !== 'undefined') {
        return self; // Service Worker context (or Web Worker)
    } else if (typeof window !== 'undefined') {
        return window; // Browser/DOM context
    } else if (typeof global !== 'undefined') {
        return global; // Node.js context
    }
    return {}; // Fallback for unknown environments
})();

// Export to global scope
globalScope.MCPClient = MCPClient;

// Export for Node.js CommonJS modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MCPClient;
}

