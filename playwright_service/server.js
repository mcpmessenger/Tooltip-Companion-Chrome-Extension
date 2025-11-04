// server.js - Playwright Tooltip Backend Service
// Captures screenshots of web pages on demand

const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const Tesseract = require('tesseract.js');
const MCPServer = require('./mcp-server');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Allow chrome extensions
        if (origin.startsWith('chrome-extension://')) return callback(null, true);
        
        // Allow localhost
        if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return callback(null, true);
        
        // Allow all HTTPS origins (for web pages)
        if (origin.startsWith('https://')) return callback(null, true);
        
        // Allow HTTP for local development
        if (origin.startsWith('http://')) return callback(null, true);
        
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.raw({ limit: '100mb' }));

// State
let browser = null;
let screenshotCache = new Map();
let pageAnalysisCache = new Map(); // Cache for page analysis
let blockedSites = new Set(); // Track sites that blocked us
let screenshotTokens = new Map(); // Map token -> filepath for signed URLs
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BLOCKED_TTL = 60 * 60 * 1000; // Don't retry blocked sites for 1 hour

// Resilience configuration (Operation Juicebox)
const MAX_CAPTURE_ATTEMPTS = Number(process.env.CAPTURE_MAX_ATTEMPTS || 3);
const CAPTURE_BASE_DELAY_MS = Number(process.env.CAPTURE_BASE_DELAY_MS || 1000);
const CIRCUIT_BREAKER_THRESHOLD = Number(process.env.CIRCUIT_BREAKER_THRESHOLD || 3);
const CIRCUIT_BREAKER_COOLDOWN_MS = Number(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || 5 * 60 * 1000);
const CIRCUIT_BREAKER_BLOCK_MS = Number(process.env.CIRCUIT_BREAKER_BLOCK_MS || 15 * 60 * 1000);

const captureMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageDurationMs: 0,
    lastFailureAt: null
};

const circuitBreakerState = new Map(); // host -> { failures, openedAt, nextAttemptAt }

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getHostFromUrl(targetUrl) {
    try {
        return new URL(targetUrl).hostname;
    } catch (error) {
        return null;
    }
}

function getCircuit(host) {
    if (!host) return null;
    if (!circuitBreakerState.has(host)) {
        circuitBreakerState.set(host, {
            failures: 0,
            openedAt: null,
            nextAttemptAt: null
        });
    }
    return circuitBreakerState.get(host);
}

function isCircuitOpen(host) {
    const state = getCircuit(host);
    if (!state) return false;
    if (!state.nextAttemptAt) return false;
    const now = Date.now();
    return state.nextAttemptAt > now;
}

function recordCircuitFailure(host, options = {}) {
    const state = getCircuit(host);
    if (!state) return;

    state.failures += 1;
    const now = Date.now();

    if (state.failures >= CIRCUIT_BREAKER_THRESHOLD || options.forceOpen) {
        const cooldown = options.cooldownMs || CIRCUIT_BREAKER_COOLDOWN_MS;
        state.openedAt = now;
        state.nextAttemptAt = now + cooldown;

        logger.warn({
            event: 'circuit_breaker.opened',
            host,
            failures: state.failures,
            cooldownMs: cooldown
        }, 'Circuit breaker opened');
    }
}

function recordCircuitSuccess(host) {
    const state = getCircuit(host);
    if (!state) return;

    if (state.failures > 0 || state.nextAttemptAt) {
        logger.debug({
            event: 'circuit_breaker.reset',
            host,
            previousFailures: state.failures
        }, 'Circuit breaker reset after successful capture');
    }

    state.failures = 0;
    state.openedAt = null;
    state.nextAttemptAt = null;
}

function getCircuitSnapshot() {
    const snapshot = [];
    const now = Date.now();
    for (const [host, state] of circuitBreakerState.entries()) {
        snapshot.push({
            host,
            failures: state.failures,
            openedAt: state.openedAt,
            nextAttemptAt: state.nextAttemptAt,
            remainingMs: state.nextAttemptAt ? Math.max(0, state.nextAttemptAt - now) : 0
        });
    }
    return snapshot.filter(entry => entry.failures > 0 || entry.remainingMs > 0);
}

function createCircuitOpenError(host) {
    const state = getCircuit(host);
    const retryAfterSeconds = state?.nextAttemptAt ? Math.ceil((state.nextAttemptAt - Date.now()) / 1000) : undefined;
    const error = new Error(`Circuit open for ${host}. Retry after ${retryAfterSeconds || 60} seconds.`);
    error.name = 'CircuitOpenError';
    error.isBlocked = true;
    if (retryAfterSeconds) {
        error.retryAfter = `${retryAfterSeconds}s`;
    }
    return error;
}

const RETRYABLE_ERROR_PATTERNS = [
    /Navigation Timeout/i,
    /net::ERR_CONNECTION_RESET/i,
    /net::ERR_CONNECTION_CLOSED/i,
    /net::ERR_CONNECTION_REFUSED/i,
    /net::ERR_TIMED_OUT/i,
    /Execution context was destroyed/i,
    /Protocol error/i,
    /Target closed/i
];

function isRetryableError(error) {
    if (!error) return false;
    if (error.isBlocked) return false;
    if (error.isTimeout) return true;
    const message = error.message || '';
    return RETRYABLE_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

// Screenshot storage configuration
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(process.cwd(), 'tmp', 'screenshots');
const SCREENSHOT_URL_BASE = process.env.SCREENSHOT_URL_BASE || ''; // Base URL for screenshots (set to backend URL in production)

// Ensure screenshot directory exists (non-blocking - won't crash server if it fails)
async function ensureScreenshotDir() {
    try {
        await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
        logger.info({ event: 'screenshot.dir_ready', path: SCREENSHOT_DIR }, 'Screenshot directory ready');
        return true;
    } catch (error) {
        // Log warning but don't crash - fall back to base64 if needed
        logger.warn({
            event: 'screenshot.dir_error',
            path: SCREENSHOT_DIR,
            error: error.message
        }, 'Failed to create screenshot directory, falling back to base64 encoding');
        return false;
    }
}

// Generate secure token for screenshot
function generateScreenshotToken(url) {
    const hash = crypto.createHash('sha256');
    hash.update(url + Date.now().toString());
    return hash.digest('hex').substring(0, 32);
}

// Save screenshot to disk and return token (falls back to null if disk storage fails)
async function saveScreenshotToDisk(screenshotBuffer, url) {
    try {
        const token = generateScreenshotToken(url);
        const filename = `${token}.png`;
        const filepath = path.join(SCREENSHOT_DIR, filename);
        
        await fs.writeFile(filepath, screenshotBuffer);
        
        // Store token mapping
        screenshotTokens.set(token, {
            filepath: filepath,
            url: url,
            timestamp: Date.now()
        });
        
        logger.debug({
            event: 'screenshot.saved',
            filename,
            token,
            url
        }, 'Screenshot saved to disk');
        return token;
    } catch (error) {
        // Don't crash - fall back to base64 encoding
        logger.warn({
            event: 'screenshot.disk_write_failed',
            url,
            error: error.message
        }, 'Failed to save screenshot to disk, falling back to base64 encoding');
        return null; // Return null to indicate disk save failed
    }
}

// Get screenshot URL from token
function getScreenshotUrl(token) {
    if (SCREENSHOT_URL_BASE) {
        return `${SCREENSHOT_URL_BASE}/screenshot/${token}`;
    }
    // Relative URL (will use request host)
    return `/screenshot/${token}`;
}

// Clean up old screenshot files
async function cleanupOldScreenshots() {
    try {
        const files = await fs.readdir(SCREENSHOT_DIR);
        const now = Date.now();
        let cleaned = 0;
        
        for (const file of files) {
            if (!file.endsWith('.png')) continue;
            
            const filepath = path.join(SCREENSHOT_DIR, file);
            const stats = await fs.stat(filepath);
            const age = now - stats.mtimeMs;
            
            if (age > CACHE_TTL) {
                await fs.unlink(filepath);
                cleaned++;
            }
        }
        
        // Clean up token mappings
        for (const [token, data] of screenshotTokens.entries()) {
            if (now - data.timestamp > CACHE_TTL) {
                screenshotTokens.delete(token);
            }
        }
        
        if (cleaned > 0) {
            logger.debug({
                event: 'screenshot.cleanup',
                cleanedCount: cleaned
            }, 'Cleaned up old screenshot files');
        }
    } catch (error) {
        logger.warn({
            event: 'screenshot.cleanup_error',
            error: error.message
        }, 'Screenshot cleanup error');
    }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldScreenshots, 10 * 60 * 1000);

// Initialize browser
async function initBrowser() {
    if (!browser) {
        logger.info({ event: 'browser.init' }, 'Initializing Playwright browser');
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        logger.info({ event: 'browser.ready' }, 'Browser initialized');
    }
    return browser;
}

// Clean up browser on exit
process.on('SIGINT', async () => {
    logger.warn({ event: 'server.shutdown_signal' }, 'Received shutdown signal (SIGINT)');
    if (browser) {
        await browser.close();
    }
    process.exit(0);
});

// Check cache
function isCacheValid(timestamp) {
    return (Date.now() - timestamp) < CACHE_TTL;
}

// Extract text from screenshot using OCR
async function extractTextFromScreenshot(screenshotBuffer) {
    try {
        logger.debug({ event: 'ocr.start' }, 'Extracting text from screenshot');
        const { data: { text } } = await Tesseract.recognize(screenshotBuffer, 'eng', {
            logger: m => logger.debug({ event: 'ocr.progress', status: m.status, progress: m.progress }, 'OCR progress update')
        });
        return text.trim();
    } catch (error) {
        logger.warn({ event: 'ocr.error', error: error.message }, 'OCR failed');
        return '';
    }
}

// Analyze page content and extract key information
function analyzePageContent(text, url) {
    const analysis = {
        pageType: 'unknown',
        keyTopics: [],
        suggestedActions: [],
        confidence: 0
    };
    
    const lowerText = text.toLowerCase();
    const lowerUrl = url.toLowerCase();
    
    // Detect page type
    if (lowerUrl.includes('login') || lowerText.includes('sign in') || lowerText.includes('password')) {
        analysis.pageType = 'login';
        analysis.suggestedActions.push('Login form detected - be careful with credentials');
    } else if (lowerUrl.includes('checkout') || lowerText.includes('buy now') || lowerText.includes('add to cart')) {
        analysis.pageType = 'ecommerce';
        analysis.suggestedActions.push('Shopping page - check prices and reviews');
    } else if (lowerUrl.includes('bank') || lowerText.includes('account') || lowerText.includes('balance')) {
        analysis.pageType = 'banking';
        analysis.suggestedActions.push('Financial page - verify security');
    } else if (lowerText.includes('news') || lowerText.includes('article')) {
        analysis.pageType = 'news';
        analysis.suggestedActions.push('News article - check publication date');
    } else if (lowerText.includes('contact') || lowerText.includes('phone') || lowerText.includes('email')) {
        analysis.pageType = 'contact';
        analysis.suggestedActions.push('Contact information available');
    }
    
    // Extract key topics
    const topics = [];
    if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('$')) topics.push('pricing');
    if (lowerText.includes('review') || lowerText.includes('rating')) topics.push('reviews');
    if (lowerText.includes('download') || lowerText.includes('install')) topics.push('download');
    if (lowerText.includes('support') || lowerText.includes('help')) topics.push('support');
    if (lowerText.includes('privacy') || lowerText.includes('terms')) topics.push('legal');
    
    analysis.keyTopics = topics;
    
    analysis.confidence = Math.min(0.9, topics.length * 0.2 + (analysis.pageType !== 'unknown' ? 0.3 : 0));
    
    return analysis;
}

// Capture screenshot
async function captureScreenshot(url, options = {}) {
    const { includeDataUri = false } = options;
    const hostname = getHostFromUrl(url);
    const captureLogger = logger.child({ scope: 'capture', url, host: hostname });
    const requestStarted = performance.now();

    captureMetrics.totalRequests += 1;

    if (!hostname) {
        const error = new Error('Invalid URL');
        captureLogger.error({ event: 'capture.invalid_url' }, 'Failed to capture screenshot: invalid URL');
        throw error;
    }

    if (blockedSites.has(hostname)) {
        const error = new Error(`Site ${hostname} is currently blocked (bot detection). Will retry in 1 hour.`);
        error.isBlocked = true;
        error.retryAfter = `${Math.round(BLOCKED_TTL / 1000)}s`;
        captureLogger.warn({ event: 'capture.blocked_host' }, 'Host is temporarily blocked due to prior 403/timeout');
        throw error;
    }

    if (isCircuitOpen(hostname)) {
        const circuitError = createCircuitOpenError(hostname);
        captureLogger.warn({
            event: 'capture.circuit_open',
            retryAfter: circuitError.retryAfter
        }, 'Circuit breaker open for host');
        throw circuitError;
    }

    const cacheEntry = screenshotCache.get(url);
    if (cacheEntry && isCacheValid(cacheEntry.timestamp) && (!includeDataUri || cacheEntry.dataUri)) {
        captureLogger.debug({ event: 'capture.cache_hit' }, 'Returning cached screenshot');
        const responsePayload = {
            screenshotUrl: includeDataUri && cacheEntry.dataUri ? cacheEntry.dataUri : cacheEntry.screenshotUrl,
            dataUri: cacheEntry.dataUri || null,
            analysis: cacheEntry.analysis || null,
            text: cacheEntry.text || '',
            originalUrl: cacheEntry.screenshotUrl
        };
        return responsePayload;
    }

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt++) {
        const attemptLogger = captureLogger.child({ attempt, maxAttempts: MAX_CAPTURE_ATTEMPTS });
        let context;
        const attemptStart = performance.now();

        try {
            attemptLogger.info({ event: 'capture.attempt' }, 'Attempting screenshot capture');

            const browserInstance = await initBrowser();
            context = await browserInstance.newContext({
                viewport: { width: 800, height: 600 },
                deviceScaleFactor: 1,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            });

            const page = await context.newPage();

            await page.route('**/*', (route) => {
                const request = route.request();
                const resourceType = request.resourceType();
                const requestUrl = request.url();

                if (resourceType === 'image' || /\.(png|jpg|jpeg|webp|gif|svg|ico)(\?.*)?$/i.test(requestUrl)) {
                    return route.abort();
                }

                if (resourceType === 'font' || /\.(woff|woff2|ttf|otf|eot)(\?.*)?$/i.test(requestUrl)) {
                    return route.abort();
                }

                if (resourceType === 'media' || /\.(mp4|webm|ogg|mp3|wav)(\?.*)?$/i.test(requestUrl)) {
                    return route.abort();
                }

                if (/analytics\.js|gtm\.js|ga\.js|facebook\.net|doubleclick\.net|googletagmanager\.com/i.test(requestUrl)) {
                    return route.abort();
                }

                route.continue();
            });

            page.setDefaultTimeout(25000);

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 25000
            });

            await page.waitForTimeout(1000);

            const screenshot = await page.screenshot({
                fullPage: false,
                type: 'png',
                clip: {
                    x: 0,
                    y: 0,
                    width: 800,
                    height: 600
                }
            });

            const token = await saveScreenshotToDisk(screenshot, url);
            const diskScreenshotUrl = token ? getScreenshotUrl(token) : null;
            const extractedText = await extractTextFromScreenshot(screenshot);
            const analysis = analyzePageContent(extractedText, url);

            const base64Screenshot = screenshot.toString('base64');
            const dataUri = `data:image/png;base64,${base64Screenshot}`;

            let screenshotUrl;

            if (diskScreenshotUrl) {
                screenshotUrl = diskScreenshotUrl;
            } else {
                screenshotUrl = dataUri;
                attemptLogger.warn({ event: 'capture.fallback_base64' }, 'Using base64 encoding because disk storage is unavailable');
            }

            const newCacheEntry = {
                screenshotUrl: screenshotUrl,
                dataUri: dataUri,
                originalUrl: diskScreenshotUrl || screenshotUrl,
                token: token,
                timestamp: Date.now(),
                text: extractedText,
                analysis: analysis
            };

            screenshotCache.set(url, newCacheEntry);
            pageAnalysisCache.set(url, analysis);

            recordCircuitSuccess(hostname);
            blockedSites.delete(hostname);

            const attemptDuration = performance.now() - attemptStart;
            const totalDuration = performance.now() - requestStarted;

            captureMetrics.successfulRequests += 1;
            if (captureMetrics.successfulRequests === 1) {
                captureMetrics.averageDurationMs = attemptDuration;
            } else {
                captureMetrics.averageDurationMs = (
                    (captureMetrics.averageDurationMs * (captureMetrics.successfulRequests - 1)) + attemptDuration
                ) / captureMetrics.successfulRequests;
            }

            attemptLogger.info({
                event: 'capture.success',
                durationMs: Math.round(attemptDuration),
                totalDurationMs: Math.round(totalDuration),
                token,
                usedBase64: !token,
                includeDataUri,
                analysis
            }, 'Screenshot captured successfully');

            const finalResponseUrl = includeDataUri ? dataUri : screenshotUrl;
            const responsePayload = {
                screenshotUrl: finalResponseUrl,
                dataUri: dataUri,
                analysis,
                text: extractedText,
                originalUrl: diskScreenshotUrl || screenshotUrl
            };

            return responsePayload;
        } catch (error) {
            lastError = error;
            const retryable = isRetryableError(error);

            if (error.message?.includes('Navigation') || error.message?.includes('timeout')) {
                error.isTimeout = true;
            }

            if (error.message?.includes('403') ||
                error.message?.includes('404') ||
                error.message?.includes('500') ||
                error.message?.includes('Internal Server Error') ||
                error.message?.includes('net::ERR_BLOCKED_BY_CLIENT')) {
                error.isBlocked = true;
            }

            recordCircuitFailure(hostname, {
                forceOpen: !retryable || error.isBlocked,
                cooldownMs: error.isBlocked ? CIRCUIT_BREAKER_BLOCK_MS : undefined
            });

            if (error.isBlocked) {
                blockedSites.add(hostname);
                setTimeout(() => {
                    blockedSites.delete(hostname);
                    logger.info({ event: 'capture.block_reset', host: hostname }, 'Host block reset after cooldown');
                }, BLOCKED_TTL);
            }

            attemptLogger.warn({
                event: 'capture.failure',
                error: error.message,
                retryable,
                isTimeout: !!error.isTimeout,
                isBlocked: !!error.isBlocked
            }, 'Capture attempt failed');

            if (attempt < MAX_CAPTURE_ATTEMPTS && retryable) {
                const delay = CAPTURE_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                attemptLogger.info({
                    event: 'capture.retry',
                    delayMs: delay
                }, 'Retrying capture after delay');
                await sleep(delay);
                continue;
            }

            break;
        } finally {
            if (context) {
                await context.close().catch(closeError => {
                    attemptLogger.warn({
                        event: 'capture.context_close_error',
                        error: closeError.message
                    }, 'Failed to close Playwright context cleanly');
                });
            }
        }
    }

    captureMetrics.failedRequests += 1;
    captureMetrics.lastFailureAt = new Date().toISOString();

    const totalDurationMs = performance.now() - requestStarted;
    const circuitState = getCircuit(hostname);
    const retryAfterSeconds = circuitState?.nextAttemptAt ? Math.ceil((circuitState.nextAttemptAt - Date.now()) / 1000) : undefined;

    captureLogger.error({
        event: 'capture.give_up',
        totalAttempts: MAX_CAPTURE_ATTEMPTS,
        durationMs: Math.round(totalDurationMs),
        retryAfterSeconds,
        error: lastError ? lastError.message : 'Unknown error'
    }, 'Failed to capture screenshot after retries');

    if (lastError) {
        if (retryAfterSeconds) {
            lastError.retryAfter = `${retryAfterSeconds}s`;
        }
        throw lastError;
    }

    throw new Error('Failed to capture screenshot');
}

// Routes
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'Playwright Tooltip Backend',
        version: '1.0.0',
        endpoint: 'POST /capture',
        usage: {
            method: 'POST',
            path: '/capture',
            body: { url: 'https://example.com' }
        }
    });
});

// Serve screenshot files by token
app.get('/screenshot/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Look up token
        const tokenData = screenshotTokens.get(token);
        if (!tokenData) {
            logger.warn({ event: 'screenshot.token_missing', token }, 'Screenshot token not found');
            return res.status(404).json({
                error: 'Screenshot not found',
                message: 'Screenshot token is invalid or has expired'
            });
        }
        
        // Check if file exists
        try {
            const filepath = tokenData.filepath;
            
            // Try to stat the file
            let fileStats;
            try {
                fileStats = await fs.stat(filepath);
            } catch (statError) {
                // File doesn't exist - clean up and return 404
                logger.warn({ event: 'screenshot.file_missing', filepath, token }, 'Screenshot file missing');
                screenshotTokens.delete(token);
                return res.status(404).json({
                    error: 'Screenshot file not found',
                    message: 'The screenshot file is missing'
                });
            }
            
            // Check if file is too old (expired)
            const age = Date.now() - fileStats.mtimeMs;
            if (age > CACHE_TTL) {
                // Clean up expired file
                logger.info({ event: 'screenshot.expired', token }, 'Cleaning up expired screenshot file');
                await fs.unlink(filepath).catch(() => {});
                screenshotTokens.delete(token);
                return res.status(404).json({
                    error: 'Screenshot expired',
                    message: 'Screenshot has expired and been removed'
                });
            }
            
            // Read and send file
            try {
                const fileContent = await fs.readFile(filepath);
                
                // Set appropriate headers
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
                res.setHeader('Expires', new Date(Date.now() + CACHE_TTL).toUTCString());
                
                // Send file
                res.send(fileContent);
                logger.debug({ event: 'screenshot.served', token, bytes: fileContent.length }, 'Served screenshot file');
                
            } catch (readError) {
                logger.error({ event: 'screenshot.read_error', filepath, token, error: readError.message }, 'Error reading screenshot file');
                screenshotTokens.delete(token);
                return res.status(500).json({
                    error: 'Failed to read screenshot file',
                    message: 'The screenshot file could not be read'
                });
            }
            
        } catch (error) {
            logger.error({ event: 'screenshot.serve_error', token, error: error.message }, 'Error serving screenshot token');
            screenshotTokens.delete(token);
            return res.status(404).json({
                error: 'Screenshot file not found',
                message: 'The screenshot file is missing'
            });
        }
        
    } catch (error) {
        logger.error({ event: 'screenshot.route_error', error: error.message }, 'Screenshot route error');
        res.status(500).json({
            error: 'Failed to serve screenshot',
            message: error.message
        });
    }
});

app.post('/capture', async (req, res) => {
    try {
        const { url } = req.body;
        const preferDataUri = !!(req.body?.preferDataUri || req.body?.includeDataUri || req.body?.format === 'data-uri');
        
        if (!url) {
            return res.status(400).json({
                error: 'Missing url parameter',
                message: 'Please provide a url in the request body: { "url": "https://example.com" }'
            });
        }
        
        // Validate URL
        try {
            new URL(url);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid URL',
                message: 'Please provide a valid URL'
            });
        }
        
        // Capture screenshot (optionally include data URI)
        const captureResult = await captureScreenshot(url, { includeDataUri: preferDataUri });
        
        res.json({
            screenshot: preferDataUri ? (captureResult.dataUri || captureResult.screenshotUrl) : captureResult.screenshotUrl,
            screenshotUrl: captureResult.screenshotUrl,
            screenshotDataUri: captureResult.dataUri || null,
            originalScreenshotUrl: captureResult.originalUrl || captureResult.screenshotUrl,
            analysis: captureResult.analysis || null,
            text: captureResult.text || ''
        });
        
    } catch (error) {
        logger.error({ event: 'route.capture_error', error: error.message, url }, 'Capture endpoint error');
        
        // Return appropriate HTTP status codes
        let statusCode = 500;
        let errorMessage = error.message;
        
        if (error.isTimeout) {
            statusCode = 504; // Gateway Timeout - more appropriate for timeout errors
            errorMessage = `Page load timeout: The requested page took too long to load. This may happen with slow sites, sites that block automated access, or pages requiring authentication.`;
        } else if (error.message.includes('403') || error.message.includes('blocked')) {
            statusCode = 403; // Forbidden
            errorMessage = `Access denied: This site blocks automated access. Try accessing the page manually first.`;
        } else if (error.message.includes('404')) {
            statusCode = 404; // Not Found
            errorMessage = `Page not found: The requested URL does not exist or is no longer available.`;
        } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
            statusCode = 404;
            errorMessage = `Domain not found: The requested domain name could not be resolved.`;
        }
        
        res.status(statusCode).json({
            error: error.isTimeout ? 'Page load timeout' : 'Failed to capture screenshot',
            message: errorMessage,
            url: url,
            retryAfter: error.isTimeout ? '30s' : undefined
        });
    }
});

// Get page analysis endpoint (maintained for backward compatibility)
app.get('/analyze/:url', async (req, res) => {
    try {
        const url = decodeURIComponent(req.params.url);
        
        // Check cache first
        const analysis = pageAnalysisCache.get(url);
        if (analysis) {
            return res.json({
                url: url,
                analysis: analysis,
                cached: true
            });
        }
        
        // If not cached, return not found
        res.status(404).json({
            error: 'Analysis not found',
            message: 'Page analysis not available. Take a screenshot first.'
        });
        
    } catch (error) {
        logger.error({ event: 'route.analyze_error', error: error.message, url: req.params.url }, 'Analyze endpoint error');
        res.status(500).json({
            error: 'Failed to get analysis',
            message: error.message
        });
    }
});

// Consolidated context endpoint - returns screenshot AND analysis in one call
// This eliminates the need for separate /capture and /analyze requests
app.post('/context', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                error: 'Missing url parameter',
                message: 'Please provide a url in the request body: { "url": "https://example.com" }'
            });
        }
        
        // Validate URL
        try {
            new URL(url);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid URL',
                message: 'Please provide a valid URL'
            });
        }
        
        const preferDataUri = !!(req.body?.preferDataUri || req.body?.includeDataUri || req.body?.format === 'data-uri');
        logger.info({ event: 'context.capture_start', url, preferDataUri }, 'Context request started');
        
        // Check cache first - if we have both screenshot and analysis, return immediately
        const cacheEntry = screenshotCache.get(url);
        const analysis = pageAnalysisCache.get(url);
        
        if (cacheEntry && isCacheValid(cacheEntry.timestamp) && analysis) {
            logger.debug({ event: 'context.cache_hit', url }, 'Returning cached context');
            const screenshotCandidate = preferDataUri && cacheEntry.dataUri ? cacheEntry.dataUri : cacheEntry.screenshotUrl;
            return res.json({
                url: url,
                screenshot: screenshotCandidate,
                screenshotUrl: screenshotCandidate,
                originalScreenshotUrl: cacheEntry.screenshotUrl || null,
                screenshotDataUri: cacheEntry.dataUri || null,
                analysis: analysis,
                text: cacheEntry.text || '',
                cached: true,
                timestamp: new Date().toISOString()
            });
        }
        
        // Capture screenshot (this also generates analysis internally)
        const captureResult = await captureScreenshot(url, { includeDataUri: preferDataUri });
        
        // Get the fresh analysis from cache (captureScreenshot updates both caches)
        const freshAnalysis = pageAnalysisCache.get(url);
        const freshCacheEntry = screenshotCache.get(url);
        
        logger.info({
            event: 'context.capture_success',
            url,
            pageType: freshAnalysis?.pageType || 'unknown'
        }, 'Context capture successful');
        
        // Send response with both screenshot URL and analysis
        res.json({
            url: url,
            screenshot: preferDataUri ? (captureResult.dataUri || captureResult.screenshotUrl) : captureResult.screenshotUrl,
            screenshotUrl: preferDataUri ? (captureResult.dataUri || captureResult.screenshotUrl) : captureResult.screenshotUrl,
            originalScreenshotUrl: captureResult.originalUrl || captureResult.screenshotUrl,
            screenshotDataUri: captureResult.dataUri || null,
            analysis: freshAnalysis || {
                pageType: 'unknown',
                keyTopics: [],
                suggestedActions: [],
                confidence: 0
            },
            text: freshCacheEntry?.text || captureResult.text || '',
            cached: false,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error({ event: 'context.capture_error', url, error: error.message }, 'Context endpoint error');
        
        // Return appropriate HTTP status codes
        let statusCode = 500;
        let errorMessage = error.message;
        
        if (error.isTimeout) {
            statusCode = 504;
            errorMessage = `Page load timeout: The requested page took too long to load. This may happen with slow sites, sites that block automated access, or pages requiring authentication.`;
        } else if (error.message.includes('403') || error.message.includes('blocked')) {
            statusCode = 403;
            errorMessage = `Access denied: This site blocks automated access. Try accessing the page manually first.`;
        } else if (error.message.includes('404')) {
            statusCode = 404;
            errorMessage = `Page not found: The requested URL does not exist or is no longer available.`;
        } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
            statusCode = 404;
            errorMessage = `Domain not found: The requested domain name could not be resolved.`;
        }
        
        res.status(statusCode).json({
            error: error.isTimeout ? 'Page load timeout' : 'Failed to capture context',
            message: errorMessage,
            url: url,
            retryAfter: error.isTimeout ? '30s' : undefined
        });
    }
});

// Chat endpoint (REST - maintained for backward compatibility)
app.post('/chat', async (req, res) => {
    const requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex');
    const chatLogger = logger.child({ scope: 'chat', requestId });
    chatLogger.info({ event: 'chat.request_received' }, 'Chat endpoint called');
    try {
        chatLogger.debug({ event: 'chat.payload', headers: req.headers, method: req.method }, 'Chat request metadata received');
        
        const { message, originalMessage, currentUrl, url, openaiKey, tooltipHistory, tooltipContexts, pageInfo, consoleLogs } = req.body;
        const actualUrl = currentUrl || url;
        
        // Use enhanced message if provided, otherwise fall back to original
        const messageToUse = message || originalMessage;
        
        chatLogger.debug({ 
            event: 'chat.url_parsed', 
            currentUrl, 
            url, 
            actualUrl,
            hasEnhancedMessage: !!message,
            hasOriginalMessage: !!originalMessage,
            tooltipContextsCount: tooltipContexts?.length || 0,
            tooltipHistoryCount: tooltipHistory?.length || 0
        }, 'Parsed chat URL fields and context');
        
        if (!messageToUse) {
            chatLogger.warn({ event: 'chat.validation_error' }, 'Missing message parameter');
            return res.status(400).json({
                error: 'Missing message parameter',
                message: 'Please provide a message in the request body: { "message": "Hello" }'
            });
        }
        
        chatLogger.info({
            event: 'chat.request_details',
            hasUserKey: !!openaiKey,
            hasBackendKey: !!process.env.OPENAI_API_KEY,
            url: actualUrl || 'none',
            tooltipContextsCount: tooltipContexts?.length || 0,
            tooltipHistoryCount: tooltipHistory?.length || 0
        }, 'Chat message received with tooltip context');
        
        // Log tooltip context details for debugging
        if (tooltipContexts && tooltipContexts.length > 0) {
            chatLogger.debug({
                event: 'chat.tooltip_context_details',
                contexts: tooltipContexts.map(ctx => ({
                    url: ctx.url,
                    hasOCR: !!ctx.ocrText,
                    ocrLength: ctx.ocrText?.length || 0,
                    hasAnalysis: !!ctx.analysis,
                    pageType: ctx.analysis?.pageType || 'unknown'
                }))
            }, 'Tooltip context details');
        }
        
        // Use shared chat processing function
        const result = await processChatRequest(messageToUse, currentUrl, url, openaiKey, tooltipHistory, tooltipContexts, pageInfo, consoleLogs, chatLogger);
        
        res.json(result);
        
        chatLogger.info({
            event: 'chat.response_sent',
            hasContext: !!result.context,
            timestamp: result.timestamp
        }, 'Chat response sent');
        
    } catch (error) {
        chatLogger.error({ event: 'chat.error', error: error.message }, 'Chat endpoint error');
        res.status(500).json({
            error: 'Failed to process chat message',
            message: error.message
        });
    }
});

  // OCR Upload endpoint
  app.post("/ocr-upload", async (req, res) => {
      const ocrLogger = logger.child({ scope: 'ocr.upload' });
      ocrLogger.info({ event: 'ocr.upload_received' }, 'OCR upload endpoint called');
      try {
          const { image } = req.body;
          if (!image) {
              return res.status(400).json({ 
                  error: "Image data is required",
                  message: "Please provide an image in base64 format: { \"image\": \"data:image/png;base64,...\" }"
              });
          }
          
          ocrLogger.debug({ event: 'ocr.upload_processing' }, 'Processing OCR on uploaded image');
          
          // Extract base64 data from data URL if present
          let base64Data = image;
          if (image.startsWith('data:image/')) {
              const commaIndex = image.indexOf(',');
              base64Data = image.substring(commaIndex + 1);
          }
          
          // Convert base64 to buffer
          const imageBuffer = Buffer.from(base64Data, 'base64');
          
          // Extract text using OCR
          const extractedText = await extractTextFromScreenshot(imageBuffer);
          
          ocrLogger.info({ event: 'ocr.upload_success', characterCount: extractedText.length }, 'OCR upload completed');
          
          res.json({ 
              text: extractedText,
              success: true,
              characterCount: extractedText.length
          });
      } catch (error) {
          ocrLogger.error({ event: 'ocr.upload_error', error: error.message }, 'OCR upload error');
          res.status(500).json({ 
              error: "OCR processing failed",
              message: error.message
          });
      }
  });

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        browser: browser ? 'initialized' : 'not initialized',
        cache: {
            screenshots: screenshotCache.size,
            analysis: pageAnalysisCache.size
        },
        features: {
            ocr: true,
            analysis: true,
            chat: true
        },
        config: {
            openaiKeyConfigured: !!(process.env.OPENAI_API_KEY),
            openaiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
            openaiKeyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 7) + '...' : 'not set'
        },
        metrics: {
            capture: {
                totalRequests: captureMetrics.totalRequests,
                successfulRequests: captureMetrics.successfulRequests,
                failedRequests: captureMetrics.failedRequests,
                averageDurationMs: Math.round(captureMetrics.averageDurationMs),
                lastFailureAt: captureMetrics.lastFailureAt
            }
        },
        resilience: {
            maxCaptureAttempts: MAX_CAPTURE_ATTEMPTS,
            captureBaseDelayMs: CAPTURE_BASE_DELAY_MS,
            circuitBreakerThreshold: CIRCUIT_BREAKER_THRESHOLD,
            circuitBreakerCooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
            openCircuits: getCircuitSnapshot()
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error({ event: 'server.error', error: err.message, stack: err.stack }, 'Unhandled server error');
    
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Payload too large',
            message: 'Request payload exceeds the maximum allowed size. Try reducing image quality.',
            timestamp: new Date().toISOString()
        });
    }
    
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// Extract chat logic into reusable function
async function processChatRequest(message, currentUrl, url, openaiKey, tooltipHistory, tooltipContexts, pageInfo, consoleLogs, requestLogger = logger) {
    const chatLogger = requestLogger?.child ? requestLogger.child({ event_scope: 'chat.processor' }) : logger.child({ event_scope: 'chat.processor' });
    const actualUrl = currentUrl || url;
    
    // Build comprehensive context from tooltip contexts
    let tooltipContextInfo = '';
    if (tooltipContexts && Array.isArray(tooltipContexts) && tooltipContexts.length > 0) {
        chatLogger.debug({ event: 'chat.tooltip_context_processing', count: tooltipContexts.length }, 'Processing tooltip contexts');
        
        tooltipContextInfo = '\n\n**=== TOOLTIP PREVIEW DATA (Use this to answer questions) ===**\n';
        tooltipContexts.forEach((context, index) => {
            if (context && context.url) {
                tooltipContextInfo += `\n**Page ${index + 1}: ${context.url}**\n`;
                
                if (context.analysis) {
                    const analysis = context.analysis;
                    tooltipContextInfo += `Page Type: ${analysis.pageType || 'unknown'}`;
                    if (analysis.confidence) {
                        tooltipContextInfo += ` (${Math.round(analysis.confidence * 100)}% confidence)`;
                    }
                    tooltipContextInfo += '\n';
                    
                    if (analysis.keyTopics && analysis.keyTopics.length > 0) {
                        tooltipContextInfo += `Key Topics: ${analysis.keyTopics.join(', ')}\n`;
                    }
                    
                    if (analysis.suggestedActions && analysis.suggestedActions.length > 0) {
                        tooltipContextInfo += `**Available Actions:** ${analysis.suggestedActions.join('; ')}\n`;
                    }
                }
                
                if (context.ocrText && context.ocrText.trim().length > 0) {
                    const ocrPreview = context.ocrText.length > 800 
                        ? context.ocrText.substring(0, 800) + '...' 
                        : context.ocrText;
                    tooltipContextInfo += `**Page Content (OCR):** ${ocrPreview}\n`;
                }
                
                if (context.elementText) {
                    tooltipContextInfo += `Element Text: ${context.elementText}\n`;
                }
            }
        });
        tooltipContextInfo += '\n**=== END TOOLTIP DATA ===**\n';
    }
    
    // Get context from current page if available
    let currentPageContext = '';
    if (actualUrl) {
        const analysis = pageAnalysisCache.get(actualUrl);
        if (analysis) {
            currentPageContext = `\n\n**Current Page Context:**\n- Page type: ${analysis.pageType}\n- Key topics: ${analysis.keyTopics.join(', ') || 'none'}\n- Suggestions: ${analysis.suggestedActions.join('; ') || 'none'}`;
        }
    }
    
    // Use OpenAI key from request if provided, otherwise use backend's default key
    const apiKeyToUse = (openaiKey && openaiKey.trim()) ? openaiKey.trim() : (process.env.OPENAI_API_KEY || '');
    
    chatLogger.debug({
        event: 'chat.api_key_check',
        userProvided: !!(openaiKey && openaiKey.trim()),
        backendKey: !!(process.env.OPENAI_API_KEY),
        keyPreview: apiKeyToUse ? `${apiKeyToUse.substring(0, 10)}...` : 'NONE'
    }, 'Evaluated API key sources');
    
    // Check if we have an OpenAI key to use
    if (apiKeyToUse) {
        chatLogger.info({ event: 'chat.openai_call' }, 'Calling OpenAI API for chat response');
        try {
            // Prepare messages for OpenAI
            const systemPrompt = `You are a tech support and browsing assistant for the Tooltip Companion browser extension. Your PRIMARY role is to help users accomplish tasks on websites by providing clear, step-by-step instructions.

**CORE PURPOSE:**
You are a page-aware assistant. You understand what pages contain, what actions are available, and can guide users through completing tasks step-by-step.

**YOUR CAPABILITIES:**
1. **Task Guidance**: Provide numbered, step-by-step instructions for tasks (opening accounts, checkout, applications, etc.)
2. **Page Awareness**: Understand what page the user is viewing from tooltip previews
3. **Content Understanding**: Use OCR text to understand actual page content
4. **Action Detection**: Identify available actions and buttons from page content

**TOOLTIP PREVIEW DATA AVAILABLE:**
- OCR text from page screenshots (actual visible content)
- Page type analysis (banking, ecommerce, login, etc.)
- Key topics, suggested actions, rates, bonuses, requirements

**HOW TO RESPOND:**
1. **For "how do I" questions**: Provide clear, numbered step-by-step instructions based on page content
2. **For "what can I do" questions**: List specific available actions with clear descriptions
3. **For task questions**: Infer steps from OCR content and page analysis
4. **Always be specific**: Reference actual button labels, form fields, and actions from OCR text
5. **Be actionable**: Tell users exactly what to click, fill, enter, or do next
6. **Reference tooltip data**: Use the OCR content to understand what's actually on the page

**EXAMPLES:**
- "How do I open an account?" → "1. Click the 'Open online' or 'Get started' button. 2. Fill in your personal information... 3. Make qualifying direct deposits..."
- "What does this button do?" → Explain based on page context and surrounding OCR text
- "How do I checkout?" → "1. Review items in cart. 2. Click 'Proceed to checkout'. 3. Enter shipping info..."

${tooltipContextInfo ? `\n**=== TOOLTIP PREVIEW DATA (Use this to answer questions) ===**\n${tooltipContextInfo}\n` : ''}${currentPageContext ? `\n**Current Page Context:**\n${currentPageContext}\n` : ''}

Remember: You are a WORKFLOW ASSISTANT. Help users accomplish tasks by providing clear, actionable, step-by-step instructions based on actual page content from tooltip previews.`;

            const messages = [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: message
                }
            ];
            
            // Call OpenAI API
            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKeyToUse}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    max_tokens: 800, // Increased for more detailed responses
                    temperature: 0.7
                })
            });
            
            if (!openaiResponse.ok) {
                const errorData = await openaiResponse.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `OpenAI API error: ${openaiResponse.status}`);
            }
            
            const openaiData = await openaiResponse.json();
            const aiResponse = openaiData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
            
            return {
                response: aiResponse,
                timestamp: new Date().toISOString(),
                context: actualUrl ? pageAnalysisCache.get(actualUrl) : null,
                source: 'openai'
            };
        } catch (error) {
            chatLogger.error({
                event: 'chat.openai_error',
                message: error.message,
                status: error.status
            }, 'OpenAI API error');
            // Fall through to basic response
        }
    } else {
        chatLogger.warn({ event: 'chat.fallback_no_key' }, 'No OpenAI key available, using fallback response');
    }
    
    // Generate a basic helpful response (fallback)
    let response;
    const lowerMessage = message.toLowerCase();
    
    // Check if we have tooltip context to work with
    const hasTooltipContext = tooltipContexts && tooltipContexts.length > 0;
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
        if (hasTooltipContext) {
            const latest = tooltipContexts[tooltipContexts.length - 1];
            response = `Hello! 👋 I can see you've been viewing pages. Based on your recent tooltip previews, I can tell you about:\n\n`;
            if (latest.analysis) {
                response += `• Page types and content analysis\n`;
                if (latest.analysis.suggestedActions && latest.analysis.suggestedActions.length > 0) {
                    response += `• Available actions on pages\n`;
                }
            }
            response += `• OCR text from page screenshots\n`;
            response += `• Specific details like rates, bonuses, and requirements\n\n`;
            response += `Try asking: "what can I do on this page" or "tell me about these offers"`;
        } else {
            response = `Hello! 👋 I'm your Smart Tooltip Companion. I can analyze web pages using OCR and provide intelligent insights about what you're viewing.`;
        }
    } else if (lowerMessage.includes('what can i do') || lowerMessage.includes('what can you tell me') || lowerMessage.includes('what can you')) {
        if (hasTooltipContext) {
            response = `Based on the tooltip previews you've viewed, here's what you can do:\n\n`;
            tooltipContexts.forEach((ctx, idx) => {
                if (ctx.analysis && ctx.analysis.suggestedActions && ctx.analysis.suggestedActions.length > 0) {
                    response += `**${ctx.url}**\n`;
                    ctx.analysis.suggestedActions.forEach(action => {
                        response += `• ${action}\n`;
                    });
                    response += '\n';
                }
            });
            if (tooltipContexts.some(ctx => ctx.ocrText)) {
                response += `\nI can also explain:\n• What the pages contain (from OCR text)\n• Specific offers, rates, or requirements\n• Page types and purposes\n`;
            }
        } else {
            response = `Hover over links to see tooltip previews, then I can tell you what you can do on those pages based on the content.`;
        }
    } else if (lowerMessage.includes('tell me about') || lowerMessage.includes('what are these') || lowerMessage.includes('about these offers')) {
        if (hasTooltipContext) {
            response = `Based on your tooltip previews, here's what I found:\n\n`;
            tooltipContexts.forEach((ctx, idx) => {
                response += `**Page ${idx + 1}: ${ctx.url}**\n`;
                if (ctx.analysis) {
                    response += `Type: ${ctx.analysis.pageType || 'unknown'}\n`;
                    if (ctx.analysis.keyTopics && ctx.analysis.keyTopics.length > 0) {
                        response += `Topics: ${ctx.analysis.keyTopics.join(', ')}\n`;
                    }
                }
                if (ctx.ocrText) {
                    const preview = ctx.ocrText.substring(0, 300);
                    response += `Content: ${preview}${ctx.ocrText.length > 300 ? '...' : ''}\n`;
                }
                response += '\n';
            });
        } else {
            response = `Hover over links to see tooltip previews, then I can tell you about the pages and offers.`;
        }
    } else if (lowerMessage.includes('button') && (lowerMessage.includes('do') || lowerMessage.includes('what'))) {
        if (hasTooltipContext) {
            const latest = tooltipContexts[tooltipContexts.length - 1];
            if (latest.analysis && latest.analysis.suggestedActions && latest.analysis.suggestedActions.length > 0) {
                response = `Based on the page preview, the buttons/links allow you to:\n\n`;
                latest.analysis.suggestedActions.forEach(action => {
                    response += `• ${action}\n`;
                });
            } else if (latest.ocrText) {
                const preview = latest.ocrText.substring(0, 200);
                response = `Based on the page content, this page appears to be about:\n\n${preview}...\n\n`;
                response += `To see specific actions, I'd need more detailed analysis.`;
            } else {
                response = `I can see you viewed a page, but I need more context. Try asking "what can I do on this page".`;
            }
        } else {
            response = `Hover over the button/link to see a tooltip preview, then I can tell you what it does based on the page content.`;
        }
    } else if (lowerMessage.includes('analyze') || lowerMessage.includes('what is this page')) {
        if (actualUrl && pageAnalysisCache.has(actualUrl)) {
            const analysis = pageAnalysisCache.get(actualUrl);
            response = `📊 Page Analysis for ${actualUrl}:\n• Type: ${analysis.pageType}\n• Confidence: ${Math.round(analysis.confidence * 100)}%\n• Key Topics: ${analysis.keyTopics.join(', ') || 'none'}\n• Suggestions: ${analysis.suggestedActions.join('; ') || 'none'}`;
        } else if (hasTooltipContext) {
            const latest = tooltipContexts[tooltipContexts.length - 1];
            response = `📊 Analysis of latest page:\n`;
            if (latest.analysis) {
                response += `• Type: ${latest.analysis.pageType || 'unknown'}\n`;
                response += `• Key Topics: ${latest.analysis.keyTopics?.join(', ') || 'none'}\n`;
                response += `• Suggested Actions: ${latest.analysis.suggestedActions?.join('; ') || 'none'}\n`;
            }
            if (latest.ocrText) {
                const preview = latest.ocrText.substring(0, 150);
                response += `\nContent preview: ${preview}...`;
            }
        } else {
            response = `I can analyze pages! Hover over a link to capture a screenshot, then ask me to analyze it.`;
        }
    } else if (lowerMessage.includes('tooltip') || lowerMessage.includes('screenshot')) {
        const contextNote = tooltipContextInfo || currentPageContext ? '\n\n' + (tooltipContextInfo || '') + (currentPageContext || '') : '';
        response = `The smart tooltip system now includes:\n• OCR text extraction from screenshots\n• Intelligent page type detection\n• Proactive suggestions based on content\n• Context-aware chat responses${contextNote}`;
    } else if (lowerMessage.includes('help')) {
        const contextNote = tooltipContextInfo || currentPageContext ? '\n\n' + (tooltipContextInfo || '') + (currentPageContext || '') : '';
        response = `I can help you with:\n• 🔍 Page analysis (OCR + AI insights)\n• 📸 Smart tooltips with context\n• 🧠 Proactive suggestions\n• 💬 Context-aware chat\n\nTry: "analyze this page" or "what type of page is this?"${contextNote}`;
    } else {
        // More helpful fallback message that uses tooltip context if available
        if (hasTooltipContext) {
            const latest = tooltipContexts[tooltipContexts.length - 1];
            response = `I see you asked: "${message}". Based on your recent tooltip previews:\n\n`;
            if (latest.analysis) {
                response += `The latest page you viewed is a ${latest.analysis.pageType || 'page'}`;
                if (latest.analysis.keyTopics && latest.analysis.keyTopics.length > 0) {
                    response += ` about ${latest.analysis.keyTopics.slice(0, 2).join(' and ')}`;
                }
                response += '.\n\n';
            }
            if (latest.ocrText) {
                const preview = latest.ocrText.substring(0, 200);
                response += `Page content: ${preview}...\n\n`;
            }
            response += `For more specific answers, try:\n• "what can I do on this page"\n• "tell me about these offers"\n• "what does this button do"`;
        } else {
            const contextNote = tooltipContextInfo || currentPageContext ? '\n\n' + (tooltipContextInfo || '') + (currentPageContext || '') : '';
            response = `I received your message: "${message}". I'm equipped with OCR and smart analysis! Ask me to analyze pages or explain what I can see.${contextNote}\n\nNote: For enhanced AI responses, ensure the backend has an OpenAI API key configured.`;
        }
    }
    
    return {
        response,
        timestamp: new Date().toISOString(),
        context: actualUrl ? pageAnalysisCache.get(actualUrl) : null
    };
}

// Initialize MCP Server
const mcpServer = new MCPServer(
    // captureHandler
    async (url, options = {}) => {
        return await captureScreenshot(url, options);
    },
    // chatHandler
    async ({ message, currentUrl, openaiKey, tooltipHistory, tooltipContexts }) => {
        return await processChatRequest(
            message,
            currentUrl,
            currentUrl, // url param
            openaiKey,
            tooltipHistory,
            tooltipContexts, // Pass tooltip contexts
            null, // pageInfo
            null,  // consoleLogs
            logger.child({ scope: 'chat.mcp' })
        );
    },
    // ocrHandler
    async (image) => {
        const imageBuffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const text = await extractTextFromScreenshot(imageBuffer);
        return {
            text,
            characterCount: text.length,
            success: true
        };
    },
    // analysisHandler
    async (url) => {
        const analysis = pageAnalysisCache.get(url);
        if (!analysis) {
            return {
                error: 'Analysis not found',
                message: 'Page analysis not available. Take a screenshot first.'
            };
        }
        return {
            url,
            analysis,
            cached: true
        };
    }
);

// MCP endpoint - JSON-RPC 2.0 over HTTP POST
app.post('/mcp', async (req, res) => {
    const mcpLogger = logger.child({ scope: 'mcp' });
    try {
        const request = req.body;
        
        mcpLogger.debug({
            event: 'mcp.request_received',
            method: request.method,
            id: request.id,
            hasParams: !!request.params,
            jsonrpc: request.jsonrpc
        }, 'MCP endpoint called');
        
        // Validate JSON-RPC 2.0 request
        if (request.jsonrpc !== '2.0') {
            mcpLogger.error({ event: 'mcp.invalid_version', jsonrpc: request.jsonrpc }, 'Invalid MCP jsonrpc version');
            return res.status(400).json({
                jsonrpc: '2.0',
                id: request.id || null,
                error: {
                    code: -32600,
                    message: 'Invalid Request',
                    data: 'jsonrpc must be "2.0"'
                }
            });
        }
        
        // Handle JSON-RPC 2.0 request
        const response = await mcpServer.handleRequest(request);
        
        mcpLogger.debug({
            event: 'mcp.response_ready',
            hasError: !!response?.error,
            hasResult: !!response?.result,
            isNotification: response === null
        }, 'MCP request handled');
        
        // Notifications don't return responses
        if (response === null) {
            mcpLogger.debug({ event: 'mcp.notification' }, 'MCP notification received (no response)');
            return res.status(204).send(); // No Content
        }
        
        res.json(response);
    } catch (error) {
        mcpLogger.error({
            event: 'mcp.error',
            message: error.message,
            stack: error.stack?.substring(0, 300),
            requestId: req.body?.id
        }, 'MCP endpoint error');
        res.status(500).json({
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
                code: -32603,
                message: 'Internal error',
                data: error.message
            }
        });
    }
});

// 404 handler (must come after all routes)
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString()
    });
});

// Start server
async function start() {
    // Ensure screenshot directory exists
    await ensureScreenshotDir();
    
    await initBrowser();
    
    app.listen(PORT, () => {
        logger.info({
            event: 'server.started',
            port: PORT,
            endpoints: {
                capture: '/capture',
                context: '/context',
                screenshot: '/screenshot/:token',
                mcp: '/mcp',
                health: '/health'
            },
            screenshotDir: SCREENSHOT_DIR
        }, 'Playwright Tooltip Backend Service started');
    });
}

// Start the server
start().catch(error => {
    logger.error({ event: 'server.start_error', error: error.message, stack: error.stack }, 'Failed to start server');
    process.exit(1);
});

