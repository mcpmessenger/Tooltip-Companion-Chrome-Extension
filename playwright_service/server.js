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

// Screenshot storage configuration
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(process.cwd(), 'tmp', 'screenshots');
const SCREENSHOT_URL_BASE = process.env.SCREENSHOT_URL_BASE || ''; // Base URL for screenshots (set to backend URL in production)

// Ensure screenshot directory exists (non-blocking - won't crash server if it fails)
async function ensureScreenshotDir() {
    try {
        await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
        console.log(`[OK] Screenshot directory ready: ${SCREENSHOT_DIR}`);
        return true;
    } catch (error) {
        // Log warning but don't crash - fall back to base64 if needed
        console.warn(`[WARN] Failed to create screenshot directory: ${error.message}`);
        console.warn(`[WARN] Screenshots will use base64 encoding instead of file storage`);
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
        
        console.log(`💾 Screenshot saved to disk: ${filename}`);
        return token;
    } catch (error) {
        // Don't crash - fall back to base64 encoding
        console.warn(`⚠️ Failed to save screenshot to disk: ${error.message}`);
        console.warn(`⚠️ Falling back to base64 encoding for this screenshot`);
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
            console.log(`🧹 Cleaned up ${cleaned} old screenshot files`);
        }
    } catch (error) {
        console.warn(`⚠️ Screenshot cleanup error:`, error.message);
    }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldScreenshots, 10 * 60 * 1000);

// Initialize browser
async function initBrowser() {
    if (!browser) {
        console.log('[INFO] Initializing Playwright browser...');
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('[OK] Browser initialized');
    }
    return browser;
}

// Clean up browser on exit
process.on('SIGINT', async () => {
    console.log('\n[WARN] Shutting down...');
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
        console.log('🔍 Extracting text from screenshot...');
        const { data: { text } } = await Tesseract.recognize(screenshotBuffer, 'eng', {
            logger: m => console.log(`OCR: ${m.status} - ${m.progress * 100}%`)
        });
        return text.trim();
    } catch (error) {
        console.warn('OCR failed:', error.message);
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
async function captureScreenshot(url) {
    try {
        // Check if site is blocked
        const hostname = new URL(url).hostname;
        if (blockedSites.has(hostname)) {
            throw new Error(`Site ${hostname} is currently blocked (bot detection). Will retry in 1 hour.`);
        }
        
        // Check cache
        const cacheEntry = screenshotCache.get(url);
        if (cacheEntry && isCacheValid(cacheEntry.timestamp)) {
            console.log(`📦 Cache hit: ${url}`);
            return cacheEntry.screenshotUrl || cacheEntry.screenshot; // Support both old base64 and new URL format
        }

        console.log(`📸 Capturing screenshot: ${url}`);
        
        const browserInstance = await initBrowser();
        const context = await browserInstance.newContext({
            viewport: { width: 800, height: 600 }, // Smaller viewport = faster, smaller images
            deviceScaleFactor: 1, // Reduce quality slightly for speed
            // Add user agent to avoid bot detection
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            // Add extra HTTP headers
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            }
        });
        
        const page = await context.newPage();
        
        // Block unnecessary resources to improve performance and reduce bandwidth
        // This dramatically reduces page load time by skipping images, fonts, media, and tracking scripts
        await page.route('**/*', (route) => {
            const request = route.request();
            const url = request.url();
            const resourceType = request.resourceType();
            
            // Block images
            if (resourceType === 'image' || /\.(png|jpg|jpeg|webp|gif|svg|ico)(\?.*)?$/i.test(url)) {
                return route.abort();
            }
            
            // Block fonts
            if (resourceType === 'font' || /\.(woff|woff2|ttf|otf|eot)(\?.*)?$/i.test(url)) {
                return route.abort();
            }
            
            // Block media
            if (resourceType === 'media' || /\.(mp4|webm|ogg|mp3|wav)(\?.*)?$/i.test(url)) {
                return route.abort();
            }
            
            // Block common tracking and analytics scripts
            if (/analytics\.js|gtm\.js|ga\.js|facebook\.net|doubleclick\.net|googletagmanager\.com/i.test(url)) {
                return route.abort();
            }
            
            // Allow everything else
            route.continue();
        });
        
        // Set default timeout for page operations
        page.setDefaultTimeout(25000); // 25 seconds for page operations
        
        // Navigate to URL with faster loading strategy
        await page.goto(url, { 
            waitUntil: 'domcontentloaded', // Much faster than networkidle
            timeout: 25000 // 25 seconds - balance between speed and reliability
        });
        
        // Wait a bit for content to render (faster than networkidle)
        await page.waitForTimeout(1000); // Wait 1s for dynamic content to render
        
        // Take screenshot with smaller dimensions
        const screenshot = await page.screenshot({
            fullPage: false,
            type: 'png',
            clip: { // Crop to specific area if needed
                x: 0,
                y: 0,
                width: 800,
                height: 600
            }
        });
        
        // Close context
        await context.close();
        
        // Save screenshot to disk and get token (may return null if disk storage fails)
        const token = await saveScreenshotToDisk(screenshot, url);
        
        // Extract text using OCR
        const extractedText = await extractTextFromScreenshot(screenshot);
        
        // Analyze page content
        const analysis = analyzePageContent(extractedText, url);
        
        // Determine screenshot format: URL if disk storage worked, base64 if it failed
        let screenshotUrl;
        let screenshotData;
        
        if (token) {
            // Disk storage succeeded - use URL
            screenshotUrl = getScreenshotUrl(token);
        } else {
            // Disk storage failed - fall back to base64
            const base64Screenshot = screenshot.toString('base64');
            screenshotData = `data:image/png;base64,${base64Screenshot}`;
            screenshotUrl = screenshotData; // Use base64 as URL for backward compatibility
            console.log(`⚠️ Using base64 encoding (disk storage unavailable)`);
        }
        
        // Cache the result with analysis
        const newCacheEntry = {
            screenshotUrl: screenshotUrl,
            screenshot: screenshotData || null, // Include base64 if available
            token: token,
            timestamp: Date.now(),
            text: extractedText,
            analysis: analysis
        };
        
        screenshotCache.set(url, newCacheEntry);
        pageAnalysisCache.set(url, analysis);
        
        console.log(`✅ Screenshot captured: ${url}`);
        if (token) {
            console.log(`📸 Screenshot URL: ${screenshotUrl}`);
        } else {
            console.log(`📸 Screenshot encoded as base64 (${screenshotData.length} chars)`);
        }
        console.log(`📊 Page type: ${analysis.pageType} (confidence: ${Math.round(analysis.confidence * 100)}%)`);
        console.log(`🔍 Key topics: ${analysis.keyTopics.join(', ') || 'none'}`);
        
        return screenshotUrl;
        
        } catch (error) {
            console.error(`❌ Error capturing screenshot for ${url}:`, error.message);
            
            // Create a more specific error with better messaging
            let enhancedError = error;
            const hostname = new URL(url).hostname;
            
            // Check if it's a timeout or navigation error
            if (error.message.includes('Navigation') || 
                error.message.includes('timeout') || 
                error.message.includes('Timeout')) {
                console.warn(`   ⏱️ Page load timeout - this site may be slow, blocking bots, or have strict security`);
                enhancedError = new Error(`Page load timeout: ${hostname} took too long to load. The site may be slow, blocking automated access, or require authentication.`);
                enhancedError.isTimeout = true;
            }
            
            // Check if it's a 403/404/500 server error - mark as blocked
            if (error.message.includes('403') || 
                error.message.includes('404') || 
                error.message.includes('500') || 
                error.message.includes('Internal Server Error') ||
                error.message.includes('net::ERR_BLOCKED_BY_CLIENT')) {
                blockedSites.add(hostname);
                console.warn(`   🚫 Server blocked this request - will skip for 1 hour`);
                enhancedError.isBlocked = true;
                
                // Auto-clear blocked sites after 1 hour
                setTimeout(() => {
                    blockedSites.delete(hostname);
                    console.log(`   ✅ Unblocked ${hostname} after cooldown`);
                }, BLOCKED_TTL);
            }
            
            throw enhancedError;
        }
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
            console.warn(`[SCREENSHOT] Token not found: ${token}`);
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
                console.warn(`[SCREENSHOT] File not found: ${filepath}`);
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
                console.log(`[SCREENSHOT] File expired, cleaning up: ${token}`);
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
                console.log(`[SCREENSHOT] Served file: ${token} (${fileContent.length} bytes)`);
                
            } catch (readError) {
                console.error(`[SCREENSHOT] Error reading file ${filepath}:`, readError.message);
                screenshotTokens.delete(token);
                return res.status(500).json({
                    error: 'Failed to read screenshot file',
                    message: 'The screenshot file could not be read'
                });
            }
            
        } catch (error) {
            console.error(`[SCREENSHOT] Error serving screenshot ${token}:`, error.message);
            screenshotTokens.delete(token);
            return res.status(404).json({
                error: 'Screenshot file not found',
                message: 'The screenshot file is missing'
            });
        }
        
    } catch (error) {
        console.error('[SCREENSHOT] Screenshot serve error:', error.message);
        res.status(500).json({
            error: 'Failed to serve screenshot',
            message: error.message
        });
    }
});

app.post('/capture', async (req, res) => {
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
        
        // Capture screenshot (returns URL now, not base64)
        const screenshot = await captureScreenshot(url);
        
        // Send response - screenshot is now a URL, not base64
        res.json({ 
            screenshot: screenshot,
            screenshotUrl: screenshot // Explicit field for clarity
        });
        
    } catch (error) {
        console.error('❌ Capture error:', error.message);
        
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
        console.error('❌ Analysis error:', error.message);
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
        
        console.log(`📸 [CONTEXT] Capturing screenshot and generating analysis for: ${url}`);
        
        // Check cache first - if we have both screenshot and analysis, return immediately
        const cacheEntry = screenshotCache.get(url);
        const analysis = pageAnalysisCache.get(url);
        
        if (cacheEntry && isCacheValid(cacheEntry.timestamp) && analysis) {
            console.log(`📦 [CONTEXT] Cache hit: ${url}`);
            // Return URL if available, otherwise base64 (backward compatibility)
            const screenshot = cacheEntry.screenshotUrl || cacheEntry.screenshot;
            return res.json({
                url: url,
                screenshot: screenshot,
                screenshotUrl: cacheEntry.screenshotUrl || null, // New field for URL
                analysis: analysis,
                text: cacheEntry.text || '',
                cached: true,
                timestamp: new Date().toISOString()
            });
        }
        
        // Capture screenshot (this also generates analysis internally)
        const screenshotUrl = await captureScreenshot(url);
        
        // Get the fresh analysis from cache (captureScreenshot updates both caches)
        const freshAnalysis = pageAnalysisCache.get(url);
        const freshCacheEntry = screenshotCache.get(url);
        
        console.log(`✅ [CONTEXT] Screenshot and analysis ready for: ${url}`);
        console.log(`📊 [CONTEXT] Page type: ${freshAnalysis?.pageType || 'unknown'}`);
        
        // Send response with both screenshot URL and analysis
        res.json({
            url: url,
            screenshot: screenshotUrl, // URL instead of base64
            screenshotUrl: screenshotUrl, // Explicit URL field
            analysis: freshAnalysis || {
                pageType: 'unknown',
                keyTopics: [],
                suggestedActions: [],
                confidence: 0
            },
            text: freshCacheEntry?.text || '',
            cached: false,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ [CONTEXT] Error:', error.message);
        
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
    console.log('🚨 CHAT ENDPOINT CALLED!');
    try {
        console.log('📨 Chat request received:', {
            body: req.body,
            headers: req.headers,
            method: req.method
        });
        
        const { message, currentUrl, url, openaiKey, tooltipHistory, pageInfo, consoleLogs } = req.body;
        const actualUrl = currentUrl || url;
        
        console.log('🔍 URL parsing:', { currentUrl, url, actualUrl });
        
        if (!message) {
            console.log('❌ Missing message parameter');
            return res.status(400).json({
                error: 'Missing message parameter',
                message: 'Please provide a message in the request body: { "message": "Hello" }'
            });
        }
        
        console.log(`[CHAT] Message: ${message}`);
        console.log(`[KEY] From request: ${openaiKey ? 'YES (' + openaiKey.substring(0, 10) + '...)' : 'NO'}`);
        console.log(`[KEY] From env: ${process.env.OPENAI_API_KEY ? 'YES (' + process.env.OPENAI_API_KEY.substring(0, 10) + '...)' : 'NO - KEY NOT SET'}`);
        console.log(`[URL] Current: ${actualUrl || 'none'}`);
        
        // Log full key status for debugging (first few chars only)
        if (process.env.OPENAI_API_KEY) {
            console.log(`[OK] Backend has OpenAI API key configured (length: ${process.env.OPENAI_API_KEY.length} chars)`);
        } else {
            console.log(`[WARN] Backend OPENAI_API_KEY environment variable is NOT set!`);
            console.log(`       To set it: export OPENAI_API_KEY=sk-... (or configure in ECS task definition)`);
        }
        
        // Use shared chat processing function
        const result = await processChatRequest(message, currentUrl, url, openaiKey, tooltipHistory, pageInfo, consoleLogs);
        
        res.json(result);
        
        console.log('[OK] Chat response sent:', {
            response: result.response.substring(0, 100) + '...',
            timestamp: result.timestamp,
            hasContext: !!result.context
        });
        
    } catch (error) {
        console.error('[ERROR] Chat error:', error.message);
        res.status(500).json({
            error: 'Failed to process chat message',
            message: error.message
        });
    }
});

  // OCR Upload endpoint
  app.post("/ocr-upload", async (req, res) => {
      console.log("📸 OCR Upload endpoint called");
      try {
          const { image } = req.body;
          if (!image) {
              return res.status(400).json({ 
                  error: "Image data is required",
                  message: "Please provide an image in base64 format: { \"image\": \"data:image/png;base64,...\" }"
              });
          }
          
          console.log("🔍 Processing OCR on uploaded image...");
          
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
          
          console.log(`✅ OCR completed. Extracted ${extractedText.length} characters`);
          
          res.json({ 
              text: extractedText,
              success: true,
              characterCount: extractedText.length
          });
      } catch (error) {
          console.error("❌ OCR Upload error:", error);
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
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.message);
    
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
async function processChatRequest(message, currentUrl, url, openaiKey, tooltipHistory, pageInfo, consoleLogs) {
    const actualUrl = currentUrl || url;
    
    // Get context from current page if available
    let contextInfo = '';
    if (actualUrl) {
        const analysis = pageAnalysisCache.get(actualUrl);
        if (analysis) {
            contextInfo = `\n\nCurrent page context:\n- Page type: ${analysis.pageType}\n- Key topics: ${analysis.keyTopics.join(', ') || 'none'}\n- Suggestions: ${analysis.suggestedActions.join('; ') || 'none'}`;
        }
    }
    
    // Use OpenAI key from request if provided, otherwise use backend's default key
    const apiKeyToUse = (openaiKey && openaiKey.trim()) ? openaiKey.trim() : (process.env.OPENAI_API_KEY || '');
    
    console.log('[KEY] API Key check:', {
        userProvided: !!(openaiKey && openaiKey.trim()),
        backendKey: !!(process.env.OPENAI_API_KEY),
        keyToUse: apiKeyToUse ? `${apiKeyToUse.substring(0, 10)}...` : 'NONE'
    });
    
    // Check if we have an OpenAI key to use
    if (apiKeyToUse) {
        console.log('[INFO] Using OpenAI API for chat response');
        try {
            // Prepare messages for OpenAI
            const messages = [
                {
                    role: 'system',
                    content: `You are a helpful assistant for the Tooltip Companion browser extension. You help users understand web pages by analyzing screenshots and providing context-aware assistance.${contextInfo ? '\n\nUser is currently on a page with this context:' + contextInfo : ''}`
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
                    max_tokens: 500,
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
            console.error('❌ OpenAI API error:', error.message);
            console.error('❌ OpenAI API error details:', {
                status: error.status,
                message: error.message,
                stack: error.stack
            });
            // Fall through to basic response
        }
    } else {
        console.log('[WARN] No OpenAI API key available - using fallback response');
    }
    
    // Generate a basic helpful response (fallback)
    let response;
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
        response = `Hello! 👋 I'm your Smart Tooltip Companion. I can analyze web pages using OCR and provide intelligent insights about what you're viewing.${contextInfo}`;
    } else if (lowerMessage.includes('analyze') || lowerMessage.includes('what is this page')) {
        if (actualUrl && pageAnalysisCache.has(actualUrl)) {
            const analysis = pageAnalysisCache.get(actualUrl);
            response = `📊 Page Analysis for ${actualUrl}:\n• Type: ${analysis.pageType}\n• Confidence: ${Math.round(analysis.confidence * 100)}%\n• Key Topics: ${analysis.keyTopics.join(', ') || 'none'}\n• Suggestions: ${analysis.suggestedActions.join('; ') || 'none'}`;
        } else {
            response = `I can analyze pages! Hover over a link to capture a screenshot, then ask me to analyze it.`;
        }
    } else if (lowerMessage.includes('tooltip') || lowerMessage.includes('screenshot')) {
        response = `The smart tooltip system now includes:\n• OCR text extraction from screenshots\n• Intelligent page type detection\n• Proactive suggestions based on content\n• Context-aware chat responses${contextInfo}`;
    } else if (lowerMessage.includes('help')) {
        response = `I can help you with:\n• 🔍 Page analysis (OCR + AI insights)\n• 📸 Smart tooltips with context\n• 🧠 Proactive suggestions\n• 💬 Context-aware chat\n\nTry: "analyze this page" or "what type of page is this?"${contextInfo}`;
    } else {
        // More helpful fallback message that doesn't assume user needs to add key
        response = `I received your message: "${message}". I'm equipped with OCR and smart analysis! Ask me to analyze pages or explain what I can see.${contextInfo}\n\nNote: For enhanced AI responses, ensure the backend has an OpenAI API key configured.`;
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
    async (url) => {
        return await captureScreenshot(url);
    },
    // chatHandler
    async ({ message, currentUrl, openaiKey, tooltipHistory }) => {
        return await processChatRequest(
            message,
            currentUrl,
            currentUrl, // url param
            openaiKey,
            tooltipHistory,
            null, // pageInfo
            null  // consoleLogs
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
    try {
        const request = req.body;
        
        console.log('[MCP] Endpoint called:', {
            method: request.method,
            id: request.id,
            hasParams: !!request.params,
            jsonrpc: request.jsonrpc
        });
        
        // Validate JSON-RPC 2.0 request
        if (request.jsonrpc !== '2.0') {
            console.error('[ERROR] MCP: Invalid jsonrpc version:', request.jsonrpc);
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
        
        console.log('[MCP] Request handled, response:', {
            hasError: !!response?.error,
            hasResult: !!response?.result,
            isNotification: response === null
        });
        
        // Notifications don't return responses
        if (response === null) {
            console.log('[MCP] Notification received (no response)');
            return res.status(204).send(); // No Content
        }
        
        res.json(response);
    } catch (error) {
        console.error('[ERROR] MCP endpoint error:', error);
        console.error('[ERROR] MCP endpoint error details:', {
            message: error.message,
            stack: error.stack?.substring(0, 300),
            requestId: req.body?.id
        });
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
        console.log('\n===================================================');
        console.log('Playwright Tooltip Backend Service');
        console.log('===================================================');
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Endpoint: POST http://localhost:${PORT}/capture`);
        console.log(`Context: POST http://localhost:${PORT}/context`);
        console.log(`Screenshots: GET http://localhost:${PORT}/screenshot/:token`);
        console.log(`MCP Endpoint: POST http://localhost:${PORT}/mcp`);
        console.log(`Health: GET http://localhost:${PORT}/health`);
        console.log('===================================================\n');
        console.log('REST API: POST /capture with { "url": "..." }');
        console.log('Context API: POST /context with { "url": "..." }');
        console.log('MCP Protocol: POST /mcp with JSON-RPC 2.0');
        console.log(`Screenshot storage: ${SCREENSHOT_DIR}`);
        console.log('\nWaiting for requests...\n');
    });
}

// Start the server
start().catch(error => {
    console.error('[ERROR] Failed to start server:', error);
    process.exit(1);
});

