/**
 * Page Summarization Handler
 * Generates concise summaries of web pages for tooltip display
 * 
 * Phase 3: AI Utility Expansion
 */

const logger = require('../logger');

// Summary cache (in-memory, TTL: 24 hours)
const summaryCache = new Map();
const SUMMARY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a summary for a page
 * @param {Object} params - Parameters
 * @param {string} params.url - URL to summarize
 * @param {number} params.maxLength - Maximum summary length
 * @param {Object} captureHandler - Capture handler to get page context
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<Object>} Summary object
 */
async function summarizePage(params, captureHandler, apiKey) {
    const { url, maxLength = 150, targetWords = 20 } = params;
    const summaryLogger = logger.child({ scope: 'summarize', url });

    // Check cache
    const cached = summaryCache.get(url);
    if (cached && (Date.now() - cached.timestamp) < SUMMARY_CACHE_TTL) {
        summaryLogger.debug({ event: 'summarize.cache_hit' }, 'Returning cached summary');
        return cached.summary;
    }

    try {
        summaryLogger.info({ event: 'summarize.start', maxLength }, 'Starting page summarization');

        // Get page context (capture if needed)
        let pageContext;
        try {
            // Try to get from cache first
            const captureResult = await captureHandler(url, { includeDataUri: false });
            pageContext = {
                analysis: captureResult.analysis,
                semantic: captureResult.semantic,
                text: captureResult.text || captureResult.ocrData?.cleaned || '',
                title: captureResult.title || ''
            };
        } catch (error) {
            summaryLogger.warn({ event: 'summarize.capture_failed', error: error.message }, 'Failed to capture page for summary');
            // Continue with limited context
            pageContext = {
                analysis: null,
                semantic: null,
                text: '',
                title: ''
            };
        }

        // Estimate if page is worth summarizing (long articles)
        const estimatedWordCount = pageContext.text?.split(/\s+/).length || 0;
        const isLongArticle = estimatedWordCount > 2000 || 
                             pageContext.analysis?.pageType === 'article' ||
                             pageContext.semantic?.articles?.length > 0;

        // Always use LLM for better quality 20-word summaries
        if (!apiKey || apiKey === 'YOUR_OPENAI_API_KEY_HERE') {
            summaryLogger.warn({ event: 'summarize.no_api_key' }, 'No API key available, using simple summary');
            const simpleSummary = generateSimpleSummary(pageContext, maxLength, targetWords);
            return {
                summary: simpleSummary,
                confidence: 0.6,
                method: 'simple'
            };
        }

        const llmSummary = await generateLLMSummary(pageContext, maxLength, targetWords, apiKey, summaryLogger);
        
        // Cache result
        summaryCache.set(url, { summary: llmSummary, timestamp: Date.now() });
        
        summaryLogger.info({ 
            event: 'summarize.success',
            method: llmSummary.method,
            confidence: llmSummary.confidence
        }, 'Page summarization completed');

        return llmSummary;
    } catch (error) {
        summaryLogger.warn({ 
            event: 'summarize.error',
            error: error.message
        }, 'Summarization failed, using fallback');

        // Fallback to simple summary
        return {
            summary: generateSimpleSummary({ analysis: null, semantic: null, text: '', title: '' }, maxLength, targetWords),
            confidence: 0.5,
            method: 'fallback'
        };
    }
}

/**
 * Generate simple summary from available context (target: ~20 words)
 */
function generateSimpleSummary(pageContext, maxLength, targetWords = 20) {
    const { analysis, semantic, text, title } = pageContext;
    
    let summary = '';
    
    // Start with title if available
    if (title) {
        summary += title;
    }
    
    // Add page type
    if (analysis?.pageType && analysis.pageType !== 'unknown') {
        if (summary) summary += ' - ';
        summary += `A ${analysis.pageType} page`;
    }
    
    // Add key topics
    if (analysis?.keyTopics && analysis.keyTopics.length > 0) {
        if (summary) summary += ' about ';
        summary += analysis.keyTopics.slice(0, 3).join(', ');
    }
    
    // Add main content excerpt if available (use maxLength parameter, default to 500)
    const excerptMaxLength = maxLength || 500;
    if (semantic?.mainContent) {
        // Use maxLength parameter, but ensure we don't cut mid-word
        let excerpt = semantic.mainContent.substring(0, excerptMaxLength).trim();
        // If we cut off mid-word, find the last space and truncate there
        if (excerpt.length === excerptMaxLength && semantic.mainContent.length > excerptMaxLength) {
            const lastSpace = excerpt.lastIndexOf(' ');
            if (lastSpace > excerptMaxLength * 0.8) {
                excerpt = excerpt.substring(0, lastSpace).trim();
            }
        }
        if (excerpt && !summary.includes(excerpt)) {
            if (summary) summary += '. ';
            summary += excerpt;
            // Don't add ellipsis if we're using the full content
            if (summary.length >= excerptMaxLength && semantic.mainContent.length > excerptMaxLength) {
                // Only add ellipsis if we're significantly shorter than the full content
                if (summary.length < semantic.mainContent.length * 0.9) {
                    summary += '...';
                }
            }
        }
    } else if (text && text.length > 50) {
        // Fallback to OCR text - use maxLength parameter
        let excerpt = text.substring(0, excerptMaxLength).trim();
        // If we cut off mid-word, find the last space and truncate there
        if (excerpt.length === excerptMaxLength && text.length > excerptMaxLength) {
            const lastSpace = excerpt.lastIndexOf(' ');
            if (lastSpace > excerptMaxLength * 0.8) {
                excerpt = excerpt.substring(0, lastSpace).trim();
            }
        }
        if (summary) summary += '. ';
        summary += excerpt;
        // Don't add ellipsis if excerpt is very close to full text
        if (text.length > excerptMaxLength && excerpt.length < text.length * 0.9) {
            summary += '...';
        }
    }
    
    // Allow natural completion - only truncate if way too long
    const words = summary.split(/\s+/).filter(w => w.length > 0);
    const maxWords = 150; // Flexible maximum
    if (words.length > maxWords) {
        // If way too long, truncate at sentence boundary
        const truncated = words.slice(0, maxWords).join(' ');
        const lastPeriod = truncated.lastIndexOf('.');
        const lastExclamation = truncated.lastIndexOf('!');
        const lastQuestion = truncated.lastIndexOf('?');
        const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
        
        if (lastSentenceEnd > maxWords * 0.7) {
            summary = truncated.substring(0, lastSentenceEnd + 1).trim();
        } else {
            summary = truncated.trim();
        }
    }
    
    // Remove trailing ellipsis
    summary = summary.replace(/\.\.\.+$/, '');
    
    return summary || 'Page summary unavailable';
}

/**
 * Generate summary using LLM (target: ~20 words, allows natural completion)
 */
async function generateLLMSummary(pageContext, maxLength, targetWords, apiKey, summaryLogger = null) {
    const { analysis, semantic, text, title } = pageContext;
    // Use provided logger or create one
    const loggerToUse = summaryLogger || logger.child({ scope: 'summarize.llm' });
    
    // Build context for LLM
    let context = '';
    
    if (title) {
        context += `Title: ${title}\n\n`;
    }
    
    if (analysis?.pageType) {
        context += `Page Type: ${analysis.pageType}\n`;
    }
    
    if (analysis?.keyTopics && analysis.keyTopics.length > 0) {
        context += `Key Topics: ${analysis.keyTopics.join(', ')}\n`;
    }
    
    if (semantic?.mainContent) {
        context += `\nMain Content:\n${semantic.mainContent.substring(0, 2000)}\n`;
    } else if (text) {
        context += `\nContent:\n${text.substring(0, 2000)}\n`;
    }
    
    const prompt = `Generate a concise, informative summary of this web page. Aim for approximately ${targetWords} words, but allow the summary to finish naturally and completely.

Context:
${context}

Requirements:
- Target approximately ${targetWords} words, but complete your thought naturally
- Be informative and accurate
- Focus on the main purpose and key information
- Write as a single, coherent sentence or short paragraph
- Do not include meta information or disclaimers
- Do not include ellipsis or trailing punctuation like "..."
- Complete sentences naturally - don't cut off mid-thought
- Maximum length: ~100 words (flexible, allow natural completion)

Summary:`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini', // Using mini for cost efficiency
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 300, // Allow up to ~200 words (flexible for natural completion, ~1.5 tokens per word)
                temperature: 0.5
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        let summary = data.choices?.[0]?.message?.content?.trim() || '';
        
        // Count words for logging
        const words = summary.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;
        
        // Allow natural completion - only truncate if extremely long (over 300 words)
        // This allows summaries to complete naturally without arbitrary limits
        const maxWords = 300; // Very high limit to allow natural completion
        if (wordCount > maxWords) {
            // If extremely long, truncate at sentence boundary
            const truncated = words.slice(0, maxWords).join(' ');
            // Try to end at sentence boundary
            const lastPeriod = truncated.lastIndexOf('.');
            const lastExclamation = truncated.lastIndexOf('!');
            const lastQuestion = truncated.lastIndexOf('?');
            const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
            
            if (lastSentenceEnd > maxWords * 0.8) {
                // End at sentence boundary if reasonable
                summary = truncated.substring(0, lastSentenceEnd + 1).trim();
            } else {
                // Otherwise just truncate at word boundary
                summary = truncated.trim();
            }
        }
        
        // Remove any trailing ellipsis
        summary = summary.replace(/\.\.\.+$/, '');
        
        // Log word count for monitoring
        if (wordCount < targetWords * 0.5) {
            loggerToUse.warn({ 
                event: 'summarize.word_count_low',
                wordCount: wordCount,
                target: targetWords
            }, 'Summary is shorter than target');
        } else if (wordCount > maxWords) {
            loggerToUse.warn({ 
                event: 'summarize.word_count_high',
                wordCount: wordCount,
                max: maxWords
            }, 'Summary exceeded max length and was truncated');
        }
        
        return {
            summary: summary || generateSimpleSummary(pageContext, maxLength, targetWords),
            confidence: 0.85,
            method: 'llm',
            wordCount: words.length
        };
    } catch (error) {
        logger.warn({ event: 'summarize.llm_error', error: error.message }, 'LLM summarization failed');
        // Fallback to simple
        return {
            summary: generateSimpleSummary(pageContext, maxLength),
            confidence: 0.6,
            method: 'simple_fallback'
        };
    }
}

module.exports = {
    summarizePage
};

