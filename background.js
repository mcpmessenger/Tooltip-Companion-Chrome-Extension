// background.js - Service Worker for Tooltip Companion

// Import MCP Client (loaded via importScripts in service worker)
importScripts('mcp-client.js');

// Global MCP client instance (initialized on demand)
let mcpClient = null;
let useMCP = false; // Feature flag - can be toggled via storage

// Normalize backend URL (ensure proper formatting)
function normalizeBackendUrl(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('Backend URL is required');
    }
    // Remove trailing slashes and ensure it's a valid URL
    const normalized = url.trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Backend URL cannot be empty');
    }
    return normalized;
}

// Get MCPClient class from service worker global scope
// importScripts makes it available on 'self' in service workers
const MCPClientClass = typeof MCPClient !== 'undefined' ? MCPClient : (typeof self !== 'undefined' && self.MCPClient ? self.MCPClient : null);

// Initialize MCP client
async function initMCPClient(backendUrl) {
    if (!MCPClientClass) {
        console.error('❌ MCPClient not available - MCP features disabled');
        return false;
    }
    
    if (!mcpClient) {
        try {
            // Normalize backend URL before passing to MCP client
            const normalizedUrl = normalizeBackendUrl(backendUrl);
            console.log('🔌 Attempting to initialize MCP client with URL:', normalizedUrl);
            mcpClient = new MCPClientClass(normalizedUrl);
            
            // Set a timeout for initialization (10 seconds)
            const initPromise = mcpClient.initialize();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('MCP initialization timeout')), 10000);
            });
            
            await Promise.race([initPromise, timeoutPromise]);
            console.log('✅ MCP client initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ MCP initialization failed:', error);
            console.error('❌ MCP initialization error details:', {
                message: error.message,
                name: error.name,
                code: error.code,
                statusCode: error.statusCode,
                stack: error.stack?.substring(0, 300)
            });
            console.log('⚠️ Will fall back to REST API for this request');
            mcpClient = null;
            return false;
        }
    }
    return true;
}

// Get protocol preference from storage
function getProtocolPreference(callback) {
    chrome.storage.sync.get({ useMCP: false, backendUrl: 'https://backend.tooltipcompanion.com' }, (items) => {
        const backendUrl = items.backendUrl || 'https://backend.tooltipcompanion.com';
        // Ensure backend URL is properly formatted
        const normalizedUrl = backendUrl.trim().replace(/\/+$/, '') || 'https://backend.tooltipcompanion.com';
        callback(items.useMCP || false, normalizedUrl);
    });
}

// MCP-based screenshot capture
async function captureScreenshotMCP(backendUrl, url) {
    try {
        if (!mcpClient) {
            const initialized = await initMCPClient(backendUrl);
            if (!initialized) {
                throw new Error('MCP client initialization failed');
            }
        }
        
        const result = await mcpClient.callTool('capture_screenshot', { url });
        
        // Parse MCP tool result
        if (result && result.content && result.content.length > 0) {
            const resultData = JSON.parse(result.content[0].text);
            return {
                success: true,
                data: {
                    screenshot: resultData.screenshot,
                    url: resultData.url,
                    timestamp: resultData.timestamp
                }
            };
        }
        throw new Error('Invalid MCP response format');
    } catch (error) {
        console.error('❌ MCP capture error:', error);
        throw error;
    }
}

// REST-based screenshot capture (existing implementation)
async function captureScreenshotREST(backendUrl, url) {
    const normalizedUrl = normalizeBackendUrl(backendUrl);
    const res = await fetch(`${normalizedUrl}/capture`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
    });
    
    if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
            const errorJson = await res.json();
            errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch (e) {
            try {
                const errorText = await res.text();
                if (errorText) {
                    errorMessage = errorText.substring(0, 200);
                }
            } catch (e2) {}
        }
        const error = new Error(errorMessage);
        error.statusCode = res.status;
        throw error;
    }
    
    const data = await res.json();
    return { success: true, data };
}

// REST-based context fetch (consolidated endpoint - returns screenshot AND analysis)
async function fetchContextREST(backendUrl, url) {
    const normalizedUrl = normalizeBackendUrl(backendUrl);
    const res = await fetch(`${normalizedUrl}/context`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
    });
    
    if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
            const errorJson = await res.json();
            errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch (e) {
            try {
                const errorText = await res.text();
                if (errorText) {
                    errorMessage = errorText.substring(0, 200);
                }
            } catch (e2) {}
        }
        const error = new Error(errorMessage);
        error.statusCode = res.status;
        throw error;
    }
    
    const data = await res.json();
    return { success: true, data };
}

// MCP-based chat
async function chatMCP(backendUrl, message, currentUrl, url, openaiKey, tooltipHistory) {
    try {
        if (!mcpClient) {
            const initialized = await initMCPClient(backendUrl);
            if (!initialized) {
                throw new Error('MCP client initialization failed');
            }
        }
        
        console.log('🔌 MCP chat - calling tool with:', { message, currentUrl: currentUrl || url });
        const result = await mcpClient.callTool('chat', {
            message,
            currentUrl: currentUrl || url,
            openaiKey,
            tooltipHistory
        });
        
        console.log('🔌 MCP chat - raw result:', result);
        
        if (result && result.content && result.content.length > 0) {
            const resultData = JSON.parse(result.content[0].text);
            console.log('🔌 MCP chat - parsed data:', resultData);
            const reply = resultData.response || resultData.reply || 'No response';
            return { reply };
        }
        throw new Error('Invalid MCP response format: ' + JSON.stringify(result));
    } catch (error) {
        console.error('❌ MCP chat error:', error);
        console.error('❌ MCP chat error stack:', error.stack);
        throw error;
    }
}

// REST-based chat (existing implementation)
async function chatREST(backendUrl, message, currentUrl, url, openaiKey, tooltipHistory, consoleLogs, pageInfo) {
    const normalizedUrl = normalizeBackendUrl(backendUrl);
    const res = await fetch(`${normalizedUrl}/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message,
            url,
            currentUrl: currentUrl || url,
            consoleLogs,
            pageInfo,
            tooltipHistory,
            openaiKey
        })
    });
    
    if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
            const errorJson = await res.json();
            errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch (e) {
            errorMessage = res.statusText || errorMessage;
        }
        const error = new Error(errorMessage);
        error.statusCode = res.status;
        throw error;
    }
    
    const data = await res.json();
    return { reply: data.response || data.reply || 'No response' };
}

// MCP-based OCR
async function ocrUploadMCP(backendUrl, image) {
    try {
        if (!mcpClient) {
            const initialized = await initMCPClient(backendUrl);
            if (!initialized) {
                // Don't throw - let the caller handle fallback
                throw new Error('MCP client initialization failed - will fallback to REST');
            }
        }
        
        console.log('🔌 MCP OCR - calling tool (image length:', image ? image.length : 0, ')');
        const result = await mcpClient.callTool('ocr_upload', { image });
        
        console.log('🔌 MCP OCR - raw result:', result);
        
        if (result && result.content && result.content.length > 0) {
            const resultData = JSON.parse(result.content[0].text);
            console.log('🔌 MCP OCR - parsed data:', { 
                hasText: !!resultData.text, 
                charCount: resultData.characterCount,
                success: resultData.success 
            });
            return {
                success: true,
                text: resultData.text || '',
                characterCount: resultData.characterCount || 0,
                data: resultData
            };
        }
        throw new Error('Invalid MCP response format: ' + JSON.stringify(result));
    } catch (error) {
        console.error('❌ MCP OCR error:', error);
        console.error('❌ MCP OCR error stack:', error.stack);
        throw error;
    }
}

// REST-based OCR (existing implementation)
async function ocrUploadREST(backendUrl, image) {
    const normalizedUrl = normalizeBackendUrl(backendUrl);
    const res = await fetch(`${normalizedUrl}/ocr-upload`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image })
    });
    
    if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
            const errorJson = await res.json();
            errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch (e) {
            try {
                const errorText = await res.text();
                if (errorText) {
                    errorMessage = errorText.substring(0, 200);
                }
            } catch (e2) {}
        }
        const error = new Error(errorMessage);
        error.statusCode = res.status;
        throw error;
    }
    
    const data = await res.json();
    return {
        success: true,
        text: data.text,
        characterCount: data.characterCount,
        data: data
    };
}

// Function to create/update context menu items
function createContextMenu() {
    // Remove existing items to avoid duplicates
    chrome.contextMenus.removeAll(() => {
        // Create context menu items (tooltips always enabled, no toggle needed)
        chrome.contextMenus.create({
            id: 'precrawl-links',
            title: 'Precrawl Links (Cache Screenshots)',
            contexts: ['all']
        });
        
        chrome.contextMenus.create({
            id: 'refresh-cache',
            title: 'Refresh Cache (Clear & Reload)',
            contexts: ['all']
        });
        
        console.log('✅ Context menu created');
    });
}

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('Tooltip Companion installed');
    createContextMenu();
});

// Create context menu when service worker starts (runs on every reload)
console.log('🚀 Tooltip Companion service worker starting...');
try {
    createContextMenu();
} catch (error) {
    console.error('❌ Error creating context menu:', error);
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'precrawl-links') {
        console.log('Precrawling links...');
        
        // Send message to current tab to trigger precrawl
        if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
                action: 'precrawl-links'
            }).then(() => {
                console.log('✅ Precrawl triggered');
            }).catch(() => {
                console.error('❌ Failed to trigger precrawl - reload the page');
            });
        }
    }
    else if (info.menuItemId === 'refresh-cache') {
        console.log('Refreshing cache...');
        
        // Clear IndexedDB for all tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'refresh-cache'
                }).catch(() => {
                    // Ignore errors for tabs that don't have content script
                });
            });
        });
    }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Background received message:', request.action);
    
    if (request.action === 'chat') {
        console.log('💬 Forwarding chat message to backend...');
        console.log('🔹 Message:', request.message);
        console.log('🔹 URL:', request.url);
        console.log('🔹 API Key present:', request.openaiKey ? 'Yes' : 'No');
        console.log('🔹 Tooltip history items:', request.tooltipHistory ? request.tooltipHistory.length : 0);
        
        // Get protocol preference and backend URL from storage
        getProtocolPreference(async (useMCP, backendUrl) => {
            try {
                let result;
                
                if (useMCP) {
                    console.log('🔌 Using MCP protocol for chat');
                    result = await chatMCP(
                        backendUrl,
                        request.message,
                        request.currentUrl,
                        request.url,
                        request.openaiKey,
                        request.tooltipHistory
                    );
                } else {
                    console.log('🌐 Using REST API for chat');
                    result = await chatREST(
                        backendUrl,
                        request.message,
                        request.currentUrl,
                        request.url,
                        request.openaiKey,
                        request.tooltipHistory,
                        request.consoleLogs,
                        request.pageInfo
                    );
                }
                
                console.log('✅ Chat response received from backend');
                sendResponse(result);
            } catch (error) {
                console.error('❌ Chat error:', error);
                console.error('Error stack:', error.stack);
                
                let errorMessage = error.message || 'Unknown error';
                if (error.statusCode === 500) {
                    errorMessage = 'Backend server error. Please try again later.';
                } else if (error.statusCode === 400) {
                    errorMessage = 'Invalid request. Please check your message.';
                } else if (error.message.includes('Failed to fetch') || error.message.includes('MCP')) {
                    // If MCP fails, automatically fallback to REST
                    if (useMCP) {
                        console.log('⚠️ MCP failed, falling back to REST');
                        try {
                            const result = await chatREST(
                                backendUrl,
                                request.message,
                                request.currentUrl,
                                request.url,
                                request.openaiKey,
                                request.tooltipHistory,
                                request.consoleLogs,
                                request.pageInfo
                            );
                            sendResponse(result);
                            return;
                        } catch (restError) {
                            errorMessage = 'Cannot connect to backend. Check your backend URL in settings.';
                        }
                    } else {
                        errorMessage = 'Cannot connect to backend. Check your backend URL in settings.';
                    }
                }
                
                sendResponse({ reply: `Error: ${errorMessage}` });
            }
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'transcribe') {
        console.log('🎤 Forwarding transcription to backend...');
        
        // Get backend URL from storage
        chrome.storage.sync.get({ backendUrl: 'https://backend.tooltipcompanion.com' }, (storageItems) => {
            const backendUrl = storageItems.backendUrl || 'https://backend.tooltipcompanion.com';
            const normalizedUrl = normalizeBackendUrl(backendUrl);
            
            fetch(`${normalizedUrl}/transcribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: request.audio,
                openaiKey: request.openaiKey
            })
        })
        .then(res => res.json())
        .then(data => {
            console.log('✅ Transcription received');
            sendResponse({ text: data.text });
        })
        .catch(error => {
            console.error('❌ Transcription error:', error);
            sendResponse({ text: null, error: 'Transcription service unavailable.' });
        });
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'parse-key') {
        console.log('🔑 Forwarding API key parsing request to backend...');
        console.log('🔹 Text length:', request.text ? request.text.length : 0);
        
        // Get backend URL from storage
        chrome.storage.sync.get({ backendUrl: 'http://localhost:3000' }, (items) => {
            const backendUrl = items.backendUrl || 'http://localhost:3000';
            const normalizedUrl = normalizeBackendUrl(backendUrl);
            
            fetch(`${normalizedUrl}/parse-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: request.text
                })
            })
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                return res.json();
            })
            .then(data => {
                console.log('✅ API key parsed:', data.api_key ? 'Found' : 'Not found');
                sendResponse(data);
            })
            .catch(error => {
                console.error('❌ Parse key error:', error);
                sendResponse({ 
                    error: error.message,
                    api_key: 'NOT_FOUND'
                });
            });
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'fetch-context') {
        // Fetch consolidated context (screenshot + analysis) from backend
        // This replaces separate /capture and /analyze calls for better performance
        console.log('📸 Fetching context from backend (screenshot + analysis)...');
        console.log('🔹 URL:', request.url);
        
        // Keep message channel open for async response
        const sendResponseAsync = (response) => {
            try {
                if (chrome.runtime.lastError) {
                    console.error('❌ Runtime error sending response:', chrome.runtime.lastError);
                } else {
                    sendResponse(response);
                }
            } catch (error) {
                console.error('❌ Error sending response:', error);
            }
        };
        
        // Get backend URL from storage
        getProtocolPreference(async (useMCP, backendUrl) => {
            try {
                // Try /context endpoint first (new consolidated endpoint)
                console.log('🌐 Using REST API /context endpoint');
                const result = await fetchContextREST(backendUrl, request.url);
                
                console.log('✅ Context data received from backend (screenshot + analysis)');
                sendResponseAsync(result);
            } catch (error) {
                // Log as warning (not error) since we have a fallback
                // This prevents Chrome from showing it as a critical error
                const errorMessage = error.message || error.toString() || '';
                const isEndpointNotFound = error.statusCode === 404 || 
                                         errorMessage.toLowerCase().includes('not found') || 
                                         errorMessage.includes('404') ||
                                         errorMessage.includes('endpoint') ||
                                         errorMessage.toLowerCase().includes('/context');
                
                if (isEndpointNotFound) {
                    // This is expected if backend hasn't been updated - use fallback
                    console.warn('⚠️ /context endpoint not available (backend may not be updated yet), falling back to /capture endpoint');
                } else {
                    // Other errors are still logged as errors
                    console.error('❌ Context fetch error:', error);
                    console.warn('⚠️ Attempting fallback to /capture endpoint...');
                }
                try {
                    // Fallback to old /capture endpoint
                    const fallbackResult = await captureScreenshotREST(backendUrl, request.url);
                    
                    // Get analysis separately if available
                    const normalizedUrl = normalizeBackendUrl(backendUrl);
                    let analysis = null;
                    try {
                        const analysisUrl = encodeURIComponent(request.url);
                        const analysisRes = await fetch(`${normalizedUrl}/analyze/${analysisUrl}`);
                        if (analysisRes.ok) {
                            const analysisData = await analysisRes.json();
                            analysis = analysisData.analysis || null;
                        }
                    } catch (e) {
                        // Analysis fetch failed, continue without it
                        console.log('⚠️ Could not fetch analysis separately');
                    }
                    
                    // Combine screenshot with analysis
                    const combinedResult = {
                        success: true,
                        data: {
                            screenshot: fallbackResult.data.screenshot || fallbackResult.data.screenshotUrl,
                            screenshotUrl: fallbackResult.data.screenshotUrl || fallbackResult.data.screenshot,
                            analysis: analysis || {
                                pageType: 'unknown',
                                keyTopics: [],
                                suggestedActions: [],
                                confidence: 0
                            },
                            text: fallbackResult.data.text || ''
                        }
                    };
                    
                    console.log('✅ Fallback to /capture succeeded');
                    sendResponseAsync(combinedResult);
                    return;
                } catch (fallbackError) {
                    console.error('❌ Fallback to /capture also failed:', fallbackError);
                    // If fallback fails, send the original error
                    sendResponseAsync({ 
                        success: false, 
                        error: error.message || error.toString(),
                        statusCode: error.statusCode || 500,
                        backendUrl: backendUrl,
                        note: 'Both /context and /capture endpoints failed'
                    });
                }
            }
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'fetch-screenshot') {
        // Proxy screenshot request through background script to avoid Mixed Content issues
        // Background scripts can make HTTP requests even when page is HTTPS
        // NOTE: This is kept for backward compatibility, but fetch-context is preferred
        console.log('📸 Fetching screenshot from backend (proxying through background)...');
        console.log('🔹 URL:', request.url);
        console.log('⚠️ Consider using fetch-context for better performance (includes analysis)');
        
        // Keep message channel open for async response
        const sendResponseAsync = (response) => {
            try {
                if (chrome.runtime.lastError) {
                    console.error('❌ Runtime error sending response:', chrome.runtime.lastError);
                } else {
                    sendResponse(response);
                }
            } catch (error) {
                console.error('❌ Error sending response:', error);
            }
        };
        
        // Get protocol preference and backend URL from storage
        getProtocolPreference(async (useMCP, backendUrl) => {
            try {
                let result;
                
                if (useMCP) {
                    console.log('🔌 Using MCP protocol for screenshot');
                    result = await captureScreenshotMCP(backendUrl, request.url);
                } else {
                    console.log('🌐 Using REST API for screenshot');
                    result = await captureScreenshotREST(backendUrl, request.url);
                }
                
                console.log('✅ Screenshot data received from backend');
                sendResponseAsync(result);
            } catch (error) {
                console.error('❌ Screenshot fetch error:', error);
                
                // If MCP fails, automatically fallback to REST
                if (useMCP) {
                    console.log('⚠️ MCP failed, falling back to REST');
                    try {
                        const result = await captureScreenshotREST(backendUrl, request.url);
                        sendResponseAsync(result);
                        return;
                    } catch (restError) {
                        console.error('❌ REST fallback also failed:', restError);
                    }
                }
                
                sendResponseAsync({ 
                    success: false, 
                    error: error.message || error.toString(),
                    statusCode: error.statusCode || 500,
                    backendUrl: backendUrl
                });
            }
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'ocr-upload') {
        // Proxy OCR upload request through background script to avoid Mixed Content issues
        console.log('📝 Uploading image for OCR (proxying through background)...');
        console.log('🔹 Image data length:', request.image ? request.image.length : 0);
        
        // Keep message channel open for async response
        const sendResponseAsync = (response) => {
            try {
                if (chrome.runtime.lastError) {
                    console.error('❌ Runtime error sending response:', chrome.runtime.lastError);
                } else {
                    sendResponse(response);
                }
            } catch (error) {
                console.error('❌ Error sending response:', error);
            }
        };
        
        // Get protocol preference and backend URL from storage
        // NOTE: Always use REST for OCR (MCP causes initialization issues)
        getProtocolPreference(async (useMCP, backendUrl) => {
            try {
                // Always use REST API for OCR (MCP has initialization issues)
                console.log('🌐 Using REST API for OCR (MCP disabled for OCR)');
                const result = await ocrUploadREST(backendUrl, request.image);
                
                console.log('✅ OCR result received from backend');
                sendResponseAsync(result);
            } catch (error) {
                console.error('❌ OCR upload error:', error);
                console.error('❌ OCR error details:', {
                    message: error.message,
                    name: error.name,
                    statusCode: error.statusCode
                });
                
                sendResponseAsync({ 
                    success: false, 
                    error: error.message || 'OCR processing failed',
                    statusCode: error.statusCode || 500,
                    backendUrl: backendUrl
                });
            }
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'capture-screenshot') {
        console.log('📸 Capturing screenshot of current tab...');
        
        // Get the current active tab first to ensure we have the right context
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Tab query error:', chrome.runtime.lastError.message);
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }
            
            if (!tabs || tabs.length === 0) {
                sendResponse({ error: 'No active tab found' });
                return;
            }
            
            const tab = tabs[0];
            console.log('📸 Capturing from tab:', tab.url);
            
            // Get current window
            chrome.windows.getCurrent((window) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Window error:', chrome.runtime.lastError.message);
                    sendResponse({ error: chrome.runtime.lastError.message });
                    return;
                }
                
                // Capture visible tab (service workers don't have window, pass null)
                chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ Screenshot error:', chrome.runtime.lastError.message);
                        sendResponse({ error: chrome.runtime.lastError.message });
                        return;
                    }
                    
                    if (!dataUrl) {
                        sendResponse({ error: 'Failed to capture screenshot - no data returned' });
                        return;
                    }
                    
                    console.log('✅ Screenshot captured successfully');
                    sendResponse({ screenshot: dataUrl });
                });
            });
        });
        
        return true; // Keep message channel open for async response
    }
});

// Handle extension icon click - open options
if (chrome.action && chrome.action.onClicked) {
    chrome.action.onClicked.addListener(() => {
        chrome.runtime.openOptionsPage();
    });
} else {
    console.log('⚠️ chrome.action API not available');
}

