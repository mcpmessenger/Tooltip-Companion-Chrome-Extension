// server.js - Playwright Tooltip Backend Service
// Captures screenshots of web pages on demand

const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const Tesseract = require('tesseract.js');

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
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BLOCKED_TTL = 60 * 60 * 1000; // Don't retry blocked sites for 1 hour

// Initialize browser
async function initBrowser() {
    if (!browser) {
        console.log('🚀 Initializing Playwright browser...');
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('✅ Browser initialized');
    }
    return browser;
}

// Clean up browser on exit
process.on('SIGINT', async () => {
    console.log('\n⚠️ Shutting down...');
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
            return cacheEntry.screenshot;
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
        
        // Convert to base64
        const base64Screenshot = screenshot.toString('base64');
        const dataUrl = `data:image/png;base64,${base64Screenshot}`;
        
        // Extract text using OCR
        const extractedText = await extractTextFromScreenshot(screenshot);
        
        // Analyze page content
        const analysis = analyzePageContent(extractedText, url);
        
        // Cache the result with analysis
        const newCacheEntry = {
            screenshot: dataUrl,
            timestamp: Date.now(),
            text: extractedText,
            analysis: analysis
        };
        
        screenshotCache.set(url, newCacheEntry);
        pageAnalysisCache.set(url, analysis);
        
        console.log(`✅ Screenshot captured: ${url}`);
        console.log(`📊 Page type: ${analysis.pageType} (confidence: ${Math.round(analysis.confidence * 100)}%)`);
        console.log(`🔍 Key topics: ${analysis.keyTopics.join(', ') || 'none'}`);
        
        return dataUrl;
        
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
        
        // Capture screenshot
        const screenshot = await captureScreenshot(url);
        
        // Send response
        res.json({ screenshot });
        
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

// Get page analysis endpoint
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

// Chat endpoint
app.post('/chat', async (req, res) => {
    console.log('🚨 CHAT ENDPOINT CALLED!');
    try {
        console.log('📨 Chat request received:', {
            body: req.body,
            headers: req.headers,
            method: req.method
        });
        
        const { message, currentUrl, url, openaiKey } = req.body;
        const actualUrl = currentUrl || url; // Handle both field names
        
        console.log('🔍 URL parsing:', { currentUrl, url, actualUrl });
        
        if (!message) {
            console.log('❌ Missing message parameter');
            return res.status(400).json({
                error: 'Missing message parameter',
                message: 'Please provide a message in the request body: { "message": "Hello" }'
            });
        }
        
        console.log(`💬 Chat message: ${message}`);
        console.log(`🔑 OpenAI key provided: ${openaiKey ? 'YES' : 'NO'}`);
        console.log(`🌐 Current URL: ${actualUrl || 'none'}`);
        
        // Check if OpenAI key is provided
        if (!openaiKey || !openaiKey.trim()) {
            console.log('⚠️ No OpenAI key - returning setup message');
            return res.json({ 
                response: 'OpenAI API key not configured! To enable intelligent chat: 1. Click the extension icon → Options 2. Enter your OpenAI API key 3. Click "Save Settings" 4. Try chatting again! Get your key at: https://platform.openai.com/api-keys',
                timestamp: new Date().toISOString(),
                context: actualUrl ? pageAnalysisCache.get(actualUrl) : null
            });
        }
        
        // Get context from current page if available
        let contextInfo = '';
        if (actualUrl) {
            const analysis = pageAnalysisCache.get(actualUrl);
            if (analysis) {
                contextInfo = `\n\nCurrent page context:\n- Page type: ${analysis.pageType}\n- Key topics: ${analysis.keyTopics.join(', ') || 'none'}\n- Suggestions: ${analysis.suggestedActions.join('; ') || 'none'}`;
            }
        }
        
        // Generate a more helpful response
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
            response = `I received your message: "${message}". I'm now equipped with OCR and smart analysis! Ask me to analyze pages or explain what I can see.${contextInfo}`;
        }
        
        res.json({ 
            response,
            timestamp: new Date().toISOString(),
            context: actualUrl ? pageAnalysisCache.get(actualUrl) : null
        });
        
        console.log('✅ Chat response sent:', {
            response: response.substring(0, 100) + '...',
            timestamp: new Date().toISOString(),
            hasContext: !!pageAnalysisCache.get(actualUrl)
        });
        
    } catch (error) {
        console.error('❌ Chat error:', error.message);
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
              return res.status(400).json({ error: "Image data is required" });
          }
          res.json({ text: "OCR processing not implemented yet", success: true });
      } catch (error) {
          console.error("❌ OCR Upload error:", error);
          res.status(500).json({ error: "OCR processing failed" });
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

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString()
    });
});

// Start server
async function start() {
    await initBrowser();
    
    app.listen(PORT, () => {
        console.log('\n═══════════════════════════════════════════════════');
        console.log('🚀 Playwright Tooltip Backend Service');
        console.log('═══════════════════════════════════════════════════');
        console.log(`📡 Server running on http://localhost:${PORT}`);
        console.log(`📸 Endpoint: POST http://localhost:${PORT}/capture`);
        console.log(`❤️  Health: GET http://localhost:${PORT}/health`);
        console.log('═══════════════════════════════════════════════════\n');
        console.log('💡 Send a POST request with:');
        console.log('   { "url": "https://example.com" }');
        console.log('\n⏳ Waiting for requests...\n');
    });
}

// Start the server
start().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

