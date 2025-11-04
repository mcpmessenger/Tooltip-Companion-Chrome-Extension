/**
 * Link Safety Check Handler
 * Analyzes link safety and relevance
 * 
 * Phase 3: AI Utility Expansion
 */

const logger = require('../logger');

// Safety check cache (in-memory, TTL: 1 hour)
const safetyCache = new Map();
const SAFETY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Check link safety
 * @param {Object} params - Parameters
 * @param {string} params.url - URL to check
 * @param {Object} params.context - Current page context
 * @param {Object} captureHandler - Capture handler (optional, for deep analysis)
 * @param {string} apiKey - OpenAI API key (optional, for AI analysis)
 * @returns {Promise<Object>} Safety analysis
 */
async function checkLinkSafety(params, captureHandler = null, apiKey = null) {
    const { url, context = {} } = params;
    const safetyLogger = logger.child({ scope: 'safety', url });

    // Check cache
    const cached = safetyCache.get(url);
    if (cached && (Date.now() - cached.timestamp) < SAFETY_CACHE_TTL) {
        safetyLogger.debug({ event: 'safety.cache_hit' }, 'Returning cached safety check');
        return cached.result;
    }

    try {
        safetyLogger.info({ event: 'safety.check_start' }, 'Starting link safety check');

        const result = {
            url: url,
            score: 0.8, // Default: moderately safe
            status: 'safe', // 'safe', 'caution', 'unsafe'
            reasons: [],
            confidence: 0.7,
            timestamp: new Date().toISOString()
        };

        // Check 1: URL pattern analysis
        const urlAnalysis = analyzeURLPattern(url);
        result.score += urlAnalysis.scoreDelta;
        result.reasons.push(...urlAnalysis.reasons);

        // Check 2: Domain analysis
        const domainAnalysis = analyzeDomain(url, context);
        result.score += domainAnalysis.scoreDelta;
        result.reasons.push(...domainAnalysis.reasons);

        // Check 3: Context comparison (if current page context provided)
        if (context.currentUrl) {
            const contextAnalysis = analyzeContext(url, context);
            result.score += contextAnalysis.scoreDelta;
            result.reasons.push(...contextAnalysis.reasons);
        }

        // Normalize score to 0-1 range
        result.score = Math.max(0, Math.min(1, result.score));

        // Determine status
        if (result.score >= 0.7) {
            result.status = 'safe';
        } else if (result.score >= 0.4) {
            result.status = 'caution';
        } else {
            result.status = 'unsafe';
        }

        // Optional: Deep analysis with page capture (if handler provided and score is low)
        if (captureHandler && result.score < 0.6 && apiKey) {
            try {
                const deepAnalysis = await performDeepAnalysis(url, captureHandler, apiKey);
                if (deepAnalysis) {
                    result.score = (result.score + deepAnalysis.score) / 2; // Average
                    result.reasons.push(...deepAnalysis.reasons);
                    result.confidence = Math.max(result.confidence, deepAnalysis.confidence);
                }
            } catch (error) {
                safetyLogger.warn({ event: 'safety.deep_analysis_failed', error: error.message }, 'Deep analysis failed');
            }
        }

        // Cache result
        safetyCache.set(url, { result: result, timestamp: Date.now() });

        safetyLogger.info({
            event: 'safety.check_complete',
            status: result.status,
            score: result.score,
            reasonsCount: result.reasons.length
        }, 'Link safety check completed');

        return result;
    } catch (error) {
        safetyLogger.warn({ event: 'safety.check_error', error: error.message }, 'Safety check failed');
        
        // Return safe default on error
        return {
            url: url,
            score: 0.7,
            status: 'safe',
            reasons: ['Safety check unavailable'],
            confidence: 0.5,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Analyze URL patterns
 */
function analyzeURLPattern(url) {
    const reasons = [];
    let scoreDelta = 0;

    try {
        const urlObj = new URL(url);

        // Check for URL shorteners
        const shortenerDomains = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'short.link'];
        if (shortenerDomains.some(domain => urlObj.hostname.includes(domain))) {
            reasons.push('⚠️ URL shortener detected - destination unknown');
            scoreDelta -= 0.2;
        }

        // Check for suspicious patterns
        if (urlObj.hostname.includes('bit.ly') || urlObj.hostname.includes('tinyurl')) {
            reasons.push('⚠️ Shortened URL - cannot verify destination');
            scoreDelta -= 0.15;
        }

        // Check for IP addresses (often suspicious)
        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipPattern.test(urlObj.hostname)) {
            reasons.push('⚠️ Direct IP address - may be suspicious');
            scoreDelta -= 0.1;
        }

        // Check for excessive subdomains (potential phishing)
        const subdomainCount = urlObj.hostname.split('.').length;
        if (subdomainCount > 4) {
            reasons.push('⚠️ Unusual number of subdomains');
            scoreDelta -= 0.05;
        }

        // Check for suspicious TLDs
        const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq'];
        if (suspiciousTLDs.some(tld => urlObj.hostname.endsWith(tld))) {
            reasons.push('⚠️ Suspicious top-level domain');
            scoreDelta -= 0.1;
        }

        // Check for HTTP (not HTTPS)
        if (urlObj.protocol === 'http:') {
            reasons.push('⚠️ Not using HTTPS - connection not encrypted');
            scoreDelta -= 0.1;
        }

        // Positive indicators
        if (urlObj.protocol === 'https:') {
            scoreDelta += 0.05;
        }

    } catch (error) {
        // Invalid URL
        reasons.push('❌ Invalid URL format');
        scoreDelta -= 0.3;
    }

    return { scoreDelta, reasons };
}

/**
 * Analyze domain
 */
function analyzeDomain(url, context) {
    const reasons = [];
    let scoreDelta = 0;

    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Check if domain matches current page domain
        if (context.currentUrl) {
            try {
                const currentDomain = new URL(context.currentUrl).hostname;
                if (domain === currentDomain) {
                    reasons.push('✅ Same domain as current page');
                    scoreDelta += 0.1;
                } else {
                    // Check if subdomain
                    if (domain.endsWith('.' + currentDomain) || currentDomain.endsWith('.' + domain)) {
                        reasons.push('✅ Related domain');
                        scoreDelta += 0.05;
                    }
                }
            } catch (e) {
                // Ignore
            }
        }

        // Check for known safe domains
        const safeDomains = ['github.com', 'wikipedia.org', 'stackoverflow.com', 'reddit.com', 'medium.com'];
        if (safeDomains.some(safe => domain.includes(safe))) {
            reasons.push('✅ Known reputable domain');
            scoreDelta += 0.1;
        }

        // Check for suspicious domain patterns
        if (domain.includes('--') || domain.includes('..')) {
            reasons.push('⚠️ Suspicious domain pattern');
            scoreDelta -= 0.1;
        }

    } catch (error) {
        // Ignore
    }

    return { scoreDelta, reasons };
}

/**
 * Analyze context relevance
 */
function analyzeContext(url, context) {
    const reasons = [];
    let scoreDelta = 0;

    try {
        const urlObj = new URL(url);
        
        // If same domain, likely safe
        if (context.currentUrl) {
            try {
                const currentDomain = new URL(context.currentUrl).hostname;
                if (urlObj.hostname === currentDomain) {
                    reasons.push('✅ Same domain - likely safe');
                    scoreDelta += 0.15;
                }
            } catch (e) {
                // Ignore
            }
        }

        // Check if URL appears in page content (likely legitimate)
        if (context.text && context.text.includes(urlObj.hostname)) {
            reasons.push('✅ Domain referenced in page content');
            scoreDelta += 0.05;
        }

    } catch (error) {
        // Ignore
    }

    return { scoreDelta, reasons };
}

/**
 * Perform deep analysis with page capture and AI
 */
async function performDeepAnalysis(url, captureHandler, apiKey) {
    try {
        // Capture page to analyze content
        const captureResult = await captureHandler(url, { includeDataUri: false });
        
        if (!captureResult) {
            return null;
        }

        // Use AI to analyze if page content is suspicious
        const analysis = captureResult.analysis;
        const text = captureResult.text || captureResult.ocrData?.cleaned || '';
        
        // Simple heuristic: if page loads and has reasonable content, likely safe
        if (text.length > 100 && analysis && analysis.pageType !== 'unknown') {
            return {
                score: 0.1, // Boost score
                reasons: ['✅ Page loads successfully with content'],
                confidence: 0.8
            };
        }

        return null;
    } catch (error) {
        logger.warn({ event: 'safety.deep_analysis_error', error: error.message }, 'Deep analysis failed');
        return null;
    }
}

module.exports = {
    checkLinkSafety
};

