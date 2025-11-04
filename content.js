// content.js - Tooltip Companion
// AI-powered tooltip previews for links with context-aware assistance

(function() {
    'use strict';
    
    console.log('🚀 Tooltip Companion content script loaded on:', window.location.href);
    console.log('🚀 Script version: 1.4.1');
    
    // Load Montserrat font for branding (with CSP fallback)
    // Skip on sites with strict CSP (like GitHub) to avoid console errors
    if (!document.getElementById('montserrat-font')) {
        // Check if we're on a site likely to block external fonts
        const strictCSPHosts = ['github.com', 'github.io', 'gitlab.com'];
        const hostname = window.location.hostname;
        const hasStrictCSP = strictCSPHosts.some(host => hostname.includes(host));
        
        if (!hasStrictCSP) {
            try {
                const link = document.createElement('link');
                link.id = 'montserrat-font';
                link.rel = 'preconnect';
                link.href = 'https://fonts.googleapis.com';
                document.head.appendChild(link);
                
                const link2 = document.createElement('link');
                link2.rel = 'preconnect';
                link2.href = 'https://fonts.gstatic.com';
                link2.crossOrigin = 'anonymous';
                document.head.appendChild(link2);
                
                const link3 = document.createElement('link');
                link3.rel = 'stylesheet';
                link3.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap';
                document.head.appendChild(link3);
            } catch (error) {
                // Silently fail - will use system fonts
            }
        } else {
            // On sites with strict CSP, skip font loading to avoid console errors
            // System fonts will be used automatically
        }
    }
    
        // Configuration
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
        const HOVER_DELAY = 1000; // ms before showing tooltip
        const HIDE_DELAY = 400; // ms before hiding tooltip when mouse leaves
        const MIN_DISPLAY_TIME = 800; // Minimum time to show tooltip once it appears
        const MAX_TOOLTIP_WIDTH = 400;
        const MAX_TOOLTIP_HEIGHT = 300;
    
    // Get backend URL from storage (tooltips always enabled)
    console.log('🔧 About to call chrome.storage.sync.get...');
    console.log('🔧 Current page:', window.location.href);
    console.log('🔧 Script loaded at:', new Date().toISOString());
    
    // Default to cloud backend for production, fallback to localhost for development
    // Update DEFAULT_BACKEND after deploying to cloud (Railway, Render, etc.)
    const DEFAULT_BACKEND = 'https://backend.tooltipcompanion.com'; // AWS ALB - Stable DNS (updated 2025-11-03)
    const DEV_BACKEND = 'http://localhost:3000';
    
    chrome.storage.sync.get({ backendUrl: DEFAULT_BACKEND }, (items) => {
        try {
            console.log('🔧 Storage callback started');
            console.log('🔧 Storage items:', items);
            const BACKEND_SERVICE_URL = items.backendUrl.replace(/\/$/, ''); // Remove trailing slash
            
            // Tooltips are always enabled - no toggle needed
            console.log('✅ Tooltip Companion is active! (Tooltips always enabled)');
            console.log(`   Backend Service URL: ${BACKEND_SERVICE_URL}`);
            console.log(`   Current page: ${window.location.href}`);
            
            // Initialize the tooltip system (always enabled)
            console.log('🔧 About to call initTooltipSystem...');
            console.log('🔧 Function exists:', typeof initTooltipSystem);
            initTooltipSystem(BACKEND_SERVICE_URL, true);
            console.log('✅ initTooltipSystem called successfully');
        } catch (error) {
            console.error('❌ Error in storage callback:', error);
            console.error('❌ Error stack:', error.stack);
        }
    });
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'precrawl-links') {
            console.log('🕷️ Precrawl triggered from context menu');
            
            // Trigger precrawl function if it exists
            if (typeof window.spiderPrecrawl === 'function') {
                window.spiderPrecrawl(20).then(result => {
                    console.log(`✅ Precrawl complete!`, result);
                    sendResponse({ success: true, result });
                }).catch(error => {
                    console.error('❌ Precrawl failed:', error);
                    sendResponse({ success: false, error: error.message });
                });
                return true; // Keep the channel open for async response
            } else {
                console.error('spiderPrecrawl function not found');
                sendResponse({ success: false, error: 'Function not available' });
            }
        }
        else if (request.action === 'refresh-cache') {
            console.log('🔄 Refreshing cache...');
            
            // Clear IndexedDB
            const deleteReq = indexedDB.deleteDatabase('playwright-tooltips');
            deleteReq.onsuccess = () => {
                console.log('✅ IndexedDB cleared');
                sendResponse({ success: true });
                
                // Reload page to reinitialize
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            };
            deleteReq.onerror = () => {
                console.warn('Failed to clear IndexedDB');
                sendResponse({ success: false, error: 'Failed to clear cache' });
            };
            return true; // Keep the channel open for async response
        }
        else {
            sendResponse({ success: false, error: 'Unknown action' });
        }
    });
    
    function initTooltipSystem(BACKEND_SERVICE_URL, tooltipsEnabled = true) {
        console.log('🎯 initTooltipSystem function called with URL:', BACKEND_SERVICE_URL);
        console.log('🎯 Current page in initTooltipSystem:', window.location.href);
        // State management - tooltips always enabled
        window.tooltipsEnabled = true;
        const cache = new Map();
        const activeTooltip = { 
            element: null, 
            timeout: null, 
            hideTimeout: null,
            currentUrl: null,
            displayStartTime: null,
            isVisible: false,
            cspFallbackAttempted: false,
            usingDataUri: false
        };
        let tooltipDiv = null;
        
        // Track recent tooltip events for AI chat context
        window.tooltipHistory = [];
        window.tooltipContextStore = new Map(); // Full context store by URL
        const MAX_TOOLTIP_HISTORY = 20; // Increased for better context
        const tooltipSummariesSent = new Set(); // Track which tooltips have already had summaries sent to chat
        
        // Function to log tooltip events for AI context awareness
        function logTooltipEvent(data) {
            const event = {
                timestamp: Date.now(),
                url: data.url || window.location.href,
                element: data.element || 'unknown',
                elementText: data.elementText || '',
                buttonInfo: data.buttonInfo || null,
                isButton: data.isButton || false,
                ocrText: data.ocrText || null, // OCR text from screenshot
                analysis: data.analysis || null, // Full analysis metadata
                screenshotUrl: data.screenshotUrl || null, // Screenshot URL/data URI
                pageTitle: data.pageTitle || document.title || ''
            };
            
            // Store full context in context store
            if (data.url) {
                window.tooltipContextStore.set(data.url, {
                    ...event,
                    lastAccessed: Date.now()
                });
            }
            
            // Add to history
            window.tooltipHistory.push(event);
            
            // Keep only recent events
            if (window.tooltipHistory.length > MAX_TOOLTIP_HISTORY) {
                window.tooltipHistory.shift();
            }
            
            // Log to console for debugging
            if (data.buttonInfo) {
                console.log('🔘 Tooltip shown for button:', data.buttonInfo.label || data.buttonInfo.text, '-', data.buttonInfo.purpose);
            } else {
                console.log('🔗 Tooltip shown for link:', data.url);
            }
            
            // Log OCR text if available
            if (data.ocrText) {
                console.log('📝 Tooltip OCR text extracted:', data.ocrText.substring(0, 100) + (data.ocrText.length > 100 ? '...' : ''));
            }
            
            // Log analysis if available
            if (data.analysis && data.analysis.pageType) {
                const confidence = Math.round((data.analysis.confidence || 0) * 100);
                console.log(`🔍 Analysis received: ${data.analysis.pageType} (confidence: ${confidence}%)`);
                
                if (data.analysis.keyTopics && data.analysis.keyTopics.length > 0) {
                    console.log(`📌 Key topics: ${data.analysis.keyTopics.slice(0, 3).join(', ')}`);
                }
                
                if (data.analysis.suggestedActions && data.analysis.suggestedActions.length > 0) {
                    console.log(`💡 Suggested: ${data.analysis.suggestedActions[0]}`);
                }
            }
            
            // Log tooltip context summary for chat awareness
            if (data.ocrText && data.analysis) {
                console.log(`📋 Tooltip context ready for chat: ${data.analysis.pageType || 'unknown'} page with ${data.ocrText.length} chars of OCR text`);
            }
        }
        
        // Function to perform OCR on tooltip screenshot
        async function processTooltipOCR(screenshotUrl, url) {
            try {
                // Get base64 data from cache if available, or convert blob URL to data URL
                let imageData = screenshotUrl;
                
                // Check if we have base64 data cached
                const cacheEntry = cache.get(url);
                if (cacheEntry && cacheEntry.base64Data) {
                    // Use cached base64 data if available
                    imageData = cacheEntry.base64Data;
                    console.log('📝 Using cached base64 data for OCR');
                } else if (screenshotUrl && screenshotUrl.startsWith('blob:')) {
                    // Convert blob URL to base64 data URL for OCR
                    try {
                        const response = await fetch(screenshotUrl);
                        const blob = await response.blob();
                        const base64Promise = new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        imageData = await base64Promise;
                        console.log('📝 Converted blob URL to base64 for OCR');
                    } catch (convertError) {
                        console.warn('⚠️ Failed to convert blob to base64:', convertError);
                        return null; // Skip OCR if conversion fails
                    }
                }
                
                // Send to backend for OCR via background script proxy
                const response = await new Promise((resolve, reject) => {
                    if (!chrome.runtime?.id) {
                        reject(new Error('Extension context invalidated'));
                        return;
                    }
                    
                    chrome.runtime.sendMessage(
                        { action: 'ocr-upload', image: imageData },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else if (!response || !response.success) {
                                reject(new Error(response?.error || 'Failed to process OCR'));
                            } else {
                                resolve(response);
                            }
                        }
                    );
                });
                
                const ocrText = response.data?.ocrText || null;
                if (ocrText) {
                    console.log('✅ Tooltip OCR completed for:', url);
                    return ocrText;
                }
                return null;
            } catch (error) {
                console.warn('⚠️ Tooltip OCR failed:', error.message);
                return null; // Silent fail - OCR is optional
            }
        }
        
        // IndexedDB for persistent storage
        let db = null;
        const DB_NAME = 'playwright-tooltips';
        const DB_VERSION = 1;
        const STORE_NAME = 'screenshots';
        
        // Initialize IndexedDB
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => console.warn('IndexedDB failed to open');
        request.onsuccess = () => {
            db = request.result;
            console.log('✅ IndexedDB initialized for persistent caching');
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
        
        // Create tooltip element
        function createTooltipElement() {
            if (tooltipDiv) return tooltipDiv;
            
            tooltipDiv = document.createElement('div');
            tooltipDiv.id = 'playwright-tooltip';
            tooltipDiv.style.cssText = `
                position: fixed;
                display: none;
                background: rgba(15, 15, 15, 0.9);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1);
                padding: 0;
                z-index: 999999;
                pointer-events: auto;
                max-width: ${MAX_TOOLTIP_WIDTH}px;
                max-height: ${MAX_TOOLTIP_HEIGHT}px;
                overflow: hidden;
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
                font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            `;
            
            // Keep tooltip visible when hovering over it
            tooltipDiv.addEventListener('mouseenter', () => {
                if (activeTooltip.hideTimeout) {
                    clearTimeout(activeTooltip.hideTimeout);
                }
            });
            
            tooltipDiv.addEventListener('mouseleave', () => {
                if (activeTooltip.hideTimeout) {
                    clearTimeout(activeTooltip.hideTimeout);
                }
                hideTooltip();
            });
            document.body.appendChild(tooltipDiv);
            return tooltipDiv;
        }
        
        // Show tooltip with cognitive summary first, then screenshot
        function showTooltip(x, y, screenshotUrl, analysis, ocrText = null) {
            if (!tooltipDiv) {
                tooltipDiv = createTooltipElement();
            }
            
            // Inject template styles if not already present
            if (!document.getElementById('tooltip-template-styles')) {
                const styleSheet = document.createElement('style');
                styleSheet.id = 'tooltip-template-styles';
                styleSheet.textContent = window.TooltipTemplate?.getStyles('tooltip') || '';
                document.head.appendChild(styleSheet);
            }
            
            // Get OCR text from cache if not provided
            let extractedText = ocrText || '';
            if (!extractedText && activeTooltip.currentUrl) {
                const cacheEntry = cache.get(activeTooltip.currentUrl);
                if (cacheEntry && cacheEntry.text) {
                    extractedText = cacheEntry.text;
                }
            }
            
            // Use unified template system
            const templateData = {
                screenshotUrl: screenshotUrl || null,
                analysis: analysis || {
                    pageType: 'unknown',
                    keyTopics: [],
                    suggestedActions: [],
                    confidence: 0
                },
                text: extractedText,
                url: activeTooltip.currentUrl || '',
                usedDataUri: activeTooltip.usingDataUri || false
            };
            
            // Render using unified template
            const templateHtml = window.TooltipTemplate?.render(templateData, {
                mode: 'tooltip',
                showScreenshot: true,
                showMetadata: true,
                compact: false
            }) || `
                <div style="padding: 20px; text-align: center; color: rgba(255, 255, 255, 0.7);">
                    ${screenshotUrl ? 'Loading preview...' : 'Preview unavailable'}
                </div>
            `;
            
            tooltipDiv.innerHTML = templateHtml;
            
            // Attach screenshot handlers using template system
            if (screenshotUrl && window.TooltipTemplate) {
                const templateContainer = tooltipDiv.querySelector('.tooltip-template-popup');
                if (templateContainer) {
                    window.TooltipTemplate.attachHandlers(templateContainer, screenshotUrl, async (e, img) => {
                        // CSP fallback handler
                        const tooltipUrl = activeTooltip.currentUrl;
                        const alreadyUsingDataUri = img.dataset.usingDataUri === 'true' || activeTooltip.usingDataUri;
                        const alreadyAttemptedFallback = img.dataset.cspFallbackAttempted === 'true' || activeTooltip.cspFallbackAttempted;

                        if (tooltipUrl && !alreadyUsingDataUri && !alreadyAttemptedFallback) {
                            console.log('🛡️ Attempting CSP fallback with data URI');
                            img.dataset.cspFallbackAttempted = 'true';
                            activeTooltip.cspFallbackAttempted = true;
                            
                            try {
                                const fallbackContext = await fetchContext(tooltipUrl, { preferDataUri: true });
                                if (activeTooltip.currentUrl === tooltipUrl && fallbackContext?.screenshotUrl) {
                                    console.log('✅ CSP fallback succeeded, updating screenshot');
                                    activeTooltip.usingDataUri = !!fallbackContext.usedDataUri;
                                    
                                    // Update cache
                                    const existingCache = cache.get(tooltipUrl) || {};
                                    cache.set(tooltipUrl, {
                                        ...existingCache,
                                        screenshotUrl: fallbackContext.screenshotUrl,
                                        base64Data: fallbackContext.base64Data || existingCache.base64Data || null,
                                        analysis: fallbackContext.analysis || existingCache.analysis || null,
                                        text: fallbackContext.text || existingCache.text || '',
                                        originalUrl: fallbackContext.originalScreenshotUrl || existingCache.originalUrl || null,
                                        timestamp: Date.now()
                                    });
                                    
                                    if (fallbackContext.base64Data) {
                                        await saveToIndexedDB(tooltipUrl, fallbackContext.base64Data);
                                    }
                                    
                                    // Update image source
                                    img.src = fallbackContext.screenshotUrl;
                                    img.dataset.usingDataUri = fallbackContext.usedDataUri ? 'true' : 'false';
                                }
                            } catch (fallbackError) {
                                console.error('❌ CSP fallback failed:', fallbackError);
                            }
                        }
                    });
                }
            }
            
            // Position tooltip
            tooltipDiv.style.display = 'block';
            
            // Get tooltip dimensions after display to properly position
            requestAnimationFrame(() => {
                const rect = tooltipDiv.getBoundingClientRect();
                let left = x + 10;
                let top = y + 10;
                
                // Adjust if would overflow viewport
                if (left + rect.width > window.innerWidth) {
                    left = x - rect.width - 10;
                }
                if (left < 0) left = 10;
                
                if (top + rect.height > window.innerHeight) {
                    top = y - rect.height - 10;
                }
                if (top < 0) top = 10;
                
                tooltipDiv.style.left = left + 'px';
                tooltipDiv.style.top = top + 'px';
                
                // Fade in
                setTimeout(() => {
                    tooltipDiv.style.opacity = '1';
                }, 10);
            });
            
            // Mark as visible
            activeTooltip.isVisible = true;
            activeTooltip.displayStartTime = Date.now();
        }
        
        // Helper function to get icon for page type
        function getPageTypeIcon(pageType) {
            const icons = {
                'login': '🔐',
                'ecommerce': '🛒',
                'banking': '🏦',
                'news': '📰',
                'contact': '📞',
                'unknown': '🌐'
            };
            return icons[pageType] || icons['unknown'];
        }
        
        /**
         * Render tooltip context in chat window using unified template
         * @param {Object} contextData - Context data with screenshot, analysis, text, url
         * @param {Function} addMessageCallback - Function to add message to chat (signature: (text, type))
         */
        function renderTooltipContextInChat(contextData, addMessageCallback) {
            if (!window.TooltipTemplate) {
                console.warn('TooltipTemplate not available');
                if (addMessageCallback && contextData.text) {
                    // Fallback to text-only
                    addMessageCallback(`📝 Preview: ${contextData.text.substring(0, 200)}...`, 'bot');
                }
                return;
            }
            
            // Only proceed if chat is open (check for chatContainer in multiple ways)
            const chatContainerEl = document.querySelector('.chat-container') || 
                                   document.getElementById('chat-container') ||
                                   (typeof chatContainer !== 'undefined' ? chatContainer : null);
            
            if (!chatContainerEl || (chatContainerEl.style && chatContainerEl.style.display === 'none')) {
                return;
            }
            
            // Inject template styles if not already present
            if (!document.getElementById('tooltip-template-styles')) {
                const styleSheet = document.createElement('style');
                styleSheet.id = 'tooltip-template-styles';
                styleSheet.textContent = window.TooltipTemplate.getStyles('chat');
                document.head.appendChild(styleSheet);
            }
            
            // Render template for chat mode (without screenshots)
            // Don't pass screenshotUrl in chat mode to prevent any rendering
            const templateHtml = window.TooltipTemplate.render({
                screenshotUrl: null, // Explicitly null in chat mode
                analysis: contextData.analysis || {
                    pageType: 'unknown',
                    keyTopics: [],
                    suggestedActions: [],
                    confidence: 0
                },
                text: contextData.text || '',
                url: contextData.url || '',
                usedDataUri: false
            }, {
                mode: 'chat',
                showScreenshot: false, // No screenshots in chat
                showMetadata: true,
                compact: true
            });
            
            // Create message element directly (since addMessage uses textContent, not innerHTML)
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message bot';
            messageDiv.style.marginBottom = '10px';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            // Check for dark mode (safely handle if not defined)
            const darkMode = typeof isDarkMode !== 'undefined' ? isDarkMode : 
                           (localStorage.getItem('chat-theme') !== 'light');
            
            if (darkMode) {
                contentDiv.style.background = 'rgba(0, 0, 0, 0.3)';
                contentDiv.style.color = '#e8e8e8';
                contentDiv.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            } else {
                contentDiv.style.background = 'rgba(102, 126, 234, 0.1)';
                contentDiv.style.color = '#1a1a1a';
                contentDiv.style.border = '1px solid rgba(102, 126, 234, 0.2)';
            }
            contentDiv.style.borderRadius = '12px 12px 12px 4px';
            contentDiv.style.padding = '10px 14px';
            contentDiv.style.maxWidth = '85%';
            contentDiv.style.fontSize = '13px';
            contentDiv.style.lineHeight = '1.5';
            contentDiv.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
            
            // Insert template HTML
            contentDiv.innerHTML = templateHtml;
            
            messageDiv.appendChild(contentDiv);
            
            // Find chat messages container
            const chatMessagesEl = document.getElementById('chat-messages') || 
                                  document.querySelector('.chat-messages') ||
                                  (typeof chatMessages !== 'undefined' ? chatMessages : null);
            
            if (chatMessagesEl) {
                chatMessagesEl.appendChild(messageDiv);
                
                // Scroll to bottom
                setTimeout(() => {
                    if (chatMessagesEl) {
                        chatMessagesEl.scrollTo({
                            top: chatMessagesEl.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }, 50);
            } else {
                console.warn('Chat messages container not found, cannot add tooltip context');
            }
            
            // Screenshot handlers not needed in chat mode (screenshots disabled)
        }
        
        // Expose function globally for chat interface
        window.renderTooltipContextInChat = renderTooltipContextInChat;
        
        /**
         * Chat Intelligence Functions - Access tooltip context for AI awareness
         */
        
        /**
         * Get recent tooltip history
         * @param {number} limit - Maximum number of recent tooltips to return
         * @returns {Array} Array of tooltip events
         */
        function getTooltipHistory(limit = 10) {
            if (!window.tooltipHistory) return [];
            return window.tooltipHistory.slice(-limit).reverse(); // Most recent first
        }
        
        /**
         * Get tooltip context for a specific URL
         * @param {string} url - URL to get context for
         * @returns {Object|null} Tooltip context or null if not found
         */
        function getTooltipContext(url) {
            if (!window.tooltipContextStore) return null;
            return window.tooltipContextStore.get(url) || null;
        }
        
        /**
         * Get all available tooltip contexts
         * @returns {Array} Array of tooltip contexts
         */
        function getAllTooltipContexts() {
            if (!window.tooltipContextStore) return [];
            return Array.from(window.tooltipContextStore.values());
        }
        
        /**
         * Format tooltip context as a string for chat prompts
         * @param {Object} context - Tooltip context object
         * @param {boolean} includeOCR - Whether to include full OCR text
         * @returns {string} Formatted context string
         */
        function formatTooltipContextForChat(context, includeOCR = false) {
            if (!context) return '';
            
            let formatted = `📋 **Tooltip Context for: ${context.url}**\n\n`;
            
            if (context.pageTitle) {
                formatted += `**Page Title:** ${context.pageTitle}\n`;
            }
            
            if (context.analysis) {
                const analysis = context.analysis;
                formatted += `**Page Type:** ${analysis.pageType || 'unknown'}\n`;
                
                if (analysis.confidence) {
                    formatted += `**Confidence:** ${Math.round(analysis.confidence * 100)}%\n`;
                }
                
                if (analysis.keyTopics && analysis.keyTopics.length > 0) {
                    formatted += `**Key Topics:** ${analysis.keyTopics.join(', ')}\n`;
                }
                
                if (analysis.suggestedActions && analysis.suggestedActions.length > 0) {
                    formatted += `**Suggested Actions:** ${analysis.suggestedActions.join('; ')}\n`;
                }
            }
            
            if (context.ocrText) {
                if (includeOCR) {
                    formatted += `\n**OCR Text:**\n${context.ocrText}\n`;
                } else {
                    const preview = context.ocrText.substring(0, 200);
                    formatted += `\n**OCR Preview:** ${preview}${context.ocrText.length > 200 ? '...' : ''}\n`;
                }
            }
            
            if (context.elementText) {
                formatted += `\n**Element Text:** ${context.elementText}\n`;
            }
            
            const timeAgo = Math.round((Date.now() - context.timestamp) / 1000);
            formatted += `\n*Viewed ${timeAgo}s ago*\n`;
            
            return formatted;
        }
        
        /**
         * Get formatted context summary for recent tooltips
         * @param {number} limit - Number of recent tooltips to include
         * @returns {string} Formatted summary string
         */
        function getTooltipContextSummary(limit = 5) {
            const history = getTooltipHistory(limit);
            if (history.length === 0) {
                return 'No tooltip context available yet. Hover over links to build context.';
            }
            
            let summary = `📚 **Recent Tooltip Context (${history.length} pages):**\n\n`;
            
            history.forEach((context, index) => {
                summary += `${index + 1}. **${context.url}**\n`;
                if (context.analysis && context.analysis.pageType) {
                    summary += `   Type: ${context.analysis.pageType}`;
                    if (context.analysis.confidence) {
                        summary += ` (${Math.round(context.analysis.confidence * 100)}% confidence)`;
                    }
                    summary += '\n';
                }
                if (context.ocrText) {
                    const preview = context.ocrText.substring(0, 100);
                    summary += `   Text: ${preview}${context.ocrText.length > 100 ? '...' : ''}\n`;
                }
                summary += '\n';
            });
            
            return summary;
        }
        
        /**
         * Auto-enhance chat message with tooltip context if relevant
         * @param {string} message - User's chat message
         * @returns {string} Enhanced message with context
         */
        function enhanceChatMessageWithContext(message) {
            const lowerMessage = message.toLowerCase();
            
            // Check if message asks about what they can do or what actions are available
            const asksAboutActions = lowerMessage.includes('what can i do') ||
                                   lowerMessage.includes('what can i') ||
                                   lowerMessage.includes('what actions') ||
                                   lowerMessage.includes('what options') ||
                                   lowerMessage.includes('what is available');
            
            // Check if message asks about insights
            const asksAboutInsights = lowerMessage.includes('what kind of insights') ||
                                    lowerMessage.includes('what insights') ||
                                    lowerMessage.includes('what information') ||
                                    lowerMessage.includes('what can you tell me');
            
            // Check if message asks about recent tooltips/pages
            const asksAboutRecent = lowerMessage.includes('recent') || 
                                  lowerMessage.includes('what did i') ||
                                  lowerMessage.includes('what pages') ||
                                  lowerMessage.includes('tooltip');
            
            // Check if message asks about a specific URL
            const urlMatch = message.match(/https?:\/\/[^\s]+/);
            
            if (asksAboutRecent) {
                const summary = getTooltipContextSummary(5);
                return `${summary}\n\nUser question: ${message}`;
            } else if (urlMatch) {
                const url = urlMatch[0];
                const context = getTooltipContext(url);
                if (context) {
                    const formatted = formatTooltipContextForChat(context, true);
                    return `${formatted}\n\nUser question: ${message}`;
                }
            } else if (asksAboutActions || asksAboutInsights) {
                // For "what can I do" or "what insights" questions, provide detailed context
                const recentContext = getTooltipHistory(3);
                if (recentContext.length > 0) {
                    let contextNote = '\n\n**Context from recent tooltip previews:**\n';
                    recentContext.forEach((ctx, idx) => {
                        contextNote += `\nPage ${idx + 1}: ${ctx.url}\n`;
                        if (ctx.analysis) {
                            if (ctx.analysis.suggestedActions && ctx.analysis.suggestedActions.length > 0) {
                                contextNote += `Available actions: ${ctx.analysis.suggestedActions.join('; ')}\n`;
                            }
                            if (ctx.analysis.keyTopics && ctx.analysis.keyTopics.length > 0) {
                                contextNote += `Key topics: ${ctx.analysis.keyTopics.join(', ')}\n`;
                            }
                        }
                        if (ctx.ocrText) {
                            const preview = ctx.ocrText.substring(0, 200);
                            contextNote += `Content preview: ${preview}${ctx.ocrText.length > 200 ? '...' : ''}\n`;
                        }
                    });
                    return `${message}\n\n${contextNote}`;
                }
            }
            
            // If no specific match, append recent context summary as context
            const recentContext = getTooltipHistory(3);
            if (recentContext.length > 0) {
                let contextNote = '\n\n---\n**Recent context from tooltips:**\n';
                recentContext.forEach((ctx, idx) => {
                    contextNote += `${idx + 1}. ${ctx.url}`;
                    if (ctx.analysis && ctx.analysis.pageType) {
                        contextNote += ` (${ctx.analysis.pageType})`;
                    }
                    contextNote += '\n';
                });
                return message + contextNote;
            }
            
            return message;
        }
        
        /**
         * Generate intelligent summary about what a tooltip shows
         * Uses OCR text and metadata to create a rich, informative description
         * @param {Object} context - Tooltip context with analysis, OCR text, etc.
         * @param {string} url - URL of the tooltip
         * @returns {string|null} Summary text or null if insufficient data
         */
        function generateTooltipSummary(context, url) {
            if (!context) return null;
            
            const analysis = context.analysis;
            const ocrText = context.text || '';
            const hasAnalysis = analysis && analysis.pageType && analysis.pageType !== 'unknown';
            const hasOCR = ocrText && ocrText.trim().length > 0;
            
            // Need at least some data to generate a summary
            if (!hasAnalysis && !hasOCR) return null;
            
            const cleanText = hasOCR ? ocrText.trim().toLowerCase() : '';
            const originalText = ocrText.trim();
            
            // Extract rates (APR, interest rates, percentages)
            const ratePatterns = [
                /(\d+\.?\d*)\s*%\s*(?:apr|apy|interest|rate|cashback|cash\s*back|rewards?)/gi,
                /(?:apr|apy|interest\s*rate)[:\s]*(\d+\.?\d*)\s*%/gi,
                /(\d+\.?\d*)\s*%\s*(?:cash|rewards?|back)/gi,
                /(\$\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:bonus|offer|reward)/gi,
                /(?:bonus|offer|reward)[:\s]*(\$\d+(?:,\d{3})*(?:\.\d{2})?)/gi
            ];
            
            const rates = [];
            const bonuses = [];
            
            ratePatterns.forEach(pattern => {
                const matches = originalText.matchAll(pattern);
                for (const match of matches) {
                    const value = match[1];
                    if (match[0].toLowerCase().includes('apr') || match[0].toLowerCase().includes('apy') || match[0].toLowerCase().includes('interest')) {
                        if (!rates.includes(`${value}%`)) {
                            rates.push(`${value}%`);
                        }
                    } else if (match[0].toLowerCase().includes('bonus') || match[0].toLowerCase().includes('offer') || match[0].toLowerCase().includes('reward')) {
                        if (value.startsWith('$')) {
                            if (!bonuses.includes(value)) {
                                bonuses.push(value);
                            }
                        } else if (!rates.includes(`${value}%`)) {
                            rates.push(`${value}%`);
                        }
                    } else if (match[0].toLowerCase().includes('cash') || match[0].toLowerCase().includes('rewards')) {
                        if (!rates.includes(`${value}%`)) {
                            rates.push(`${value}%`);
                        }
                    }
                }
            });
            
            // Extract sign-up purpose
            let signUpPurpose = null;
            if (cleanText.includes('sign up') || cleanText.includes('signup') || cleanText.includes('register') || cleanText.includes('create account')) {
                // Look for what they're signing up for
                const signUpPatterns = [
                    /(?:sign\s*up|register|create\s*account)\s*(?:for|to)\s*([^.!?]+)/i,
                    /(?:sign\s*up|register|create)\s+([a-z\s]+?)\s+(?:account|service|membership)/i,
                    /(?:open|apply\s*for)\s+([a-z\s]+?)\s+(?:account|card|service)/i
                ];
                
                for (const pattern of signUpPatterns) {
                    const match = originalText.match(pattern);
                    if (match && match[1]) {
                        signUpPurpose = match[1].trim();
                        // Clean up the purpose
                        signUpPurpose = signUpPurpose.replace(/^(a|an|the)\s+/i, '').trim();
                        if (signUpPurpose.length > 50) {
                            signUpPurpose = signUpPurpose.substring(0, 50) + '...';
                        }
                        break;
                    }
                }
                
                // Fallback: look for account types mentioned
                if (!signUpPurpose) {
                    if (cleanText.includes('checking account')) {
                        signUpPurpose = 'a checking account';
                    } else if (cleanText.includes('credit card')) {
                        signUpPurpose = 'a credit card';
                    } else if (cleanText.includes('savings account')) {
                        signUpPurpose = 'a savings account';
                    } else if (cleanText.includes('membership')) {
                        signUpPurpose = 'membership';
                    }
                }
            }
            
            // Extract requirements or terms
            const requirements = [];
            if (cleanText.includes('qualify') || cleanText.includes('requirement') || cleanText.includes('minimum') || cleanText.includes('direct deposit')) {
                const reqPatterns = [
                    /(\$\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:or\s*more)?\s*(?:in\s*)?(?:qualifying\s*)?(?:direct\s*)?deposits?/gi,
                    /(?:minimum|qualify|requirement)[:\s]*(\$\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
                    /(\$\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:minimum|required)/gi,
                    /(?:make|deposit)\s*(\$\d+(?:,\d{3})*(?:\.\d{2})?)/gi
                ];
                
                reqPatterns.forEach(pattern => {
                    const matches = originalText.matchAll(pattern);
                    for (const match of matches) {
                        const value = match[1];
                        if (value && !requirements.includes(value)) {
                            // Check if it's a direct deposit requirement
                            const context = match[0].toLowerCase();
                            if (context.includes('direct deposit') || context.includes('deposit')) {
                                const formattedValue = value.startsWith('$') ? value : `$${value}`;
                                requirements.push(`${formattedValue} in direct deposits`);
                            } else {
                                const formattedValue = value.startsWith('$') ? value : `$${value}`;
                                requirements.push(formattedValue);
                            }
                        }
                    }
                });
            }
            
            // Build the description
            let description = '';
            
            // Start with page type and main purpose
            if (hasAnalysis) {
                const pageType = analysis.pageType.toLowerCase();
                
                // Determine main action/purpose
                if (signUpPurpose) {
                    description = `Allows users to sign up for ${signUpPurpose}`;
                } else if (cleanText.includes('checking') && bonuses.length > 0) {
                    description = `Checking account offer with ${bonuses.join(' and ')} bonus`;
                } else if (cleanText.includes('credit card')) {
                    description = 'Credit card offers';
                } else if (cleanText.includes('bonus') || bonuses.length > 0) {
                    description = `Promotional offer${bonuses.length > 0 ? ` with ${bonuses.join(' and ')} bonus` : ''}`;
                } else if (pageType === 'banking') {
                    description = 'Banking services';
                } else if (cleanText.includes('sign in') || cleanText.includes('login')) {
                    description = 'Sign-in page';
                } else if (analysis.keyTopics && analysis.keyTopics.length > 0) {
                    description = `A ${pageType} page about ${analysis.keyTopics.slice(0, 2).join(' and ')}`;
                } else {
                    description = `A ${pageType} page`;
                }
            } else {
                // Fallback if no analysis
                if (signUpPurpose) {
                    description = `Allows users to sign up for ${signUpPurpose}`;
                } else if (bonuses.length > 0) {
                    description = `Promotional offer with ${bonuses.join(' and ')} bonus`;
                } else {
                    description = 'A web page';
                }
            }
            
            // Add rates if found
            if (rates.length > 0) {
                description += ` (${rates.join(', ')} ${rates.length === 1 ? 'rate' : 'rates'})`;
            }
            
            // Add requirements if found
            if (requirements.length > 0 && (signUpPurpose || cleanText.includes('bonus') || cleanText.includes('offer'))) {
                description += ` - requires ${requirements.join(' or ')}`;
            }
            
            // Add what it does if we have suggested actions and no specific purpose yet
            if (hasAnalysis && analysis.suggestedActions && analysis.suggestedActions.length > 0 && !signUpPurpose) {
                const action = analysis.suggestedActions[0].toLowerCase();
                if (action.includes('explore') || action.includes('browse')) {
                    description += ' - allows users to explore options';
                } else if (action.includes('apply') || action.includes('open')) {
                    description += ' - allows users to apply';
                } else if (action.includes('contact')) {
                    description += ' - provides contact information';
                }
            }
            
            // Capitalize first letter
            description = description.charAt(0).toUpperCase() + description.slice(1);
            
            return description;
        }
        
        // Expose chat intelligence functions globally
        window.getTooltipHistory = getTooltipHistory;
        window.getTooltipContext = getTooltipContext;
        window.getAllTooltipContexts = getAllTooltipContexts;
        window.formatTooltipContextForChat = formatTooltipContextForChat;
        window.getTooltipContextSummary = getTooltipContextSummary;
        window.enhanceChatMessageWithContext = enhanceChatMessageWithContext;
        window.generateTooltipSummary = generateTooltipSummary;
        
        // Update tooltip with screenshot when it loads (for hybrid tooltip)
        function updateTooltipWithScreenshot(screenshotUrl) {
            if (!tooltipDiv || !activeTooltip.isVisible) return;
            
            const container = tooltipDiv.querySelector('#tooltip-screenshot-container');
            if (container) {
                // Update the loading indicator with actual screenshot
                container.innerHTML = `
                    <img src="${screenshotUrl}" 
                        style="display: block; width: 100%; height: auto; max-height: 200px; object-fit: cover; border-radius: 8px;" 
                        alt="Preview"
                        onerror="this.parentElement.style.display='none';">
                `;
                container.style.display = 'block';
            } else {
                // Fallback: If no container exists, replace entire content
                tooltipDiv.innerHTML = `<img src="${screenshotUrl}" 
                    style="display: block; width: 100%; height: auto; max-height: ${MAX_TOOLTIP_HEIGHT}px; object-fit: cover;" 
                    alt="Link preview">`;
            }
        }
        
        // Hide tooltip
        function hideTooltip() {
            // Check minimum display time
            if (activeTooltip.isVisible && activeTooltip.displayStartTime) {
                const timeVisible = Date.now() - activeTooltip.displayStartTime;
                if (timeVisible < MIN_DISPLAY_TIME) {
                    // Too soon to hide, reschedule
                    setTimeout(() => hideTooltip(), MIN_DISPLAY_TIME - timeVisible + 100);
                    return;
                }
            }
            
            if (tooltipDiv) {
                tooltipDiv.style.opacity = '0';
                setTimeout(() => {
                    if (tooltipDiv) {
                        tooltipDiv.style.display = 'none';
                        tooltipDiv.innerHTML = ''; // Clear content
                    }
                }, 200);
            }
            
            // Reset state
            activeTooltip.isVisible = false;
            activeTooltip.displayStartTime = null;
            activeTooltip.usingDataUri = false;
            activeTooltip.cspFallbackAttempted = false;
        }
        
        // Check cache validity
        function isCacheValid(cacheEntry) {
            return cacheEntry && (Date.now() - cacheEntry.timestamp) < CACHE_TTL;
        }
        
        // Helper function to check if extension context is valid
        function isExtensionContextValid() {
            try {
                return !!(chrome.runtime && chrome.runtime.id);
            } catch (e) {
                return false;
            }
        }

        // Fetch context (screenshot + analysis) from backend with retry mechanism
        // Uses background script proxy to avoid Mixed Content issues on HTTPS pages
        // This replaces separate screenshot and analysis calls for better performance
        // Phase 1 MCP Migration: Uses MCP-aligned structure for requests
        async function fetchContext(url, optionsOrRetry = {}, retryOverride = undefined) {
            let options = {};
            let retryCount = 0;

            if (typeof optionsOrRetry === 'number') {
                retryCount = optionsOrRetry;
            } else {
                options = optionsOrRetry || {};
                if (typeof retryOverride === 'number') {
                    retryCount = retryOverride;
                }
            }

            const preferDataUri = !!options.preferDataUri;
            const maxRetries = 2;
            const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s

            // Check extension context before attempting fetch
            if (!isExtensionContextValid()) {
                console.log(`ℹ️ Extension was reloaded. Please reload this page to enable tooltips.`);
                throw new Error('Extension context invalidated. Please reload this page.');
            }

            try {
                console.log(`📸 Fetching context (screenshot + analysis) for: ${url}${retryCount > 0 ? ` (attempt ${retryCount + 1})` : ''}`);
                if (preferDataUri) {
                    console.log('🛡️ Requesting CSP-safe screenshot (data URI fallback)');
                }
                console.log(`📸 Using MCP-aligned consolidated request via background script`);

                const mcpResourceUri = `tooltip://context/${encodeURIComponent(url)}`;

                const response = await new Promise((resolve, reject) => {
                    if (!isExtensionContextValid()) {
                        reject(new Error('Extension context invalidated. Please reload this page.'));
                        return;
                    }

                    chrome.runtime.sendMessage(
                        {
                            action: 'fetch-context',
                            url: url,
                            options: {
                                preferDataUri: preferDataUri
                            },
                            mcpResource: {
                                uri: mcpResourceUri,
                                name: 'Tooltip Context',
                                description: 'Browsing context with screenshot and analysis'
                            }
                        },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                const errorMsg = chrome.runtime.lastError.message;
                                if (errorMsg.includes('Extension context invalidated') ||
                                    errorMsg.includes('message port closed')) {
                                    reject(new Error('Extension was reloaded. Please reload this page to continue.'));
                                } else {
                                    reject(new Error(errorMsg));
                                }
                            } else if (!response || !response.success) {
                                reject(new Error(response?.error || 'Failed to fetch context'));
                            } else {
                                resolve(response);
                            }
                        }
                    );
                });

                console.log(`📸 Context response received from background proxy`);

                const data = response.data;

                if (data.mcpResource) {
                    console.log(`🔌 MCP Resource response received:`, {
                        uri: data.mcpResource.uri,
                        mimeType: data.mcpResource.mimeType,
                        timestamp: data.mcpResource.timestamp
                    });
                }

                console.log(`🔍 Context data fields:`, {
                    hasScreenshotUrl: !!data.screenshotUrl,
                    hasScreenshotDataUri: !!data.screenshotDataUri,
                    screenshotUrlType: typeof data.screenshotUrl,
                    screenshotType: typeof data.screenshot,
                    hasAnalysis: !!data.analysis,
                    hasText: !!data.text,
                    keys: Object.keys(data)
                });

                const analysis = data.analysis || {
                    pageType: 'unknown',
                    keyTopics: [],
                    suggestedActions: [],
                    confidence: 0
                };
                const extractedText = data.text || '';

                const normalizeUrlOrDataUri = (value) => {
                    if (!value) return null;
                    if (typeof value === 'string') {
                        return value;
                    }
                    if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
                        try {
                            const byteArray = Uint8Array.from(value.data);
                            const chunkSize = 0x8000;
                            let binary = '';
                            for (let i = 0; i < byteArray.length; i += chunkSize) {
                                const chunk = byteArray.subarray(i, i + chunkSize);
                                binary += String.fromCharCode.apply(null, chunk);
                            }
                            const base64 = btoa(binary);
                            return `data:image/png;base64,${base64}`;
                        } catch (err) {
                            console.warn('Failed to convert buffer screenshot to data URI:', err);
                            return null;
                        }
                    }
                    return null;
                };

                const rawScreenshotUrlValue = normalizeUrlOrDataUri(data.screenshotUrl);
                const originalScreenshotUrlValue = normalizeUrlOrDataUri(data.originalScreenshotUrl);
                let screenshotDataUri = normalizeUrlOrDataUri(data.screenshotDataUri);
                if (!screenshotDataUri && typeof data.screenshot === 'string' && data.screenshot.startsWith('data:image/')) {
                    screenshotDataUri = data.screenshot;
                }

                let legacyScreenshot = null;
                if (typeof data.screenshot === 'string') {
                    if (data.screenshot.startsWith('data:image/')) {
                        legacyScreenshot = data.screenshot;
                    } else if (data.screenshot.startsWith('http://') || data.screenshot.startsWith('https://')) {
                        legacyScreenshot = data.screenshot;
                    } else if (data.screenshot.length > 0) {
                        legacyScreenshot = `data:image/png;base64,${data.screenshot}`;
                    }
                } else {
                    legacyScreenshot = normalizeUrlOrDataUri(data.screenshot);
                }

                if (!legacyScreenshot && data.screenshotBuffer) {
                    legacyScreenshot = normalizeUrlOrDataUri(data.screenshotBuffer);
                }

                let resolvedScreenshotUrl = null;
                const normalizeUrl = (value) => {
                    if (!value || !value.startsWith) return null;
                    if (value.startsWith('/')) {
                        return BACKEND_SERVICE_URL.replace(/\/$/, '') + value;
                    }
                    return value;
                };

                if (rawScreenshotUrlValue) {
                    resolvedScreenshotUrl = normalizeUrl(rawScreenshotUrlValue);
                }
                if (!resolvedScreenshotUrl && originalScreenshotUrlValue) {
                    resolvedScreenshotUrl = normalizeUrl(originalScreenshotUrlValue);
                }

                let finalScreenshotUrl = null;
                let base64DataForStorage = null;

                const resolvedIsDataUri = typeof resolvedScreenshotUrl === 'string' && resolvedScreenshotUrl.startsWith('data:image/');

                if (preferDataUri && (screenshotDataUri || resolvedIsDataUri)) {
                    finalScreenshotUrl = screenshotDataUri || resolvedScreenshotUrl;
                    base64DataForStorage = finalScreenshotUrl;
                } else if (!preferDataUri && typeof resolvedScreenshotUrl === 'string' && !resolvedIsDataUri) {
                    finalScreenshotUrl = resolvedScreenshotUrl;
                    if (screenshotDataUri) {
                        base64DataForStorage = screenshotDataUri;
                    }
                } else if (screenshotDataUri || resolvedIsDataUri) {
                    const dataUriValue = screenshotDataUri || resolvedScreenshotUrl;
                    base64DataForStorage = dataUriValue;
                    if (preferDataUri) {
                        finalScreenshotUrl = dataUriValue;
                    } else {
                        // Use data URI directly (more reliable than blob URLs)
                        finalScreenshotUrl = dataUriValue;
                        console.log('✅ Using data URI for screenshot (CSP-safe)');
                    }
                } else if (legacyScreenshot) {
                    console.log('⚠️ Legacy screenshot field detected, converting to data URI');
                    base64DataForStorage = legacyScreenshot;
                    finalScreenshotUrl = legacyScreenshot;
                } else if (typeof resolvedScreenshotUrl === 'string') {
                    finalScreenshotUrl = resolvedScreenshotUrl;
                } else {
                    throw new Error('No screenshot data or URL in response');
                }

                console.log(`📊 Analysis received: ${analysis.pageType} (confidence: ${Math.round(analysis.confidence * 100)}%)`);

                const cacheEntry = cache.get(url);
                if (cacheEntry && cacheEntry.screenshotUrl && cacheEntry.screenshotUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(cacheEntry.screenshotUrl);
                }

                cache.set(url, {
                    screenshotUrl: finalScreenshotUrl,
                    base64Data: base64DataForStorage,
                    analysis: analysis,
                    text: extractedText,
                    originalUrl: resolvedScreenshotUrl,
                    timestamp: Date.now(),
                    mcpResource: data.mcpResource || null
                });

                if (base64DataForStorage) {
                    await saveToIndexedDB(url, base64DataForStorage);
                }

                console.log(`✅ Context cached successfully (screenshot + analysis)`);
                return {
                    screenshotUrl: finalScreenshotUrl,
                    analysis: analysis,
                    text: extractedText,
                    base64Data: base64DataForStorage,
                    usedDataUri: preferDataUri || (typeof finalScreenshotUrl === 'string' && finalScreenshotUrl.startsWith('data:')),
                    originalScreenshotUrl: resolvedScreenshotUrl
                };

            } catch (error) {
                if (error.message.includes('Extension context invalidated') ||
                    error.message.includes('Extension was reloaded') ||
                    error.message.includes('message port closed')) {
                    console.log(`ℹ️ Extension was reloaded. Reload this page to enable tooltips.`);
                    throw error;
                }

                console.error(`❌ Failed to fetch context for ${url}:`, error);

                let errorMessage = error.message;
                const isTimeout = error.message.includes('504') ||
                                 error.message.includes('timeout') ||
                                 error.message.includes('Timeout') ||
                                 error.message.includes('Page load timeout');
                const is403 = error.message.includes('403') || error.message.includes('blocked');
                const is404 = error.message.includes('404') || error.message.includes('not found');
                const is500 = error.message.includes('500') || error.message.includes('Internal Server');
                const is502 = error.message.includes('502') || error.message.includes('Bad Gateway');
                const is503 = error.message.includes('503') || error.message.includes('Service Unavailable');
                const isFailedFetch = error.message.includes('Failed to fetch');

                if (is502) {
                    errorMessage = '🔧 Bad Gateway (502): The backend received an invalid response from its internal service. The backend may be restarting or there\'s a communication issue. Please try again in a few moments.';
                } else if (is503) {
                    errorMessage = '🔧 Backend service temporarily unavailable (503): The screenshot service is currently down or overloaded. Please try again in a few moments.';
                } else if (isTimeout) {
                    errorMessage = '⏱️ Page load timeout: This page took too long to load. The site may be slow, blocking automated access, or require authentication.';
                } else if (is403) {
                    errorMessage = '🚫 Access denied: This site blocks automated access. Try visiting the page manually in your browser first.';
                } else if (is404) {
                    errorMessage = '❌ Page not found: The requested URL does not exist or is no longer available.';
                } else if (is500) {
                    errorMessage = '🔧 Backend server error: There was a problem processing this request. Please try again later.';
                } else if (error.message.includes('484')) {
                    errorMessage = '⚠️ Invalid backend response: Check your backend URL in extension settings.';
                } else if (isFailedFetch) {
                    errorMessage = '🌐 Network error: Backend may be unreachable. Check your internet connection and backend URL settings.';
                }

                console.error(`❌ Error details:`, {
                    message: errorMessage,
                    originalError: error.message,
                    backendUrl: BACKEND_SERVICE_URL,
                    url: url,
                    retryCount: retryCount,
                    preferDataUri,
                    note: 'Request proxied through background script to avoid Mixed Content'
                });

                if (error.message.includes('Extension context invalidated') ||
                    error.message.includes('Extension was reloaded') ||
                    error.message.includes('message port closed')) {
                    throw error;
                }

                if (retryCount < maxRetries && !is403 && !is404 && (is502 || is503 || isTimeout || is500 || isFailedFetch)) {
                    const retryDelayForGateway = (is502 || is503) ? retryDelay * 2 : retryDelay;
                    const errorType = is502 ? '502 Bad Gateway' : (is503 ? '503 Service Unavailable' : '');
                    console.log(`🔄 Retrying in ${retryDelayForGateway / 1000}s... (attempt ${retryCount + 2}/${maxRetries + 1})${errorType ? ` [${errorType} - using longer delay]` : ''}`);
                    await new Promise(resolve => setTimeout(resolve, retryDelayForGateway));
                    return fetchContext(url, options, retryCount + 1);
                }

                throw error;
            }
        }

        // Fetch screenshot from backend with retry mechanism (backward compatibility)
        // DEPRECATED: Use fetchContext() instead for better performance
        async function fetchScreenshot(url, retryCount = 0) {
            // Redirect to fetchContext but only return screenshot URL for compatibility
            try {
                const context = await fetchContext(url, {}, retryCount);
                return context.screenshotUrl;
            } catch (error) {
                throw error;
            }
        }
        
        // Load screenshot from IndexedDB
        async function loadFromIndexedDB(url) {
            if (!db) return null;
            
            try {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(url);
                
                return new Promise((resolve, reject) => {
                    request.onsuccess = () => {
                        if (request.result && isCacheValid(request.result)) {
                            console.log(`📦 IndexedDB hit: ${url}`);
                            
                            // Get the base64 data from the stored result
                            const base64Data = request.result.screenshotData || request.result.screenshotUrl;
                            
                            if (!base64Data) {
                                console.warn('No screenshot data found in IndexedDB for:', url);
                                resolve(null);
                                return;
                            }
                            
                            try {
                                // Use data URI directly (more reliable than blob URLs)
                                let dataUri = base64Data;
                                
                                // Ensure it's a proper data URI
                                if (!dataUri.startsWith('data:image/')) {
                                    // Convert base64 string to data URI
                                    dataUri = `data:image/png;base64,${base64Data}`;
                                }
                                
                                console.log(`✅ Loaded IndexedDB data as data URI: ${url}`);
                                
                                // Also update memory cache (store data URI and base64 data)
                                cache.set(url, {
                                    screenshotUrl: dataUri,
                                    base64Data: base64Data, // Store original base64 for OCR
                                    timestamp: request.result.timestamp
                                });
                                
                                resolve(dataUri);
                            } catch (e) {
                                console.warn('Failed to process IndexedDB data:', e);
                                resolve(null);
                            }
                        } else {
                            resolve(null);
                        }
                    };
                    request.onerror = () => reject(request.error);
                });
            } catch (error) {
                console.warn('IndexedDB read error:', error);
                return null;
            }
        }
        
        // Save screenshot to IndexedDB
        async function saveToIndexedDB(url, base64Data) {
            if (!db) return;
            
            try {
                const data = {
                    url: url,
                    screenshotData: base64Data, // Store the actual base64 image data
                    timestamp: Date.now()
                };
                
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                await store.put(data);
                console.log(`💾 Saved screenshot data to IndexedDB: ${url} (${base64Data.length} chars)`);
            } catch (error) {
                console.warn('IndexedDB write error:', error);
            }
        }
        
        // Get context (screenshot + analysis) from cache or fetch
        async function getContext(url) {
            // Check memory cache first
            const cacheEntry = cache.get(url);
            if (isCacheValid(cacheEntry)) {
                console.log(`💾 Memory cache hit: ${url}`);
                return {
                    screenshotUrl: cacheEntry.screenshotUrl,
                    analysis: cacheEntry.analysis || null,
                    text: cacheEntry.text || '',
                    base64Data: cacheEntry.base64Data || null,
                    usedDataUri: !!(cacheEntry.screenshotUrl && cacheEntry.screenshotUrl.startsWith('data:')),
                    originalScreenshotUrl: cacheEntry.originalUrl || null
                };
            }
            
            // Try IndexedDB (but we need to fetch context if analysis not in cache)
            const indexedDBScreenshot = await loadFromIndexedDB(url);
            if (indexedDBScreenshot && cacheEntry && cacheEntry.analysis) {
                return {
                    screenshotUrl: indexedDBScreenshot,
                    analysis: cacheEntry.analysis,
                    text: cacheEntry.text || '',
                    base64Data: cacheEntry.base64Data || null,
                    usedDataUri: !!(indexedDBScreenshot && indexedDBScreenshot.startsWith('data:')),
                    originalScreenshotUrl: cacheEntry.originalUrl || null
                };
            }
            
            // Fetch from backend (new consolidated endpoint)
            console.log(`🌐 Fetching context from backend: ${url}`);
            const context = await fetchContext(url, { preferDataUri: true });
            
            return context;
        }
        
        // Get screenshot (from IndexedDB, cache, or fetch) - backward compatibility
        // DEPRECATED: Use getContext() instead
        async function getScreenshot(url) {
            const context = await getContext(url);
            return context.screenshotUrl;
        }
        
        // Extract info from local button
        function getLocalButtonInfo(element) {
            const info = {
                text: '',
                type: 'button',
                label: '',
                purpose: '',
                shortcut: '',
                state: 'enabled'
            };
            
            // Get button text
            info.text = element.textContent?.trim() || element.innerText?.trim() || '';
            
            // Get aria-label or title
            info.label = element.getAttribute('aria-label') || element.getAttribute('title') || info.text;
            
            // Detect button type
            if (element.tagName === 'BUTTON' || element.type === 'button') {
                info.type = 'button';
            } else if (element.type === 'submit') {
                info.type = 'submit';
            } else if (element.type === 'reset') {
                info.type = 'reset';
            } else if (element.getAttribute('role') === 'button') {
                info.type = 'button';
            }
            
            // Get state
            if (element.disabled || element.hasAttribute('disabled')) {
                info.state = 'disabled';
            }
            
            // Detect purpose from text
            const lowerText = info.text.toLowerCase();
            if (lowerText.includes('submit') || lowerText.includes('send')) {
                info.purpose = 'Submits form';
            } else if (lowerText.includes('save')) {
                info.purpose = 'Saves changes';
            } else if (lowerText.includes('cancel')) {
                info.purpose = 'Cancels action';
            } else if (lowerText.includes('delete') || lowerText.includes('remove')) {
                info.purpose = 'Deletes item';
            } else if (lowerText.includes('add') || lowerText.includes('create')) {
                info.purpose = 'Creates new item';
            } else if (lowerText.includes('edit')) {
                info.purpose = 'Edit item';
            } else if (lowerText.includes('search')) {
                info.purpose = 'Searches';
            } else if (lowerText.includes('close')) {
                info.purpose = 'Closes dialog';
            }
            
            // Get keyboard shortcut
            const accesskey = element.getAttribute('accesskey');
            if (accesskey) {
                info.shortcut = `Alt+${accesskey.toUpperCase()}`;
            }
            
            return info;
        }
        
        // Show info tooltip for local button
        function showInfoTooltip(x, y, buttonInfo) {
            if (!tooltipDiv) {
                tooltipDiv = createTooltipElement();
            }
            
            // Log tooltip event for AI awareness
            logTooltipEvent({
                url: window.location.href,
                element: 'button',
                elementText: buttonInfo.label || buttonInfo.text || '',
                buttonInfo: buttonInfo,
                isButton: true
            });
            
                    const stateIcon = buttonInfo.state === 'disabled' ? '❌' : '✅';
            const typeIcon = buttonInfo.type === 'submit' ? '📤' : 
                            buttonInfo.type === 'reset' ? '🔄' : '🔘';
            
            tooltipDiv.innerHTML = `
                <div style="padding: 12px; min-width: 200px; max-width: ${MAX_TOOLTIP_WIDTH}px; font-family: 'Montserrat', sans-serif;">
                    <div style="font-weight: 500; font-size: 14px; color: rgba(255, 255, 255, 0.95); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        ${typeIcon} <span>${buttonInfo.label || buttonInfo.text || 'Button'}</span>
                    </div>
                    ${buttonInfo.purpose ? `<div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-bottom: 6px;">${buttonInfo.purpose}</div>` : ''}
                    ${buttonInfo.shortcut ? `<div style="font-size: 11px; color: rgba(255, 255, 255, 0.5); font-style: italic;">⌨️ ${buttonInfo.shortcut}</div>` : ''}
                    <div style="font-size: 10px; color: rgba(255, 255, 255, 0.5); margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                        ${stateIcon} ${buttonInfo.state}
                    </div>
                </div>
            `;
            
            tooltipDiv.style.display = 'block';
            
            // Position tooltip
            requestAnimationFrame(() => {
                const rect = tooltipDiv.getBoundingClientRect();
                let left = x + 10;
                let top = y + 10;
                
                if (left + rect.width > window.innerWidth) {
                    left = x - rect.width - 10;
                }
                if (left < 0) left = 10;
                
                if (top + rect.height > window.innerHeight) {
                    top = y - rect.height - 10;
                }
                if (top < 0) top = 10;
                
                tooltipDiv.style.left = left + 'px';
                tooltipDiv.style.top = top + 'px';
                
                setTimeout(() => {
                    tooltipDiv.style.opacity = '1';
                }, 10);
            });
            
            activeTooltip.isVisible = true;
            activeTooltip.displayStartTime = Date.now();
        }
        
        // Handle link hover
        function handleLinkHover(event) {
            console.log('🔗 Link hover detected!', event.currentTarget?.href || event.currentTarget);
            // Tooltips are always enabled
            
            const element = event.currentTarget;
            const url = getElementUrl(element);
            
            // Handle local buttons (no URL or same-page links)
            if (!url || url === window.location.href || url.startsWith('#') || url.startsWith('/') && !url.startsWith('http')) {
                // Check if it's a button or interactive element
                const isButton = element.tagName === 'BUTTON' || 
                                 element.getAttribute('role') === 'button' || 
                                 element.type === 'button' || 
                                 element.type === 'submit' ||
                                 element.type === 'reset';
                
                if (isButton) {
                    // Show info tooltip for local button
                    const buttonInfo = getLocalButtonInfo(element);
                    showInfoTooltip(event.clientX, event.clientY, buttonInfo);
                }
                return;
            }
            
            // Skip mailto: links (email addresses)
            if (url.startsWith('mailto:')) {
                return;
            }
            
            // Skip javascript: and data: links
            if (url.startsWith('javascript:') || url.startsWith('data:')) {
                return;
            }
            
            // Skip anchors to same page
            if (url.startsWith('#') || (url.startsWith('/') && !url.includes('http'))) {
                return;
            }
            
            // Skip problematic URLs that are likely to timeout or fail
            if (url.includes('linkedin.com/me/') || 
                url.includes('/profile-views/') ||
                url.includes('tscp?destination') ||
                url.includes('/authenticate') ||
                url.includes('/login')) {
                console.log(`⏭️ Skipping auth/session URL: ${url}`);
                return;
            }
            
            // Skip only problematic banking URLs that require authentication
            if (url.includes('wellsfargo.com') && (
                url.includes('/yourinfo/') ||
                url.includes('/account/') ||
                url.includes('/transfer') ||
                url.includes('/payments') ||
                url.includes('/login') ||
                url.includes('/signin') ||
                url.includes('/auth/') ||
                url.includes('/enrollment') ||
                url.includes('/authentication')
            )) {
                console.log(`🏦 Skipping banking auth URL: ${url}`);
                return;
            }
            
            // Cancel any pending hide operations
            if (activeTooltip.hideTimeout) {
                clearTimeout(activeTooltip.hideTimeout);
                activeTooltip.hideTimeout = null;
                // If tooltip is already showing and mouse is still over element, just update position
                if (activeTooltip.isVisible && activeTooltip.currentUrl === url && tooltipDiv) {
                    // Don't hide, just let it stay
                    return;
                }
            }
            
            // If hovering over the same element and tooltip is showing, don't re-trigger
            if (activeTooltip.currentUrl === url && activeTooltip.element === element && activeTooltip.isVisible) {
                return;
            }
            
            // Clear previous timeout
            if (activeTooltip.timeout) {
                clearTimeout(activeTooltip.timeout);
                activeTooltip.timeout = null;
            }
            
            // Set active element
            activeTooltip.element = element;
            activeTooltip.currentUrl = url;
            activeTooltip.cspFallbackAttempted = false;
            activeTooltip.usingDataUri = false;
            
            // Check cache first
            const cacheEntry = cache.get(url);
            if (cacheEntry && isCacheValid(cacheEntry)) {
                // Cached - show after delay with cognitive summary
                activeTooltip.timeout = setTimeout(() => {
                    if (activeTooltip.element === element && activeTooltip.currentUrl === url && !activeTooltip.isVisible) {
                        // Show tooltip with cognitive summary and cached screenshot
                        showTooltip(event.clientX, event.clientY, cacheEntry.screenshotUrl, cacheEntry.analysis, cacheEntry.text);
                        activeTooltip.usingDataUri = !!(cacheEntry.screenshotUrl && cacheEntry.screenshotUrl.startsWith('data:'));
                        activeTooltip.cspFallbackAttempted = activeTooltip.usingDataUri;
                        // Log tooltip event for AI awareness with full context
                        logTooltipEvent({
                            url: url,
                            element: element.tagName.toLowerCase(),
                            elementText: element.textContent?.trim() || '',
                            ocrText: cacheEntry.text || null,
                            analysis: cacheEntry.analysis || null,
                            screenshotUrl: cacheEntry.screenshotUrl || null,
                            pageTitle: document.title || ''
                        });
                        
                                // Show proactive tooltip context in chat using unified template
                                if (cacheEntry.analysis && typeof window.renderTooltipContextInChat === 'function' && typeof window.addChatMessage === 'function') {
                                    setTimeout(() => {
                                        // Use unified template to render tooltip context in chat
                                        window.renderTooltipContextInChat({
                                            screenshotUrl: cacheEntry.screenshotUrl,
                                            analysis: cacheEntry.analysis,
                                            text: cacheEntry.text || '',
                                            url: url,
                                            usedDataUri: !!(cacheEntry.screenshotUrl && cacheEntry.screenshotUrl.startsWith('data:'))
                                        }, window.addChatMessage);
                                        
                                        // Also add intelligent summary about what the tooltip shows (only once per URL)
                                        if (!tooltipSummariesSent.has(url) && typeof window.generateTooltipSummary === 'function') {
                                            const summary = window.generateTooltipSummary({
                                                analysis: cacheEntry.analysis,
                                                text: cacheEntry.text || ''
                                            }, url);
                                            if (summary) {
                                                tooltipSummariesSent.add(url); // Mark as sent
                                                setTimeout(() => {
                                                    if (typeof window.addChatMessage === 'function') {
                                                        window.addChatMessage(`🔍 Tooltip preview: ${summary}`, 'bot');
                                                    }
                                                }, 800);
                                            }
                                        }
                                    }, 500);
                                } else if (cacheEntry.text && typeof window.addProactiveOCRSummary === 'function') {
                                    // Fallback to old method if template not available
                                    setTimeout(() => {
                                        window.addProactiveOCRSummary(cacheEntry.text, url);
                                    }, 500);
                                }
                    }
                }, HOVER_DELAY);
                return;
            }
            
            // Not cached - fetch context with delay
            activeTooltip.timeout = setTimeout(() => {
                // Only proceed if still on same element and not already visible
                if (activeTooltip.element === element && activeTooltip.currentUrl === url && !activeTooltip.isVisible) {
                    // Show loading state immediately (no analysis yet)
                    showTooltip(event.clientX, event.clientY, null, null);
                    
                    // Set a timeout to hide loading if it takes too long
                    const loadingTimeout = setTimeout(() => {
                        if (tooltipDiv && activeTooltip.isVisible) {
                            console.warn('Context load timeout, hiding tooltip');
                            hideTooltip();
                        }
                    }, 120000); // 2 minute timeout
                    
                    // Fetch context (screenshot + analysis)
                    getContext(url)
                        .then(context => {
                            clearTimeout(loadingTimeout);
                            // Check if still valid before showing
                            if (activeTooltip.element === element && activeTooltip.currentUrl === url) {
                                activeTooltip.usingDataUri = !!context.usedDataUri;
                                activeTooltip.cspFallbackAttempted = !!context.usedDataUri;
                                // Show cognitive summary with screenshot (screenshot now displays immediately)
                                showTooltip(event.clientX, event.clientY, context.screenshotUrl, context.analysis, context.text);
                                
                                // Log tooltip event for AI awareness with full context
                                logTooltipEvent({
                                    url: url,
                                    element: element.tagName.toLowerCase(),
                                    elementText: element.textContent?.trim() || '',
                                    ocrText: context.text || null,
                                    analysis: context.analysis || null,
                                    screenshotUrl: context.screenshotUrl || null,
                                    pageTitle: document.title || ''
                                });
                                
                                // Show proactive tooltip context in chat using unified template
                                if (context.analysis && typeof window.renderTooltipContextInChat === 'function' && typeof window.addChatMessage === 'function') {
                                    setTimeout(() => {
                                        // Use unified template to render tooltip context in chat
                                        window.renderTooltipContextInChat({
                                            screenshotUrl: context.screenshotUrl,
                                            analysis: context.analysis,
                                            text: context.text || '',
                                            url: url,
                                            usedDataUri: context.usedDataUri || false
                                        }, window.addChatMessage);
                                        
                                        // Also add intelligent summary about what the tooltip shows (only once per URL)
                                        if (!tooltipSummariesSent.has(url) && typeof window.generateTooltipSummary === 'function') {
                                            const summary = window.generateTooltipSummary(context, url);
                                            if (summary) {
                                                tooltipSummariesSent.add(url); // Mark as sent
                                                setTimeout(() => {
                                                    if (typeof window.addChatMessage === 'function') {
                                                        window.addChatMessage(`🔍 Tooltip preview: ${summary}`, 'bot');
                                                    }
                                                }, 800);
                                            }
                                        }
                                    }, 500); // Small delay to let tooltip render first
                                } else if (context.text && typeof window.addProactiveOCRSummary === 'function') {
                                    // Fallback to old method if template not available
                                    setTimeout(() => {
                                        if (context.text && context.text.trim().length > 0) {
                                            window.addProactiveOCRSummary(context.text, url);
                                        }
                                    }, 500);
                                }
                            }
                        })
                        .catch(error => {
                            clearTimeout(loadingTimeout);
                            console.warn('Failed to load context:', error);
                            if (activeTooltip.element === element && activeTooltip.currentUrl === url && tooltipDiv) {
                                // Show error message
                                let errorMessage = '⚠️ Failed to load preview';
                                
                                if (error.message.includes('timeout') || error.message.includes('Timeout')) {
                                    errorMessage = '⏱️ Site loading timeout - try again later';
                                } else if (error.message.includes('500')) {
                                    errorMessage = '🔧 Server error - backend may be restarting';
                                } else if (error.message.includes('Failed to fetch')) {
                                    errorMessage = '🌐 Network error - check connection';
                                }
                                
                                tooltipDiv.innerHTML = `<div style="padding: 15px; text-align: center; color: rgba(244, 67, 54, 0.9); font-size: 12px; font-family: Montserrat, sans-serif;">${errorMessage}</div>`;
                                // Auto-hide error after 3 seconds
                                setTimeout(() => hideTooltip(), 3000);
                            }
                        });
                }
            }, HOVER_DELAY);
        }
        
        // Handle mouse leave
        function handleLinkLeave() {
            // Don't hide immediately, wait a bit to prevent flickering
            activeTooltip.hideTimeout = setTimeout(() => {
                // Clear the active state
                activeTooltip.element = null;
                activeTooltip.currentUrl = null;
                
                // Clear any pending show timeout
                if (activeTooltip.timeout) {
                    clearTimeout(activeTooltip.timeout);
                    activeTooltip.timeout = null;
                }
                
                // Hide the tooltip
                hideTooltip();
            }, HIDE_DELAY);
        }
        
        // Use event delegation for better Gmail compatibility
        function attachToLinks() {
            // Remove old direct listeners if any
            document.removeEventListener('mouseenter', delegateHandleEnter, true);
            document.removeEventListener('mouseleave', delegateHandleLeave, true);
            
            // Add event delegation listeners
            document.addEventListener('mouseenter', delegateHandleEnter, true);
            document.addEventListener('mouseleave', delegateHandleLeave, true);
        }
        
        // Delegated mouseenter handler
        function delegateHandleEnter(event) {
            // Safely get the target element
            const target = event.target;
            if (!target || typeof target.closest !== 'function') {
                return;
            }
            
            // Check for clickable element
            const clickable = target.closest('a[href], button, [role="button"], [role="link"], [onclick], [data-href], [data-clickable], [data-url], [data-to], [data-path]');
            if (clickable && isClickableElement(clickable) && getElementUrl(clickable)) {
                handleLinkHover({ 
                    currentTarget: clickable, 
                    clientX: event.clientX, 
                    clientY: event.clientY 
                });
            }
        }
        
        // Delegated mouseleave handler
        function delegateHandleLeave(event) {
            // Safely get the target element
            const target = event.target;
            if (!target || typeof target.closest !== 'function') {
                return;
            }
            
            // Check for clickable element
            const clickable = target.closest('a[href], button, [role="button"], [role="link"], [onclick], [data-href], [data-clickable], [data-url], [data-to], [data-path]');
            if (clickable && isClickableElement(clickable)) {
                handleLinkLeave.call(clickable);
            }
        }
        
        // Detect if element is clickable
        function isClickableElement(element) {
            if (!element) return false;
            
            // Ignore hidden elements
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return false;
            }
            
            // Check for links
            if (element.tagName === 'A' && element.href) return true;
            
            // Check for buttons
            if (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button') return true;
            
            // Check for elements with onclick handlers
            if (element.onclick || element.getAttribute('onclick')) return true;
            
            // Check for elements with data-clickable or role attributes
            if (element.dataset.clickable || element.getAttribute('role') === 'link') return true;
            
            // Check for anchor tags (even without href)
            if (element.tagName === 'A') return true;
            
            // Check for clickable divs/spans with specific attributes
            if (element.dataset.href || element.dataset.url || element.dataset.to || element.dataset.path) return true;
            
            // Check for common clickable patterns (LinkedIn, Twitter, etc.)
            const clickableClasses = ['clickable', 'button', 'link', 'nav-item', 'action', 'btn', 'card', 'tile', 'item'];
            const classList = (element.className || '').toLowerCase();
            const id = (element.id || '').toLowerCase();
            
            // Check if class name contains clickable indicators
            if (clickableClasses.some(cls => classList.includes(cls))) return true;
            
            // Check if element is inside a link
            const parentLink = element.closest('a[href]');
            if (parentLink && parentLink.href) return true;
            
            // Check cursor style (might indicate clickability)
            if (style.cursor === 'pointer') return true;
            
            // Check for common framework attributes
            if (element.dataset.testid || element.dataset.cy || element.dataset.testId) {
                const url = getElementUrl(element);
                if (url) return true;
            }
            
            return false;
        }
        
        // Get URL from any clickable element
        function getElementUrl(element) {
            // Direct href attribute
            if (element.href) return element.href;
            
            // Data attributes (many frameworks use these)
            if (element.dataset.href) return element.dataset.href;
            if (element.dataset.url) return element.dataset.url;
            if (element.dataset.link) return element.dataset.link;
            if (element.dataset.to) return element.dataset.to; // React Router
            if (element.dataset.path) return element.dataset.path;
            
            // Check for onclick attribute that might contain URL
            const onclick = element.getAttribute('onclick') || element.onclick?.toString();
            if (onclick) {
                const urlMatch = onclick.match(/["'](https?:\/\/[^"']+)["']/);
                if (urlMatch) return urlMatch[1];
            }
            
            // Check for aria-label or title that might contain a URL
            const ariaLabel = element.getAttribute('aria-label');
            if (ariaLabel) {
                const urlMatch = ariaLabel.match(/https?:\/\/[^\s]+/);
                if (urlMatch) return urlMatch[0];
            }
            
            // Check parent link element (handles buttons inside links)
            const link = element.closest('a[href]');
            if (link && link.href) return link.href;
            
            // Check for next siblings that are links (common pattern: button + hidden link)
            let sibling = element.nextElementSibling;
            if (sibling && sibling.tagName === 'A' && sibling.href) {
                return sibling.href;
            }
            
            // Check for form submission that might redirect
            if (element.type === 'submit' && element.form && element.form.action) {
                return element.form.action;
            }
            
            return null;
        }
        
        // Also attach directly for performance on existing clickable elements
        function attachDirectListeners() {
            // Get all potential clickable elements (broader selector)
            const clickables = document.querySelectorAll(
                'a[href], button, [role="button"], [role="link"], [onclick], ' +
                '[data-href], [data-clickable], [data-url], [data-to], [data-path]'
            );
            
            let attachedCount = 0;
            clickables.forEach(element => {
                // Skip if already has listeners
                if (element.dataset.tooltipAttached === 'true') {
                    return;
                }
                
                // Only attach if actually clickable and has a URL
                if (isClickableElement(element) && getElementUrl(element)) {
                    element.dataset.tooltipAttached = 'true';
                    element.addEventListener('mouseenter', handleLinkHover, { capture: true });
                    element.addEventListener('mouseleave', handleLinkLeave, { capture: true });
                    attachedCount++;
                }
            });
            if (attachedCount > 0) {
                console.log(`✅ Attached tooltip listeners to ${attachedCount} clickable elements`);
            }
        }
        
        // Observe DOM changes for dynamically added links
        function observeDOM() {
            const observer = new MutationObserver(() => {
                // Re-attach direct listeners for new links
                attachDirectListeners();
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Also handle iframes (common in Gmail)
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    iframe.addEventListener('load', () => {
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (iframeDoc) {
                                const iframeLinks = iframeDoc.querySelectorAll('a[href]');
                                iframeLinks.forEach(link => {
                                    if (!link.dataset.tooltipAttached) {
                                        link.dataset.tooltipAttached = 'true';
                                        link.addEventListener('mouseenter', (e) => {
                                            handleLinkHover({
                                                currentTarget: link,
                                                clientX: e.clientX + iframe.offsetLeft,
                                                clientY: e.clientY + iframe.offsetTop
                                            });
                                        }, { capture: true });
                                    }
                                });
                            }
                        } catch (e) {
                            // Cross-origin iframe, skip
                        }
                    });
                } catch (e) {
                    // Can't access iframe
                }
            });
        }
        
        // Batch precrawl function - works with ALL clickable elements
        window.spiderPrecrawl = async function(maxItems = 50) {
            // Get all potential clickable elements (broader selector)
            const allClickables = Array.from(document.querySelectorAll(
                'a[href], button, [role="button"], [role="link"], [onclick], ' +
                '[data-href], [data-clickable], [data-url], [data-to], [data-path], ' +
                '[cursor="pointer"], .btn, .button, .clickable, .link, .card, .tile'
            ));
            
            // Filter to only actually clickable elements
            const validClickables = allClickables.filter(el => {
                // Must be visible
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                
                // Must be clickable
                if (!isClickableElement(el)) return false;
                
                // Must have a URL
                const url = getElementUrl(el);
                if (!url) return false;
                
                return true;
            });
            
            // Extract URLs and filter
            const urls = validClickables
                .map(el => getElementUrl(el))
                .filter(url => url && 
                    !url.includes(window.location.hostname) &&  // Skip same-page links
                    !url.startsWith('mailto:') &&
                    !url.startsWith('javascript:') &&
                    !url.startsWith('data:') &&
                    !url.startsWith('#') &&
                    (url.startsWith('http://') || url.startsWith('https://')) // Only HTTP/HTTPS
                )
                .filter((url, index, self) => self.indexOf(url) === index) // Remove duplicates
                .slice(0, maxItems);
            
            console.log(`🕷️ Pre-caching ${urls.length} clickable elements...`);
            console.log(`   Target: ${maxItems} | Found: ${urls.length} valid URLs`);
            console.log(`   Sample URLs:`, urls.slice(0, 5));
            
            let completed = 0;
            let cached = 0;
            let failed = 0;
            
            // Process in batches to avoid overwhelming the backend
            const batchSize = 5;
            for (let i = 0; i < urls.length; i += batchSize) {
                const batch = urls.slice(i, i + batchSize);
                const batchPromises = batch.map(async (url) => {
                    try {
                        await getScreenshot(url);
                        cached++;
                        completed++;
                        return { url, success: true };
                    } catch (error) {
                        failed++;
                        completed++;
                        return { url, success: false, error: error.message };
                    }
                });
                
                const results = await Promise.all(batchPromises);
                console.log(`   [${completed}/${urls.length}] Processed batch - Cached: ${results.filter(r => r.success).length} | Failed: ${results.filter(r => !r.success).length}`);
                
                // Log failures for debugging
                results.filter(r => !r.success).forEach(r => {
                    console.warn(`   ❌ Failed: ${r.url.substring(0, 50)}... - ${r.error}`);
                });
            }
            
            console.log(`✅ Pre-cache complete!`);
            console.log(`   📊 Summary: Cached: ${cached} | Failed: ${failed} | Total: ${urls.length}`);
            
            return { cached, failed, total: urls.length };
        };
        
        // Initialize
        attachToLinks();
        attachDirectListeners();
        observeDOM();
        
        // Also observe iframes
        const iframeObserver = new MutationObserver(() => {
            observeDOM();
        });
        iframeObserver.observe(document.body, { childList: true, subtree: true });
        
        console.log('✅ Tooltip system initialized. Use window.spiderPrecrawl() to pre-cache links.');
        
        // Auto-precrawl top links on page load for instant tooltips
        function autoPrecrawlTopLinks() {
            // Wait for page to settle
            setTimeout(() => {
                // Tooltips always enabled - proceed with precrawl
                
                console.log('🤖 Auto-precrawling top links for instant tooltips...');
                
                // Get all links on the page
                const allLinks = Array.from(document.querySelectorAll('a[href]'));
                const validLinks = allLinks
                    .filter(link => {
                        const url = link.href;
                        if (!url) return false;
                        if (url.includes(window.location.hostname)) return false; // Skip same-domain
                        if (url.startsWith('mailto:')) return false;
                        if (url.startsWith('javascript:')) return false;
                        if (!url.startsWith('http')) return false;
                        return true;
                    })
                    .map(link => link.href)
                    .filter((url, index, self) => self.indexOf(url) === index) // Remove duplicates
                    .slice(0, 20); // Take top 20
                
                if (validLinks.length === 0) {
                    console.log('⏭️ No external links to precrawl');
                    return;
                }
                
                console.log(`🕷️ Pre-caching ${validLinks.length} links in background...`);
                
                // Pre-crawl in background (don't await, let it run silently)
                validLinks.forEach(async (url) => {
                    try {
                        // Check if already cached
                        const cacheEntry = cache.get(url);
                        if (cacheEntry && isCacheValid(cacheEntry)) {
                            return; // Already cached, skip
                        }
                        
                        // Try to get from IndexedDB
                        const existing = await loadFromIndexedDB(url);
                        if (existing) {
                            return; // Already in IndexedDB, skip
                        }
                        
                        // Otherwise, fetch in background (don't await - fire and forget)
                        getScreenshot(url).catch(err => {
                            // Silently fail, don't spam console
                        });
                    } catch (error) {
                        // Silently fail
                    }
                });
                
                console.log(`✅ Background precrawl started for ${validLinks.length} links`);
            }, 3000); // Wait 3 seconds for page to fully load
        }
        
        // Start auto-precrawl
        autoPrecrawlTopLinks();
        
        // Also precrawl on navigation (SPA pages)
        let lastUrl = window.location.href;
        const urlCheck = setInterval(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                console.log('🔄 Page navigated, starting new auto-precrawl...');
                autoPrecrawlTopLinks();
            }
        }, 1000);
        
        // Initialize chat widget (with delay for Gmail)
        console.log('🚀 Initializing chat widget with backend URL:', BACKEND_SERVICE_URL);
        const isGmail = window.location.hostname.includes('gmail.com');
        const delay = isGmail ? 2000 : 0; // 2 second delay for Gmail
        
        console.log(`🔧 Gmail detected: ${isGmail}, delay: ${delay}ms`);
        
        setTimeout(() => {
            console.log('🔧 Timeout callback executing...');
            try {
                initChatWidget(BACKEND_SERVICE_URL);
                console.log('✅ Chat widget initialization completed');
            } catch (error) {
                console.error('❌ Chat widget initialization failed:', error);
            }
        }, delay);
    }
    
    // Initialize floating chat widget
    function initChatWidget(backendUrl) {
        console.log('📎 Creating chat widget with backend URL:', backendUrl);
        console.log('📎 Current page:', window.location.href);
        console.log('📎 User agent:', navigator.userAgent);
        
        // Check if innerHTML is blocked by CSP
        try {
            const testDiv = document.createElement('div');
            testDiv.innerHTML = '<span>test</span>';
            console.log('📎 innerHTML test passed');
        } catch (error) {
            console.log('📎 innerHTML blocked by CSP:', error.message);
        }
        
        // Create minimal chat widget that expands with content
        const chatHTML = `
            <div id="playwright-chat-widget" style="display: block; position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;">
                <div class="chat-container" style="position: absolute; bottom: 70px; right: 0; width: 320px; 
                    background: rgba(15, 15, 15, 0.85); 
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px; 
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1);
                    display: none;
                    flex-direction: column; 
                    overflow: hidden;
                    min-width: 280px;
                    max-width: 400px;
                    max-height: calc(100vh - 100px);
                    transition: opacity 0.2s ease-in-out;">
                    <div class="chat-header" style="background: rgba(0, 0, 0, 0.3); 
                        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                        color: #e8e8e8; 
                        padding: 12px 16px; 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center;
                        cursor: move;
                        flex-shrink: 0;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="chat-header-icon" style="font-size: 14px; line-height: 1;">📎</span>
                            <span class="chat-title" style="font-weight: 500; font-size: 13px; color: #ffffff; letter-spacing: 0.01em;">Tooltip Companion</span>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <button class="chat-theme-toggle" id="chat-theme-toggle" title="Toggle light/dark mode" style="background: transparent; border: none; color: rgba(255, 255, 255, 0.6); font-size: 16px; cursor: pointer; padding: 4px 6px; transition: all 0.2s; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">🌙</button>
                            <button class="chat-close" style="background: transparent; border: none; color: rgba(255, 255, 255, 0.6); font-size: 18px; cursor: pointer; padding: 2px 6px; transition: all 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">✕</button>
                        </div>
                    </div>
                    <div class="chat-messages" id="chat-messages" style="overflow-y: auto; overflow-x: hidden; padding: 14px 16px; background: transparent; 
                        flex: 1 1 auto;
                        min-height: 0;
                        max-height: calc(100vh - 200px);
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;">
                    </div>
                    <div class="chat-input-area" style="display: flex; gap: 8px; padding: 12px 16px; background: rgba(0, 0, 0, 0.3); border-top: 1px solid rgba(255, 255, 255, 0.08); flex-shrink: 0;">
                        <input type="file" id="chat-upload-input" accept="image/*" style="display: none;">
                        <button id="chat-upload" title="📸 Click: Screenshot page | Right-click: Upload file" style="
                            background: rgba(255, 255, 255, 0.08);
                            border: 1px solid rgba(255, 255, 255, 0.12);
                            color: rgba(255, 255, 255, 0.9); 
                            border-radius: 50%; 
                            width: 32px; 
                            height: 32px; 
                            cursor: pointer; 
                            font-size: 14px; 
                            transition: all 0.2s;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            flex-shrink: 0;">📸</button>
                        <input type="text" id="chat-input" placeholder="Type a message..." style="flex: 1; 
                            background: rgba(0, 0, 0, 0.3);
                            border: 1px solid rgba(255, 255, 255, 0.12);
                            border-radius: 10px; 
                            padding: 10px 14px; 
                            font-size: 13px; 
                            color: #ffffff;
                            font-family: 'Montserrat', sans-serif;
                            outline: none;
                            transition: all 0.2s;">
                        <button id="chat-send" style="
                            background: rgba(255, 255, 255, 0.15);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            color: #ffffff; 
                            border-radius: 50%; 
                            width: 32px; 
                            height: 32px; 
                            cursor: pointer; 
                            font-size: 14px;
                            transition: all 0.2s;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            flex-shrink: 0;">➤</button>
                    </div>
                </div>
                <button class="chat-toggle" id="chat-toggle" style="
                    width: 56px; 
                    height: 56px; 
                    border-radius: 0; 
                    background: transparent;
                    border: none;
                    color: #333; 
                    font-size: 40px; 
                    cursor: move; 
                    box-shadow: none;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    position: relative;
                    overflow: visible;
                    user-select: none;">📎</button>
            </div>
        `;
        
        try {
            const chatDiv = document.createElement('div');
            chatDiv.innerHTML = chatHTML;
            document.body.appendChild(chatDiv.firstElementChild);
            console.log('✅ Chat widget HTML added to page');
        } catch (error) {
            console.error('❌ Failed to add chat widget to page:', error);
            console.log('❌ Error details:', error.message, error.stack);
            
            // Try multiple fallback strategies for strict CSP sites
            const fallbackStrategies = [
                () => {
                    const container = document.documentElement;
                    const chatDiv = document.createElement('div');
                    chatDiv.innerHTML = chatHTML;
                    container.appendChild(chatDiv.firstElementChild);
                    console.log('✅ Chat widget added to documentElement');
                },
                () => {
                    const container = document.querySelector('body') || document.documentElement;
                    const chatDiv = document.createElement('div');
                    chatDiv.innerHTML = chatHTML;
                    container.appendChild(chatDiv.firstElementChild);
                    console.log('✅ Chat widget added to body fallback');
                },
                () => {
                    // Try creating elements individually instead of innerHTML
                    const widget = document.createElement('div');
                    widget.id = 'playwright-chat-widget';
                    widget.style.cssText = 'display: block; position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;';
                    
                    const container = document.createElement('div');
                    container.className = 'chat-container';
                    container.style.cssText = 'position: absolute; bottom: 70px; right: 0; width: 320px; background: rgba(15, 15, 15, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1); display: none; flex-direction: column; overflow: hidden; min-width: 280px; max-width: 400px; max-height: calc(100vh - 100px); transition: opacity 0.2s ease-in-out;';
                    
                    const toggle = document.createElement('button');
                    toggle.className = 'chat-toggle';
                    toggle.id = 'chat-toggle';
                    toggle.style.cssText = 'width: 56px; height: 56px; border-radius: 0; background: transparent; border: none; color: #333; font-size: 40px; cursor: move; box-shadow: none; transition: all 0.2s; display: flex; align-items: center; justify-content: center; padding: 0; position: relative; overflow: visible; user-select: none;';
                    toggle.innerHTML = '📎';
                    
                    widget.appendChild(container);
                    widget.appendChild(toggle);
                    document.body.appendChild(widget);
                    console.log('✅ Chat widget created with individual elements');
                }
            ];
            
            let success = false;
            for (let i = 0; i < fallbackStrategies.length; i++) {
                try {
                    fallbackStrategies[i]();
                    success = true;
                    break;
                } catch (fallbackError) {
                    console.error(`❌ Fallback strategy ${i + 1} failed:`, fallbackError);
                }
            }
            
            if (!success) {
                console.error('❌ All fallback strategies failed');
                return;
            }
        }
        
        // Setup chat functionality
        const chatToggle = document.getElementById('chat-toggle');
        const chatWidget = document.getElementById('playwright-chat-widget');
        
        console.log('🔍 Chat toggle found:', !!chatToggle);
        console.log('🔍 Chat widget found:', !!chatWidget);
        
        // Set glippy image as background for chat toggle button
        try {
            const glippyUrl = chrome.runtime.getURL('icons/glippy.png');
            console.log('Attempting to load glippy image:', glippyUrl);
            
            // Test if image loads
            const img = new Image();
            img.onload = function() {
                console.log('✅ Glippy image loaded successfully, applying to chat toggle');
                chatToggle.style.background = `transparent url('${glippyUrl}') center/contain no-repeat`;
                chatToggle.style.color = 'transparent';
                chatToggle.innerHTML = '';
                chatToggle.style.width = '56px';
                chatToggle.style.height = '56px';
                chatToggle.style.borderRadius = '0';
                chatToggle.style.overflow = 'visible';
            };
            img.onerror = function() {
                console.log('❌ Glippy image failed to load, using emoji fallback');
                chatToggle.style.background = 'transparent';
                chatToggle.style.color = '#333';
                chatToggle.innerHTML = '📎';
            };
            img.src = glippyUrl;
            
        } catch (e) {
            console.log('❌ Error setting up glippy image, using emoji fallback:', e);
            chatToggle.style.background = 'transparent';
            chatToggle.style.color = '#333';
            chatToggle.innerHTML = '📎';
        }
        
        // Ensure button is visible after a short delay (fallback)
        setTimeout(() => {
            if (chatToggle.style.color === 'transparent' && !chatToggle.style.background.includes('url')) {
                console.log('Fallback: Making chat toggle visible with emoji');
                chatToggle.style.background = 'transparent';
                chatToggle.style.color = '#333';
                chatToggle.innerHTML = '📎';
            }
        }, 1000);
        const chatContainer = chatWidget.querySelector('.chat-container');
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        const chatUpload = document.getElementById('chat-upload');
        const chatUploadInput = document.getElementById('chat-upload-input');
        
        // Verify button exists
        if (!chatUpload) {
            console.error('❌ Chat upload button not found!');
        } else {
            console.log('✅ Chat upload button found');
        }
        const chatMessages = document.getElementById('chat-messages');
        const closeBtn = chatWidget.querySelector('.chat-close');
        const minimizeBtn = chatWidget.querySelector('.chat-minimize');
        const themeToggle = document.getElementById('chat-theme-toggle');
        const chatInputArea = chatContainer.querySelector('.chat-input-area');
        const chatHeader = chatContainer.querySelector('.chat-header');
        
        let isOpen = false;
        let isMinimized = false;
        let isDarkMode = true; // Default to dark mode
        
        // Load saved theme preference
        try {
            const savedTheme = localStorage.getItem('chat-theme');
            if (savedTheme === 'light') {
                isDarkMode = false;
            }
        } catch (e) {}
        
        // Apply theme (must be called after all elements are defined)
        function applyTheme() {
            if (!chatContainer || !chatHeader || !chatInput || !chatInputArea || !chatSend || !chatUpload || !themeToggle || !closeBtn) {
                console.warn('Theme elements not ready yet, skipping theme application');
                return;
            }
            
            if (isDarkMode) {
                // Dark mode (obsidian glass)
                chatContainer.style.background = 'rgba(15, 15, 15, 0.85)';
                chatContainer.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                chatHeader.style.background = 'rgba(0, 0, 0, 0.3)';
                chatHeader.style.borderBottomColor = 'rgba(255, 255, 255, 0.08)';
                chatHeader.style.color = '#e8e8e8';
                const title = chatContainer.querySelector('.chat-title');
                if (title) title.style.color = '#ffffff';
                chatInput.style.background = 'rgba(0, 0, 0, 0.3)';
                chatInput.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                chatInput.style.color = '#ffffff';
                chatInput.style.setProperty('--placeholder-color', 'rgba(255, 255, 255, 0.4)');
                chatInputArea.style.background = 'rgba(0, 0, 0, 0.3)';
                chatInputArea.style.borderTopColor = 'rgba(255, 255, 255, 0.08)';
                chatSend.style.background = 'rgba(255, 255, 255, 0.15)';
                chatSend.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                chatUpload.style.background = 'rgba(255, 255, 255, 0.08)';
                chatUpload.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                themeToggle.innerHTML = '🌙';
                themeToggle.style.color = 'rgba(255, 255, 255, 0.6)';
                closeBtn.style.color = 'rgba(255, 255, 255, 0.6)';
            } else {
                // Light mode (clean glass)
                chatContainer.style.background = 'rgba(255, 255, 255, 0.95)';
                chatContainer.style.borderColor = 'rgba(0, 0, 0, 0.1)';
                chatHeader.style.background = 'rgba(255, 255, 255, 0.9)';
                chatHeader.style.borderBottomColor = 'rgba(0, 0, 0, 0.08)';
                chatHeader.style.color = '#1a1a1a';
                const title = chatContainer.querySelector('.chat-title');
                if (title) title.style.color = '#1a1a1a';
                chatInput.style.background = 'rgba(0, 0, 0, 0.03)';
                chatInput.style.borderColor = 'rgba(0, 0, 0, 0.1)';
                chatInput.style.color = '#1a1a1a';
                chatInput.style.setProperty('--placeholder-color', 'rgba(0, 0, 0, 0.4)');
                chatInputArea.style.background = 'rgba(255, 255, 255, 0.95)';
                chatInputArea.style.borderTopColor = 'rgba(0, 0, 0, 0.08)';
                chatSend.style.background = '#667eea';
                chatSend.style.borderColor = '#667eea';
                chatUpload.style.background = 'rgba(102, 126, 234, 0.1)';
                chatUpload.style.borderColor = 'rgba(102, 126, 234, 0.2)';
                themeToggle.innerHTML = '☀️';
                themeToggle.style.color = 'rgba(0, 0, 0, 0.6)';
                closeBtn.style.color = 'rgba(0, 0, 0, 0.6)';
            }
            
            // Update input placeholder
            chatInput.setAttribute('placeholder', 'Type a message...');
            
            // Save preference
            try {
                localStorage.setItem('chat-theme', isDarkMode ? 'dark' : 'light');
            } catch (e) {}
        }
        
        // Initialize theme after all elements are ready
        setTimeout(() => applyTheme(), 0);
        
        // Theme toggle handler
        themeToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent dragging
            isDarkMode = !isDarkMode;
            applyTheme();
            
            // Update message bubbles to match theme
            const allMessages = chatMessages.querySelectorAll('.chat-message');
            allMessages.forEach(msg => {
                const content = msg.querySelector('.message-content');
                if (msg.classList.contains('user')) {
                    if (isDarkMode) {
                        content.style.background = 'rgba(255, 255, 255, 0.15)';
                        content.style.color = '#ffffff';
                        content.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    } else {
                        content.style.background = '#667eea';
                        content.style.color = 'white';
                        content.style.borderColor = '#667eea';
                    }
                } else {
                    if (isDarkMode) {
                        content.style.background = 'rgba(0, 0, 0, 0.3)';
                        content.style.color = '#e8e8e8';
                        content.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    } else {
                        content.style.background = 'rgba(102, 126, 234, 0.1)';
                        content.style.color = '#1a1a1a';
                        content.style.borderColor = 'rgba(102, 126, 234, 0.2)';
                    }
                }
            });
        });
        
        // Hover effects for theme toggle
        themeToggle.addEventListener('mouseenter', () => {
            themeToggle.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        });
        themeToggle.addEventListener('mouseleave', () => {
            themeToggle.style.background = 'transparent';
        });
        
        // Make chat toggle button always visible
        chatToggle.style.display = 'block';
        console.log('Chat toggle button created and should be visible');
        
        // Make widget draggable
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        let xOffset = 0;
        let yOffset = 0;
        
        // Store widget position
        let widgetX = 20;
        let widgetY = 20;
        
        // Chat header already defined above, just set cursor
        if (chatHeader) {
            chatHeader.style.cursor = 'move';
        }
        
        // Save position function
        function savePosition(x, y) {
            widgetX = x;
            widgetY = y;
            localStorage.setItem('chat-widget-pos', JSON.stringify({ x, y }));
        }
        
        // Load position function
        function loadPosition() {
            try {
                const pos = JSON.parse(localStorage.getItem('chat-widget-pos'));
                if (pos) {
                    chatWidget.style.right = pos.x + 'px';
                    chatWidget.style.bottom = pos.y + 'px';
                }
            } catch (e) {}
        }
        
        // Load saved position
        loadPosition();
        
        // Make toggle button draggable - it should drag immediately when clicked and moved
        let toggleDragStartX = 0;
        let toggleDragStartY = 0;
        let toggleHasDragged = false;
        let toggleIsDown = false;
        
        // Handle toggle button mousedown
        chatToggle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            toggleIsDown = true;
            toggleHasDragged = false;
            toggleDragStartX = e.clientX;
            toggleDragStartY = e.clientY;
            
            // Initialize drag offsets from toggle button position
            const rect = chatWidget.getBoundingClientRect();
            xOffset = e.clientX - rect.left;
            yOffset = e.clientY - rect.top;
        });
        
        // Drag functionality for container (header and toggle button)
        chatHeader.addEventListener('mousedown', dragStart);
        
        // Global mousemove handler
        document.addEventListener('mousemove', (e) => {
            // Handle dragging from toggle button
            if (toggleIsDown) {
                const deltaX = Math.abs(e.clientX - toggleDragStartX);
                const deltaY = Math.abs(e.clientY - toggleDragStartY);
                
                // If mouse moved more than 2px, it's a drag (reduced threshold for immediate response)
                if (deltaX > 2 || deltaY > 2) {
                    if (!toggleHasDragged) {
                        // Start dragging immediately
                        toggleHasDragged = true;
                        isDragging = true;
                        
                        // Calculate offset once when drag starts (relative position of click to widget)
                        const rect = chatWidget.getBoundingClientRect();
                        xOffset = toggleDragStartX - rect.left;
                        yOffset = toggleDragStartY - rect.top;
                    }
                    
                    // Continue dragging with fixed offset
                    drag(e);
                    return; // Don't process as click
                }
            }
            
            // Normal drag from header
            if (isDragging) {
                drag(e);
            }
        });
        
        // Global mouseup handler
        document.addEventListener('mouseup', (e) => {
            // Handle drag end
            if (isDragging) {
                dragEnd(e);
            }
            
            // Handle toggle click if it wasn't a drag
            if (toggleIsDown && !toggleHasDragged) {
                // It was just a click (no movement > 3px), toggle the chat
                if (!isOpen) {
                    chatContainer.style.display = 'flex';
                    chatWidget.style.display = 'block';
                    chatContainer.style.height = 'auto';
                    chatContainer.style.minHeight = '200px';
                    isOpen = true;
                    isMinimized = false;
                    setTimeout(updateChatHeight, 50);
                    chatInput.focus();
                } else {
                    chatContainer.style.display = 'none';
                    isOpen = false;
                    isMinimized = false;
                }
            }
            
            // Reset toggle drag state
            toggleIsDown = false;
            toggleDragStartX = 0;
            toggleDragStartY = 0;
            toggleHasDragged = false;
        });
        
        function dragStart(e) {
            initialX = e.clientX;
            initialY = e.clientY;
            
            const rect = chatWidget.getBoundingClientRect();
            xOffset = e.clientX - rect.left;
            yOffset = e.clientY - rect.top;
            
            if (e.target === chatHeader || chatHeader.contains(e.target)) {
                isDragging = true;
            }
        }
        
        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                
                const maxX = window.innerWidth - chatWidget.offsetWidth;
                const maxY = window.innerHeight - chatWidget.offsetHeight;
                // Prevent chat from being cut off by toolbar (minimum 60px from top)
                const minY = 60;
                
                currentX = e.clientX - xOffset;
                currentY = e.clientY - yOffset;
                
                // Constrain to viewport with minimum top margin
                currentX = Math.max(0, Math.min(currentX, maxX));
                currentY = Math.max(minY, Math.min(currentY, maxY));
                
                chatWidget.style.position = 'fixed';
                chatWidget.style.right = 'auto';
                chatWidget.style.bottom = 'auto';
                chatWidget.style.left = currentX + 'px';
                chatWidget.style.top = currentY + 'px';
            }
        }
        
        function dragEnd(e) {
            if (isDragging) {
                isDragging = false;
                const rect = chatWidget.getBoundingClientRect();
                savePosition(window.innerWidth - rect.right, window.innerHeight - rect.bottom);
            }
        }
        
        // Update container height dynamically based on content
        function updateChatHeight() {
            if (!isOpen) return;
            
            const messagesHeight = chatMessages.scrollHeight;
            const headerHeight = chatContainer.querySelector('.chat-header').offsetHeight;
            const inputHeight = chatContainer.querySelector('.chat-input-area').offsetHeight;
            const totalContentHeight = messagesHeight + headerHeight + inputHeight;
            
            // Set height based on content, but cap at max height
            const maxHeight = Math.min(window.innerHeight - 100, 600);
            const desiredHeight = Math.min(totalContentHeight + 20, maxHeight);
            
            chatContainer.style.height = desiredHeight + 'px';
            
            // Auto-scroll to bottom if near bottom
            const isNearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 100;
            if (isNearBottom) {
                setTimeout(() => {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 10);
            }
        }
        
        // Note: Toggle functionality now handled in mouseup event above
        // This allows the toggle button to be draggable while still toggling on click
        
        closeBtn.addEventListener('click', () => {
            chatContainer.style.display = 'none';
            isOpen = false;
            isMinimized = false;
        });
        
        // Minimize button removed - toggle button now handles open/close
        if (minimizeBtn) {
            minimizeBtn.style.display = 'none';
        }
        
        // Capture console logs
        const consoleLogs = [];
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        
        console.log = function(...args) {
            consoleLogs.push({ level: 'log', message: args.join(' '), timestamp: Date.now() });
            originalLog.apply(console, args);
        };
        
        console.error = function(...args) {
            consoleLogs.push({ level: 'error', message: args.join(' '), timestamp: Date.now() });
            originalError.apply(console, args);
        };
        
        console.warn = function(...args) {
            consoleLogs.push({ level: 'warn', message: args.join(' '), timestamp: Date.now() });
            originalWarn.apply(console, args);
        };
        
        // Keep last 50 logs
        if (consoleLogs.length > 50) {
            consoleLogs.splice(0, consoleLogs.length - 50);
        }
        
        // Detect if message contains API key setting intent
        function detectKeySettingIntent(message) {
            const lowerMessage = message.toLowerCase();
            const trimmed = message.trim();
            
            // Check for natural language patterns
            const keyPatterns = [
                /my\s+(?:openai\s+)?api\s+key\s+is/i,
                /openai\s+key\s+is/i,
                /api\s+key\s*[:=]/i,
                /set\s+my\s+(?:openai\s+)?api\s+key/i,
                /my\s+key\s+is/i,
            ];
            
            if (keyPatterns.some(pattern => pattern.test(message))) {
                return true;
            }
            
            // Check for direct key patterns
            // OpenAI keys: sk-proj- or sk- followed by alphanumeric
            if (/^sk-[a-zA-Z0-9]{20,}$/.test(trimmed) || /^sk-proj-[a-zA-Z0-9]{20,}$/.test(trimmed)) {
                return true;
            }
            
            // Generic API key pattern: long alphanumeric strings with possible underscores/dashes
            // Matches strings that are 30+ characters, mostly alphanumeric with some special chars
            if (/^[a-zA-Z0-9_-]{30,}$/.test(trimmed) && trimmed.length >= 30) {
                // Looks like a direct API key paste
                return true;
            }
            
            return false;
        }
        
        // Extract key directly from message (fallback if parser fails)
        function extractKeyDirectly(message) {
            const trimmed = message.trim();
            
            // OpenAI key pattern: sk- or sk-proj- followed by alphanumeric
            const openaiMatch = trimmed.match(/sk(?:-proj)?-[a-zA-Z0-9]{20,}/);
            if (openaiMatch) {
                return {
                    key: openaiMatch[0],
                    provider: 'openai',
                    confidence: 0.9
                };
            }
            
            // Generic API key: long alphanumeric string (30+ chars)
            if (/^[a-zA-Z0-9_-]{30,}$/.test(trimmed)) {
                return {
                    key: trimmed,
                    provider: 'openai', // Default to OpenAI
                    confidence: 0.7 // Lower confidence for generic keys
                };
            }
            
            return null;
        }
        
        // Handle API key extraction from natural language
        async function handleKeyExtraction(message) {
            try {
                const trimmed = message.trim();
                
                // First, try direct extraction for keys pasted directly
                const directExtraction = extractKeyDirectly(trimmed);
                if (directExtraction && directExtraction.confidence >= 0.9) {
                    // High confidence direct key - save immediately
                    addMessage('🔑 Detected API key! Saving...', 'bot');
                    saveAPIKey(directExtraction.key, directExtraction.provider, { confidence_score: directExtraction.confidence });
                    return;
                }
                
                // Otherwise, try the LLM parser
                addMessage('🔑 Detected API key setting intent. Extracting key from your message...\n\n' +
                          'Note: Chat works without a key (uses backend default). Setting your own key is optional.', 'bot');
                
                // Check if extension context is still valid
                if (!chrome.runtime?.id) {
                    addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                    return;
                }
                
                // Call parse-key endpoint via background script
                chrome.runtime.sendMessage({
                    action: 'parse-key',
                    text: message
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        if (errorMsg.includes('Extension context invalidated') || 
                            errorMsg.includes('message port closed')) {
                            addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                            return;
                        }
                        // If backend parser fails, try direct extraction as fallback
                        const fallbackKey = extractKeyDirectly(trimmed);
                        if (fallbackKey) {
                            addMessage('⚠️ Using fallback key extraction. Please confirm:\n\n' +
                                     `Provider: ${fallbackKey.provider}\n` +
                                     `Key: ${fallbackKey.key.substring(0, 10)}...${fallbackKey.key.substring(fallbackKey.key.length - 4)}\n\n` +
                                     'Would you like to save this key? (Reply "yes" to confirm)', 'bot');
                            window.pendingAPIKey = fallbackKey.key;
                            window.pendingProvider = fallbackKey.provider;
                            return;
                        }
                        
                        addMessage(`❌ Error: ${errorMsg}`, 'bot');
                        return;
                    }
                    
                    if (response && response.api_key && response.api_key !== 'NOT_FOUND') {
                        // Key found - validate and save
                        const extractedKey = response.api_key;
                        const provider = response.key_type || 'openai';
                        const confidence = response.confidence_score || 0;
                        
                        if (confidence < 0.5) {
                            addMessage('⚠️ Low confidence in extracted key. Please confirm:\n\n' +
                                     `Provider: ${provider}\n` +
                                     `Key: ${extractedKey.substring(0, 10)}...${extractedKey.substring(extractedKey.length - 4)}\n\n` +
                                     'Would you like to save this key? (Reply "yes" to confirm)', 'bot');
                            // Store pending key for confirmation
                            window.pendingAPIKey = extractedKey;
                            window.pendingProvider = provider;
                            return;
                        }
                        
                        // High confidence - save directly
                        saveAPIKey(extractedKey, provider, response);
                    } else {
                        // Parser returned NOT_FOUND - try direct extraction as fallback
                        const fallbackKey = extractKeyDirectly(trimmed);
                        if (fallbackKey) {
                            addMessage('⚠️ Parser didn\'t find key, but detected a potential key. Please confirm:\n\n' +
                                     `Provider: ${fallbackKey.provider}\n` +
                                     `Key: ${fallbackKey.key.substring(0, 10)}...${fallbackKey.key.substring(fallbackKey.key.length - 4)}\n\n` +
                                     'Would you like to save this key? (Reply "yes" to confirm)', 'bot');
                            window.pendingAPIKey = fallbackKey.key;
                            window.pendingProvider = fallbackKey.provider;
                            return;
                        }
                        
                        addMessage('❌ Could not extract API key from your message.\n\n' +
                                 'Please try:\n' +
                                 '- Paste your key directly: "sk-proj-..." or "sk-..."\n' +
                                 '- Or say: "My OpenAI API key is sk-proj-..."\n\n' +
                                 'Or set it in Options: Click extension icon → Options', 'bot');
                    }
                });
            } catch (error) {
                addMessage(`❌ Error extracting key: ${error.message}`, 'bot');
            }
        }
        
        // Save API key securely
        function saveAPIKey(key, provider = 'openai', metadata = {}) {
            const storageKey = provider === 'anthropic' ? 'anthropicKey' : 'openaiKey';
            const keyPreview = `${key.substring(0, 10)}...${key.substring(key.length - 4)}`;
            
            chrome.storage.sync.set({ [storageKey]: key }, () => {
                // Verify the key was actually saved
                chrome.storage.sync.get({ [storageKey]: '' }, (items) => {
                    if (items[storageKey] === key) {
                        addMessage(`✅ ${provider.toUpperCase()} API key saved and verified!\n\n` +
                                  `Key: ${keyPreview}\n` +
                                  `Confidence: ${((metadata.confidence_score || 1) * 100).toFixed(0)}%\n\n` +
                                  'You can now use AI chat features! Try asking a question.', 'bot');
                        console.log(`✅ API key saved to chrome.storage.sync as "${storageKey}"`);
                    } else {
                        addMessage(`⚠️ Key saved but verification failed. Please try again or set via Options.`, 'bot');
                    }
                });
            });
        }
        
        function sendMessage() {
            const message = chatInput.value.trim();
            if (!message) return;
            
            addMessage(message, 'user');
            chatInput.value = '';
            
            // Check for tooltip context commands
            const lowerMessage = message.toLowerCase().trim();
            if (lowerMessage === '/context' || lowerMessage === '/tooltips' || lowerMessage === '/recent') {
                if (typeof window.getTooltipContextSummary === 'function') {
                    const summary = window.getTooltipContextSummary(10);
                    addMessage(summary, 'bot');
                } else {
                    addMessage('📚 Tooltip context system not available. Hover over links to build context.', 'bot');
                }
                return;
            }
            
            if (lowerMessage.startsWith('/context ')) {
                const url = message.substring('/context '.length).trim();
                if (url && typeof window.getTooltipContext === 'function') {
                    const context = window.getTooltipContext(url);
                    if (context && typeof window.formatTooltipContextForChat === 'function') {
                        const formatted = window.formatTooltipContextForChat(context, true);
                        addMessage(formatted, 'bot');
                    } else {
                        addMessage(`❌ No tooltip context found for: ${url}\n\n💡 Hover over a link to build context for that page.`, 'bot');
                    }
                } else {
                    addMessage('💡 Usage: `/context <url>` to get tooltip context for a specific URL.', 'bot');
                }
                return;
            }
            
            // Check for "what's the tooltip about" type questions
            if (lowerMessage.includes('tooltip') && (lowerMessage.includes('about') || lowerMessage.includes('what') || lowerMessage.includes('show'))) {
                const recentContexts = typeof window.getTooltipHistory === 'function' ? window.getTooltipHistory(1) : [];
                if (recentContexts.length > 0) {
                    const latest = recentContexts[0];
                    if (typeof window.generateTooltipSummary === 'function') {
                        const summary = window.generateTooltipSummary(latest, latest.url);
                        if (summary) {
                            addMessage(`🔍 ${summary}`, 'bot');
                        } else {
                            addMessage(`📋 The latest tooltip preview shows a page, but I need more context to describe it.`, 'bot');
                        }
                    } else {
                        addMessage(`📋 The latest tooltip preview shows a page, but summary generation is not available.`, 'bot');
                    }
                } else {
                    addMessage('💡 No tooltip previews available yet. Hover over a link to see a tooltip preview, then ask me about it!', 'bot');
                }
                return;
            }
            
            // Check for key setting intent first
            if (detectKeySettingIntent(message)) {
                handleKeyExtraction(message);
                return;
            }
            
            // Check for confirmation of pending key
            if (window.pendingAPIKey && (message.toLowerCase() === 'yes' || message.toLowerCase() === 'confirm')) {
                saveAPIKey(window.pendingAPIKey, window.pendingProvider);
                window.pendingAPIKey = null;
                window.pendingProvider = null;
                return;
            }
            
            // Get page info
            const pageInfo = {
                title: document.title,
                url: window.location.href,
                description: document.querySelector('meta[name="description"]')?.content
            };
            
            // Get API key from storage (optional - backend has default key)
            try {
                if (!chrome.runtime?.id) {
                    addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                    return;
                }
                
                chrome.storage.sync.get({ openaiKey: '' }, (items) => {
                    // Check for runtime errors (extension context invalidated)
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        console.error('❌ Storage error:', errorMsg);
                        if (errorMsg.includes('Extension context invalidated') || 
                            errorMsg.includes('message port closed')) {
                            addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                            return;
                        }
                        // For other errors, continue without API key (backend has default)
                    }
                    
                    const userApiKey = items?.openaiKey || '';
                    console.log('🔑 API Key from storage:', userApiKey ? `Set (${userApiKey.substring(0, 10)}...)` : 'Not set (will use backend default)');
                    
                    // Check if extension context is still valid
                    if (!chrome.runtime?.id) {
                        addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                        return;
                    }
                    
                    // Enhance message with tooltip context if available
                    let enhancedMessage = message;
                    if (typeof window.enhanceChatMessageWithContext === 'function') {
                        enhancedMessage = window.enhanceChatMessageWithContext(message);
                        console.log('🧠 Enhanced chat message with tooltip context');
                    }
                    
                    // Get full tooltip contexts (not just history)
                    const tooltipContexts = typeof window.getAllTooltipContexts === 'function' 
                        ? window.getAllTooltipContexts().slice(-10) // Last 10 contexts
                        : [];
                    
                    // Get recent tooltip history
                    const recentTooltipHistory = typeof window.getTooltipHistory === 'function'
                        ? window.getTooltipHistory(10)
                        : (window.tooltipHistory || []).slice(-10);
                    
                    // Send chat message (backend will use default key if user key not provided)
                    console.log('📤 Sending chat message with API key:', userApiKey ? 'User key provided' : 'No user key (backend will use default)');
                    console.log('📊 Including tooltip contexts:', tooltipContexts.length, 'contexts');
                    if (tooltipContexts.length > 0) {
                        console.log('📊 Tooltip context preview:', {
                            count: tooltipContexts.length,
                            latest: tooltipContexts[tooltipContexts.length - 1]?.url,
                            hasOCR: tooltipContexts.some(ctx => ctx.ocrText),
                            hasAnalysis: tooltipContexts.some(ctx => ctx.analysis)
                        });
                    }
                    chrome.runtime.sendMessage({
                    action: 'chat',
                    message: enhancedMessage, // Enhanced with context
                    originalMessage: message, // Original user message
                    url: window.location.href,
                    consoleLogs: consoleLogs.slice(-10), // Last 10 console entries
                    pageInfo: pageInfo,
                    tooltipHistory: recentTooltipHistory, // Recent tooltip events for context
                    tooltipContexts: tooltipContexts, // Full tooltip contexts with analysis, OCR, metadata
                    openaiKey: userApiKey // Optional - backend has default
                }, (response) => {
                    console.log('📨 Chat response received:', response);
                    
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        console.error('❌ Runtime error:', errorMsg);
                        if (errorMsg.includes('Extension context invalidated') || 
                            errorMsg.includes('message port closed')) {
                            addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                        } else {
                            addMessage('Error: ' + errorMsg, 'bot');
                        }
                        return;
                    }
                    
                    if (response && response.reply) {
                        addMessage(response.reply, 'bot');
                    } else {
                        console.error('❌ No response from backend');
                        addMessage('❌ Backend service unavailable. Please check your backend URL in extension settings.', 'bot');
                    }
                });
                });
            } catch (error) {
                console.error('❌ Error accessing storage or sending message:', error);
                if (error.message && error.message.includes('Extension context invalidated')) {
                    addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                } else {
                    addMessage(`❌ Error: ${error.message || 'Unknown error'}`, 'bot');
                }
            }
        }
        
        chatSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        
        // Screenshot capture - camera button takes screenshot of current page
        if (!chatUpload) {
            console.error('❌ Cannot attach click handler - chatUpload button not found');
        } else {
            console.log('✅ Attaching click handler to chat upload button');
            chatUpload.addEventListener('click', async () => {
            try {
                console.log('📸 OCR: User clicked screenshot button');
                addMessage('📸 Capturing screenshot of current page...', 'bot');
                
                // Check if extension context is still valid
                if (!chrome.runtime?.id) {
                    console.error('📸 OCR: Extension context invalidated');
                    addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                    return;
                }
                
                console.log('📸 OCR: Requesting screenshot from background script...');
                // Request screenshot from background script
                chrome.runtime.sendMessage({
                    action: 'capture-screenshot'
                }, (response) => {
                    console.log('📸 OCR: Screenshot capture response:', response);
                    
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        console.error('📸 OCR: Runtime error:', errorMsg);
                        if (errorMsg.includes('Extension context invalidated') || 
                            errorMsg.includes('message port closed')) {
                            addMessage('❌ Extension was reloaded. Please reload this page.', 'bot');
                        } else {
                            addMessage(`❌ Error: ${errorMsg}`, 'bot');
                        }
                        return;
                    }
                    
                    if (response && response.screenshot) {
                        console.log('📸 OCR: Screenshot received, length:', response.screenshot.length);
                        // Process the screenshot for OCR
                        handleScreenshotForOCR(response.screenshot);
                    } else if (response && response.error) {
                        console.error('📸 OCR: Screenshot error:', response.error);
                        addMessage(`❌ Screenshot failed: ${response.error}`, 'bot');
                    } else {
                        console.error('📸 OCR: Failed to capture screenshot - invalid response');
                        addMessage('❌ Failed to capture screenshot', 'bot');
                    }
                });
            } catch (error) {
                console.error('📸 OCR: Exception during screenshot capture:', error);
                addMessage(`❌ Error: ${error.message}`, 'bot');
            }
            });
            console.log('✅ Chat upload click handler attached');
        }
        
        // Handle screenshot for OCR processing
        // Uses background script proxy to avoid Mixed Content issues on HTTPS pages
        async function handleScreenshotForOCR(dataUrl) {
            try {
                console.log('📝 OCR: Starting OCR processing for screenshot');
                console.log('📝 OCR: Image data URL length:', dataUrl ? dataUrl.length : 0);
                
                // Send to backend for OCR via background script proxy
                const response = await new Promise((resolve, reject) => {
                    // Check if extension context is still valid
                    if (!chrome.runtime?.id) {
                        console.error('📝 OCR: Extension context invalidated');
                        reject(new Error('Extension context invalidated. Please reload this page.'));
                        return;
                    }
                    
                    console.log('📝 OCR: Sending OCR request to background script...');
                    chrome.runtime.sendMessage(
                        { action: 'ocr-upload', image: dataUrl },
                        (response) => {
                            console.log('📝 OCR: Background script response:', response);
                            
                            if (chrome.runtime.lastError) {
                                const errorMsg = chrome.runtime.lastError.message;
                                console.error('📝 OCR: Runtime error:', errorMsg);
                                if (errorMsg.includes('Extension context invalidated') || 
                                    errorMsg.includes('message port closed')) {
                                    reject(new Error('Extension was reloaded. Please reload this page.'));
                                } else {
                                    reject(new Error(errorMsg));
                                }
                            } else if (!response || !response.success) {
                                console.error('📝 OCR: Failed response:', response);
                                reject(new Error(response?.error || 'Failed to process OCR'));
                            } else {
                                console.log('📝 OCR: Success response received');
                                resolve(response);
                            }
                        }
                    );
                });
                
                console.log('📝 OCR: Processing response data...');
                
                // Handle different response formats
                // Background returns: { success: true, text: "...", characterCount: ..., data: {...} }
                // Check for text at multiple possible locations
                const ocrText = response.text || response.data?.text || response.data?.ocrText || null;
                const characterCount = response.characterCount || response.data?.characterCount || 0;
                const error = response.error || response.data?.error || null;
                
                console.log('📝 OCR: Response data:', {
                    hasText: !!ocrText,
                    textLength: ocrText?.length || 0,
                    characterCount: characterCount,
                    hasError: !!error,
                    responseKeys: Object.keys(response),
                    dataKeys: response.data ? Object.keys(response.data) : []
                });
                
                if (ocrText && ocrText.trim().length > 0) {
                    console.log('📝 OCR: Text extracted successfully, length:', ocrText.length, 'chars');
                    addMessage(`📝 Screenshot OCR Text:\n\n${ocrText}`, 'bot');
                    chatInput.value = 'What does this text say?';
                    addMessage('💡 Tip: Ask questions about the extracted text!', 'bot');
                } else if (error) {
                    console.error('📝 OCR: Error in response:', error);
                    addMessage(`❌ OCR Error: ${error}`, 'bot');
                } else {
                    console.log('📝 OCR: No text extracted (expected for images without text)');
                    addMessage('⚠️ No OCR text could be extracted from this screenshot.', 'bot');
                }
            } catch (error) {
                console.error('📝 OCR: Exception during OCR processing:', error);
                console.error('📝 OCR: Error stack:', error.stack);
                addMessage(`❌ Failed to process screenshot: ${error.message}`, 'bot');
            }
        }
        
        // File upload still available via right-click or drag-drop
        chatUpload.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            chatUploadInput.click();
        });
        
        // Drag and drop image
        chatContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            chatContainer.style.border = '2px dashed rgba(255, 255, 255, 0.3)';
        });
        
        chatContainer.addEventListener('dragleave', () => {
            chatContainer.style.border = '';
        });
        
        chatContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            chatContainer.style.border = '';
            
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('image/')) {
                handleImageUpload(files[0]);
            } else {
                addMessage('⚠️ Please drop an image file.', 'bot');
            }
        });
        
        // Paste image from clipboard
        chatInput.addEventListener('paste', (e) => {
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = items[i].getAsFile();
                    handleImageUpload(blob);
                    return;
                }
            }
        });
        
        // Handle image upload (for drag-drop and paste)
        // Uses background script proxy to avoid Mixed Content issues on HTTPS pages
        async function handleImageUpload(file) {
            addMessage(`📷 Processing image: ${file.name || 'from clipboard'}`, 'bot');
            
            // Convert to base64
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Image = e.target.result;
                
                try {
                    // Send to backend for OCR via background script proxy
                    const response = await new Promise((resolve, reject) => {
                        // Check if extension context is still valid
                        if (!chrome.runtime?.id) {
                            reject(new Error('Extension context invalidated. Please reload this page.'));
                            return;
                        }
                        
                        chrome.runtime.sendMessage(
                            { action: 'ocr-upload', image: base64Image },
                            (response) => {
                                if (chrome.runtime.lastError) {
                                    const errorMsg = chrome.runtime.lastError.message;
                                    if (errorMsg.includes('Extension context invalidated') || 
                                        errorMsg.includes('message port closed')) {
                                        reject(new Error('Extension was reloaded. Please reload this page.'));
                                    } else {
                                        reject(new Error(errorMsg));
                                    }
                                } else if (!response || !response.success) {
                                    reject(new Error(response?.error || 'Failed to process OCR'));
                                } else {
                                    resolve(response);
                                }
                            }
                        );
                    });
                    
                    const data = response.data;
                    
                    if (data.ocrText) {
                        // Show OCR results
                        addMessage(`📝 OCR Text Extracted:\n\n${data.ocrText}`, 'bot');
                        
                        // Auto-fill input for user to ask questions about it
                        chatInput.value = 'What does this text say?';
                        addMessage('💡 Tip: Ask questions about the extracted text!', 'bot');
                    } else if (data.error) {
                        addMessage(`❌ OCR Error: ${data.error}`, 'bot');
                    } else {
                        addMessage('⚠️ No OCR text could be extracted from this image.', 'bot');
                    }
                } catch (error) {
                    addMessage(`❌ Failed to process image: ${error.message}`, 'bot');
                }
            };
            
            reader.readAsDataURL(file);
        }
        
        chatUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            if (!file.type.startsWith('image/')) {
                addMessage('⚠️ Please upload an image file.', 'bot');
                return;
            }
            
            handleImageUpload(file);
            
            // Reset input
            chatUploadInput.value = '';
        });
        
        function addMessage(text, type) {
            // Remove welcome message if it exists and this is the first real message
            if (chatMessages.children.length === 1 && chatMessages.querySelector('.chat-message.bot') && 
                chatMessages.querySelector('.chat-message.bot').textContent.includes('Tooltip Companion v1.3.0')) {
                chatMessages.innerHTML = '';
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${type}`;
            messageDiv.style.marginBottom = '10px';
            messageDiv.style.wordWrap = 'break-word';
            messageDiv.style.overflowWrap = 'break-word';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            if (type === 'user') {
                messageDiv.style.display = 'flex';
                messageDiv.style.justifyContent = 'flex-end';
                if (isDarkMode) {
                    contentDiv.style.background = 'rgba(255, 255, 255, 0.15)';
                    contentDiv.style.color = '#ffffff';
                    contentDiv.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                } else {
                    contentDiv.style.background = '#667eea';
                    contentDiv.style.color = 'white';
                    contentDiv.style.border = '1px solid #667eea';
                }
                contentDiv.style.borderRadius = '12px 12px 4px 12px';
            } else {
                if (isDarkMode) {
                    contentDiv.style.background = 'rgba(0, 0, 0, 0.3)';
                    contentDiv.style.color = '#e8e8e8';
                    contentDiv.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                } else {
                    contentDiv.style.background = 'rgba(102, 126, 234, 0.1)';
                    contentDiv.style.color = '#1a1a1a';
                    contentDiv.style.border = '1px solid rgba(102, 126, 234, 0.2)';
                }
                contentDiv.style.borderRadius = '12px 12px 12px 4px';
            }
            
            contentDiv.style.padding = '10px 14px';
            contentDiv.style.maxWidth = '85%';
            contentDiv.style.fontSize = '13px';
            contentDiv.style.lineHeight = '1.5';
            contentDiv.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
            contentDiv.style.whiteSpace = 'pre-wrap';
            
            const p = document.createElement('p');
            p.style.margin = '0';
            p.style.color = 'inherit';
            p.textContent = text;
            
            contentDiv.appendChild(p);
            messageDiv.appendChild(contentDiv);
            chatMessages.appendChild(messageDiv);
        }
        
        // Function to add proactive OCR summaries to chat
        function addProactiveOCRSummary(ocrText, url) {
            // Only add if chat is open
            if (!chatContainer || chatContainer.style.display === 'none') {
                return;
            }
            
            // Generate a smart summary of the OCR text
            const summary = generateSmartSummary(ocrText);
            
            // Add to chat with a nice format
            addMessage(summary, 'bot');
            
            // Update chat height and scroll
            if (typeof updateChatHeight === 'function') {
                updateChatHeight();
            }
            
            // Smooth scroll to bottom
            setTimeout(() => {
                if (chatMessages) {
                    chatMessages.scrollTo({
                        top: chatMessages.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            }, 50);
        }
        
        // Generate smart summary from OCR text
        function generateSmartSummary(text) {
            if (!text || text.trim().length === 0) {
                return '📝 No text detected in preview.';
            }
            
            // Clean the text
            const cleanText = text.trim();
            
            // If text is short, show it all
            if (cleanText.length <= 150) {
                return `📝 Preview Text:\n${cleanText}`;
            }
            
            // If text is medium, show first part
            if (cleanText.length <= 300) {
                const lines = cleanText.split('\n').filter(line => line.trim().length > 0);
                return `📝 Preview Summary:\n${lines.slice(0, 3).join('\n')}...`;
            }
            
            // For long text, extract key phrases
            const lines = cleanText.split('\n').filter(line => line.trim().length > 0);
            const firstLines = lines.slice(0, 3);
            const characterCount = cleanText.length;
            
            return `📝 Preview Summary (${characterCount} chars):\n${firstLines.join('\n')}...\n\n💡 Ask me to summarize or explain more!`;
        }
        
        // Expose addMessage function globally so it can be called from tooltip system
        window.addChatMessage = addMessage;
        window.addProactiveOCRSummary = addProactiveOCRSummary;
        window.updateChatHeight = updateChatHeight;
        window.chatMessages = chatMessages;
        
        // Style inputs on focus (theme-aware)
        chatInput.addEventListener('focus', () => {
            if (isDarkMode) {
                chatInput.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                chatInput.style.boxShadow = '0 0 0 3px rgba(255, 255, 255, 0.05)';
                chatInput.style.background = 'rgba(0, 0, 0, 0.4)';
            } else {
                chatInput.style.borderColor = '#667eea';
                chatInput.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                chatInput.style.background = 'rgba(0, 0, 0, 0.04)';
            }
        });
        
        chatInput.addEventListener('blur', () => {
            if (isDarkMode) {
                chatInput.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                chatInput.style.boxShadow = 'none';
                chatInput.style.background = 'rgba(0, 0, 0, 0.3)';
            } else {
                chatInput.style.borderColor = 'rgba(0, 0, 0, 0.1)';
                chatInput.style.boxShadow = 'none';
                chatInput.style.background = 'rgba(0, 0, 0, 0.03)';
            }
        });
        
        // Hover effects (theme-aware)
        chatSend.addEventListener('mouseenter', () => {
            chatSend.style.transform = 'scale(1.05)';
            if (isDarkMode) {
                chatSend.style.background = 'rgba(255, 255, 255, 0.2)';
                chatSend.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            } else {
                chatSend.style.background = '#5a67d8';
                chatSend.style.borderColor = '#5a67d8';
            }
        });
        chatSend.addEventListener('mouseleave', () => {
            chatSend.style.transform = 'scale(1)';
            if (isDarkMode) {
                chatSend.style.background = 'rgba(255, 255, 255, 0.15)';
                chatSend.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            } else {
                chatSend.style.background = '#667eea';
                chatSend.style.borderColor = '#667eea';
            }
        });
        
        chatUpload.addEventListener('mouseenter', () => {
            if (isDarkMode) {
                chatUpload.style.background = 'rgba(255, 255, 255, 0.12)';
                chatUpload.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            } else {
                chatUpload.style.background = 'rgba(102, 126, 234, 0.2)';
                chatUpload.style.borderColor = 'rgba(102, 126, 234, 0.4)';
            }
        });
        chatUpload.addEventListener('mouseleave', () => {
            if (isDarkMode) {
                chatUpload.style.background = 'rgba(255, 255, 255, 0.08)';
                chatUpload.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            } else {
                chatUpload.style.background = 'rgba(102, 126, 234, 0.1)';
                chatUpload.style.borderColor = 'rgba(102, 126, 234, 0.2)';
            }
        });
        
        console.log('✅ Chat widget initialized');
        console.log('📎 Chat toggle button should be visible at bottom-right of page');
        
        // Verify the widget was actually created
        const verifyToggle = document.getElementById('chat-toggle');
        const verifyWidget = document.getElementById('playwright-chat-widget');
        console.log('🔍 Verification - Toggle exists:', !!verifyToggle);
        console.log('🔍 Verification - Widget exists:', !!verifyWidget);
        if (verifyToggle) {
            const computedStyle = window.getComputedStyle(verifyToggle);
            console.log('🔍 Toggle button styles:', {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                position: computedStyle.position,
                bottom: computedStyle.bottom,
                right: computedStyle.right,
                width: computedStyle.width,
                height: computedStyle.height,
                opacity: computedStyle.opacity,
                zIndex: computedStyle.zIndex
            });
            console.log('🔍 Toggle button element:', verifyToggle);
            console.log('🔍 Toggle button parent:', verifyToggle.parentElement);
            
            // Debug styling removed - chat button should appear normally
            console.log('🔍 Chat toggle button is ready and visible');
        }
    }
})();

