/**
 * OCR Text Cleanup Processor
 * Cleans and preprocesses OCR text for better AI context
 * 
 * Phase 2: Context Gathering Enhancement
 */

const logger = require('../logger');

/**
 * Clean and preprocess OCR text
 * @param {string} rawText - Raw OCR text
 * @param {Object} options - Processing options
 * @returns {Object} Cleaned text with metadata
 */
function cleanOCRText(rawText, options = {}) {
    const {
        removeArtifacts = true,
        normalizeWhitespace = true,
        removeDuplicates = true,
        filterBoilerplate = true,
        extractStructuredData = true
    } = options;

    const cleanupLogger = logger.child({ scope: 'ocr.cleanup' });

    try {
        if (!rawText || typeof rawText !== 'string') {
            return {
                text: '',
                cleaned: '',
                confidence: 0,
                artifacts: []
            };
        }

        let cleaned = rawText;
        const artifacts = [];

        // Step 1: Remove common OCR artifacts
        if (removeArtifacts) {
            const beforeLength = cleaned.length;
            
            // Remove garbled characters (non-printable except common punctuation)
            cleaned = cleaned.replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, ' ');
            
            // Remove common OCR noise patterns
            cleaned = cleaned.replace(/\b[|]{2,}\b/g, ''); // Multiple pipes
            cleaned = cleaned.replace(/\b[Il1]{3,}\b/g, ''); // Confused I/l/1
            cleaned = cleaned.replace(/\b[0O]{3,}\b/g, ''); // Confused 0/O
            cleaned = cleaned.replace(/[^\w\s.,!?;:'"()\-]/g, ' '); // Remove special chars except punctuation
            
            const removed = beforeLength - cleaned.length;
            if (removed > 0) {
                artifacts.push(`Removed ${removed} artifact characters`);
            }
        }

        // Step 2: Normalize whitespace
        if (normalizeWhitespace) {
            cleaned = cleaned.replace(/\s+/g, ' '); // Multiple spaces to single
            cleaned = cleaned.replace(/\n\s*\n/g, '\n'); // Multiple newlines to single
            cleaned = cleaned.trim();
        }

        // Step 3: Remove duplicate lines
        if (removeDuplicates) {
            const lines = cleaned.split('\n');
            const seen = new Set();
            const uniqueLines = [];
            let duplicatesRemoved = 0;

            lines.forEach(line => {
                const normalized = line.trim().toLowerCase();
                if (normalized.length > 0 && !seen.has(normalized)) {
                    seen.add(normalized);
                    uniqueLines.push(line);
                } else if (normalized.length > 0) {
                    duplicatesRemoved++;
                }
            });

            if (duplicatesRemoved > 0) {
                artifacts.push(`Removed ${duplicatesRemoved} duplicate lines`);
                cleaned = uniqueLines.join('\n');
            }
        }

        // Step 4: Filter out navigation boilerplate
        if (filterBoilerplate) {
            const boilerplatePatterns = [
                /^(Home|About|Contact|Privacy|Terms|Cookie|Login|Sign In|Sign Up|Register|Subscribe|Menu|Navigation|Skip to content)/i,
                /^(Copyright|©|All rights reserved|Powered by)/i,
                /^(Cookie Policy|Privacy Policy|Terms of Service|Terms and Conditions)/i,
                /^(Skip to|Jump to|Go to)/i,
                /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})$/ // Date-only lines
            ];

            const lines = cleaned.split('\n');
            const filteredLines = [];
            let boilerplateRemoved = 0;

            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.length === 0) {
                    filteredLines.push(line);
                    return;
                }

                const isBoilerplate = boilerplatePatterns.some(pattern => pattern.test(trimmed));
                if (!isBoilerplate) {
                    filteredLines.push(line);
                } else {
                    boilerplateRemoved++;
                }
            });

            if (boilerplateRemoved > 0) {
                artifacts.push(`Removed ${boilerplateRemoved} boilerplate lines`);
                cleaned = filteredLines.join('\n');
            }
        }

        // Step 5: Extract structured data (dates, prices, etc.)
        const structuredData = extractStructuredData ? extractStructuredDataFromText(cleaned) : null;

        // Calculate confidence score
        const confidence = calculateConfidence(rawText, cleaned, artifacts);

        cleanupLogger.debug({
            event: 'ocr.cleanup.success',
            originalLength: rawText.length,
            cleanedLength: cleaned.length,
            artifactsCount: artifacts.length,
            confidence: confidence
        }, 'OCR text cleanup completed');

        return {
            text: rawText, // Keep original
            cleaned: cleaned,
            confidence: confidence,
            artifacts: artifacts,
            structuredData: structuredData
        };
    } catch (error) {
        cleanupLogger.warn({
            event: 'ocr.cleanup.error',
            error: error.message
        }, 'OCR cleanup failed, returning original text');
        
        return {
            text: rawText,
            cleaned: rawText,
            confidence: 0.5,
            artifacts: ['Cleanup failed']
        };
    }
}

/**
 * Extract structured data from text
 * @param {string} text - Text to analyze
 * @returns {Object|null} Extracted structured data
 */
function extractStructuredDataFromText(text) {
    const data = {
        dates: [],
        prices: [],
        emails: [],
        urls: [],
        phoneNumbers: []
    };

    // Extract dates
    const datePatterns = [
        /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, // MM/DD/YYYY
        /\b\d{1,2}-\d{1,2}-\d{4}\b/g, // MM-DD-YYYY
        /\b\d{4}-\d{2}-\d{2}\b/g, // YYYY-MM-DD
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi
    ];

    datePatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
            data.dates.push(...matches);
        }
    });

    // Extract prices
    const pricePattern = /\$[\d,]+(?:\.\d{2})?|\d+\.\d{2}\s*(?:USD|EUR|GBP|CAD)/g;
    const priceMatches = text.match(pricePattern);
    if (priceMatches) {
        data.prices.push(...priceMatches);
    }

    // Extract emails
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailMatches = text.match(emailPattern);
    if (emailMatches) {
        data.emails.push(...emailMatches);
    }

    // Extract URLs
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urlMatches = text.match(urlPattern);
    if (urlMatches) {
        data.urls.push(...urlMatches);
    }

    // Extract phone numbers
    const phonePattern = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b/g;
    const phoneMatches = text.match(phonePattern);
    if (phoneMatches) {
        data.phoneNumbers.push(...phoneMatches);
    }

    // Only return if we found something
    const hasData = Object.values(data).some(arr => arr.length > 0);
    return hasData ? data : null;
}

/**
 * Calculate confidence score for cleaned OCR text
 * @param {string} original - Original text
 * @param {string} cleaned - Cleaned text
 * @param {Array} artifacts - List of artifacts found
 * @returns {number} Confidence score (0-1)
 */
function calculateConfidence(original, cleaned, artifacts) {
    if (!original || original.length === 0) return 0;

    let confidence = 0.7; // Base confidence

    // Penalize if too much was removed
    const removalRatio = (original.length - cleaned.length) / original.length;
    if (removalRatio > 0.5) {
        confidence -= 0.2; // Too much removed
    } else if (removalRatio > 0.3) {
        confidence -= 0.1; // Moderate removal
    }

    // Penalize for artifacts
    if (artifacts.length > 5) {
        confidence -= 0.1;
    } else if (artifacts.length > 2) {
        confidence -= 0.05;
    }

    // Boost confidence if text looks clean
    const hasGoodStructure = cleaned.includes('.') && cleaned.length > 100;
    if (hasGoodStructure) {
        confidence += 0.1;
    }

    // Ensure confidence is within bounds
    return Math.max(0, Math.min(1, confidence));
}

module.exports = {
    cleanOCRText,
    extractStructuredDataFromText,
    calculateConfidence
};

