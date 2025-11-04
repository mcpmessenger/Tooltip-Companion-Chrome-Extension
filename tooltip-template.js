// tooltip-template.js - Unified Template Component for Tooltip Companion
// Provides consistent rendering of screenshot + metadata for both tooltips and chat

/**
 * Standard template data structure
 * @typedef {Object} TooltipTemplateData
 * @property {string} screenshotUrl - URL or data URI for the screenshot
 * @property {Object} analysis - Page analysis metadata
 * @property {string} analysis.pageType - Type of page (login, banking, ecommerce, etc.)
 * @property {string[]} analysis.keyTopics - Key topics extracted from the page
 * @property {string[]} analysis.suggestedActions - Suggested actions for the user
 * @property {number} analysis.confidence - Confidence score (0-1)
 * @property {string} text - OCR extracted text from screenshot
 * @property {string} url - Original URL of the page
 * @property {boolean} usedDataUri - Whether screenshot is using data URI (CSP-safe)
 */

/**
 * Render standardized tooltip/chat template
 * @param {TooltipTemplateData} data - Template data
 * @param {Object} options - Rendering options
 * @param {string} options.mode - 'tooltip' or 'chat'
 * @param {boolean} options.showScreenshot - Whether to show screenshot (default: true)
 * @param {boolean} options.showMetadata - Whether to show metadata (default: true)
 * @param {boolean} options.compact - Compact mode for chat (default: false)
 * @returns {string} HTML string for the template
 */
function renderTooltipTemplate(data, options = {}) {
    const {
        mode = 'tooltip',
        showScreenshot = true,
        showMetadata = true,
        compact = false
    } = options;

    // Force no screenshots in chat mode
    const shouldShowScreenshot = mode === 'chat' ? false : showScreenshot;

    const { screenshotUrl, analysis, text, url, usedDataUri } = data;

    // Page type icon mapping
    const pageTypeIcons = {
        'login': '🔐',
        'ecommerce': '🛒',
        'banking': '🏦',
        'news': '📰',
        'contact': '📞',
        'unknown': '🌐'
    };

    const pageType = analysis?.pageType || 'unknown';
    const pageTypeIcon = pageTypeIcons[pageType] || pageTypeIcons['unknown'];
    const confidence = analysis?.confidence ? Math.round(analysis.confidence * 100) : 0;
    const keyTopics = analysis?.keyTopics || [];
    const suggestedActions = analysis?.suggestedActions || [];

    // Base styles
    const containerClass = mode === 'chat' ? 'tooltip-template-chat' : 'tooltip-template-popup';
    const isCompact = compact || mode === 'chat';

    let html = `<div class="${containerClass}" data-mode="${mode}">`;

    // Header: Metadata section
    if (showMetadata && analysis) {
        html += `
            <div class="template-header">
                <div class="template-page-type">
                    <span class="template-icon">${pageTypeIcon}</span>
                    <span class="template-page-type-name">${pageType.charAt(0).toUpperCase() + pageType.slice(1)}</span>
                    ${confidence > 50 ? `<span class="template-confidence">${confidence}%</span>` : ''}
                </div>
                ${keyTopics.length > 0 ? `
                    <div class="template-topics">
                        <span class="template-icon-small">📌</span>
                        <span class="template-topics-text">${keyTopics.slice(0, 3).join(' • ')}</span>
                    </div>
                ` : ''}
                ${suggestedActions.length > 0 ? `
                    <div class="template-actions">
                        <span class="template-icon-small">💡</span>
                        <span class="template-actions-text">${suggestedActions[0]}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Screenshot section
    if (shouldShowScreenshot && screenshotUrl) {
        const screenshotMaxHeight = isCompact ? '150px' : '200px';
        html += `
            <div class="template-screenshot-container">
                <img src="${screenshotUrl}" 
                     class="template-screenshot"
                     alt="Page preview"
                     loading="lazy"
                     crossorigin="anonymous"
                     referrerpolicy="no-referrer"
                     data-using-data-uri="${usedDataUri ? 'true' : 'false'}"
                     style="max-height: ${screenshotMaxHeight};">
                <div class="template-screenshot-error" style="display: none;">
                    <span class="template-icon-small">⚠️</span>
                    <span>Screenshot unavailable</span>
                </div>
                <div class="template-screenshot-loading" style="display: none;">
                    <span class="template-icon-small">📸</span>
                    <span>Loading preview...</span>
                </div>
            </div>
        `;
    } else if (shouldShowScreenshot && !screenshotUrl) {
        html += `
            <div class="template-screenshot-container">
                <div class="template-screenshot-loading">
                    <span class="template-icon-small">📸</span>
                    <span>Loading preview...</span>
                </div>
            </div>
        `;
    }

    // OCR Text section (compact mode or chat, or when explicitly requested)
    if ((isCompact || mode === 'chat') && text && text.trim().length > 0) {
        const previewText = text.substring(0, 150) + (text.length > 150 ? '...' : '');
        html += `
            <div class="template-text-preview">
                <span class="template-icon-small">📝</span>
                <span class="template-text-content">${escapeHtml(previewText)}</span>
            </div>
        `;
    }

    // URL footer (for chat mode)
    if (mode === 'chat' && url) {
        html += `
            <div class="template-url-footer">
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="template-url-link">
                    ${url}
                </a>
            </div>
        `;
    }

    html += `</div>`;

    return html;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Attach event handlers for screenshot loading/error states
 * @param {HTMLElement} container - Container element with template
 * @param {string} screenshotUrl - Screenshot URL
 * @param {Function} onError - Callback for error handling (CSP fallback, etc.)
 */
function attachScreenshotHandlers(container, screenshotUrl, onError) {
    const img = container.querySelector('.template-screenshot');
    if (!img) return;

    // Check if already loaded
    if (img.complete && img.naturalHeight !== 0) {
        console.log('✅ Screenshot image already loaded (cached)');
        return;
    }

    // Loading state
    const loadingDiv = container.querySelector('.template-screenshot-loading');
    const errorDiv = container.querySelector('.template-screenshot-error');

    if (loadingDiv) loadingDiv.style.display = 'flex';

    // Load handler
    img.addEventListener('load', () => {
        console.log('✅ Screenshot image loaded successfully');
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (errorDiv) errorDiv.style.display = 'none';
        img.dataset.usingDataUri = img.src.startsWith('data:') ? 'true' : 'false';
    });

    // Error handler
    img.addEventListener('error', async (e) => {
        console.error('❌ Screenshot image failed to load:', screenshotUrl);
        
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (errorDiv) {
            errorDiv.style.display = 'flex';
        }

        // Trigger CSP fallback if callback provided
        if (onError && typeof onError === 'function') {
            await onError(e, img);
        }
    });
}

/**
 * Get CSS styles for the template
 * @param {string} mode - 'tooltip' or 'chat'
 * @returns {string} CSS string
 */
function getTemplateStyles(mode = 'tooltip') {
    const isChat = mode === 'chat';
    
    return `
        <style>
            .tooltip-template-popup,
            .tooltip-template-chat {
                font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border-radius: ${isChat ? '12px' : '16px'};
                border: 1px solid rgba(255, 255, 255, 0.08);
                overflow: hidden;
                color: rgba(255, 255, 255, 0.95);
            }

            .template-header {
                padding: ${isChat ? '12px' : '14px'};
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }

            .template-page-type {
                display: flex;
                align-items: center;
                gap: 6px;
                font-weight: 600;
                font-size: ${isChat ? '12px' : '13px'};
                color: rgba(255, 255, 255, 0.95);
                margin-bottom: ${isChat ? '6px' : '8px'};
                text-transform: capitalize;
            }

            .template-icon {
                font-size: ${isChat ? '14px' : '16px'};
            }

            .template-page-type-name {
                flex: 1;
            }

            .template-confidence {
                font-size: ${isChat ? '9px' : '10px'};
                color: rgba(255, 255, 255, 0.5);
                font-weight: normal;
                margin-left: 4px;
            }

            .template-topics,
            .template-actions {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: ${isChat ? '10px' : '11px'};
                color: rgba(255, 255, 255, 0.75);
                margin-top: ${isChat ? '4px' : '6px'};
            }

            .template-icon-small {
                font-size: ${isChat ? '11px' : '12px'};
                flex-shrink: 0;
            }

            .template-topics-text,
            .template-actions-text {
                flex: 1;
            }

            .template-screenshot-container {
                position: relative;
                width: 100%;
                background: rgba(0, 0, 0, 0.2);
            }

            .template-screenshot {
                display: block;
                width: 100%;
                height: auto;
                object-fit: cover;
                border-radius: 0;
            }

            .template-screenshot-error,
            .template-screenshot-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: ${isChat ? '12px' : '16px'};
                background: rgba(255, 255, 255, 0.05);
                font-size: ${isChat ? '10px' : '11px'};
                color: rgba(255, 255, 255, 0.6);
                text-align: center;
            }

            .template-text-preview {
                display: flex;
                align-items: flex-start;
                gap: 6px;
                padding: ${isChat ? '10px 12px' : '12px 14px'};
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                font-size: ${isChat ? '10px' : '11px'};
                color: rgba(255, 255, 255, 0.7);
                line-height: 1.4;
            }

            .template-text-content {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
            }

            .template-url-footer {
                padding: ${isChat ? '8px 12px' : '10px 14px'};
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(0, 0, 0, 0.2);
            }

            .template-url-link {
                display: block;
                font-size: ${isChat ? '9px' : '10px'};
                color: rgba(255, 255, 255, 0.6);
                text-decoration: none;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                transition: color 0.2s;
            }

            .template-url-link:hover {
                color: rgba(255, 255, 255, 0.9);
            }

            /* Chat-specific adjustments */
            .tooltip-template-chat {
                margin: ${isChat ? '8px 0' : '0'};
                max-width: ${isChat ? '100%' : 'auto'};
            }

            .tooltip-template-chat .template-header {
                padding: 10px 12px;
            }

            .tooltip-template-chat .template-screenshot-container {
                max-height: ${isChat ? '150px' : 'auto'};
                overflow: hidden;
            }
        </style>
    `;
}

// Export for use in content.js and chat interface
if (typeof window !== 'undefined') {
    window.TooltipTemplate = {
        render: renderTooltipTemplate,
        attachHandlers: attachScreenshotHandlers,
        getStyles: getTemplateStyles,
        escapeHtml: escapeHtml
    };
}

// Export for Node.js/CommonJS if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        render: renderTooltipTemplate,
        attachHandlers: attachScreenshotHandlers,
        getStyles: getTemplateStyles,
        escapeHtml: escapeHtml
    };
}

