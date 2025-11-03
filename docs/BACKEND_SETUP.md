# Backend Setup Guide

This guide explains how to set up and run the Tooltip Companion backend service locally for development.

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)
- Windows, macOS, or Linux

### Installation

1. **Navigate to the backend directory:**
   ```bash
   cd playwright_service
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

4. **Start the service:**
   ```bash
   npm start
   ```

The service will start on `http://localhost:3000` by default.

## Configuration

### Environment Variables

Create a `.env` file in the `playwright_service` directory (optional):

```env
PORT=3000
OPENAI_API_KEY=your-api-key-here
```

Additional Operation Juicebox variables (optional):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `CAPTURE_MAX_ATTEMPTS` | `3` | Number of capture attempts before returning an error |
| `CAPTURE_BASE_DELAY_MS` | `1000` | Base delay (ms) for exponential backoff between retries |
| `CIRCUIT_BREAKER_THRESHOLD` | `3` | Consecutive failures per host before we stop hitting it |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `300000` | Cooldown (ms) before retrying a failing host |
| `CIRCUIT_BREAKER_BLOCK_MS` | `900000` | Block duration (ms) when a host responds with explicit denial (403 etc.) |

### Port

Default: `3000`

Change with environment variable:
```bash
PORT=4000 npm start
```

Or on Windows PowerShell:
```powershell
$env:PORT=4000; npm start
```

## API Endpoints

### REST API

#### POST /capture

Capture a screenshot of a URL.

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "screenshot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "url": "https://example.com",
  "timestamp": 1234567890
}
```

#### POST /ocr-upload

Extract text from a screenshot using OCR.

**Request:**
```json
{
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Response:**
```json
{
  "text": "Extracted text from image...",
  "characterCount": 123
}
```

#### POST /chat

AI chat with context awareness.

**Request:**
```json
{
  "message": "What does this page say?",
  "context": {
    "tooltipHistory": [...],
    "ocrText": "..."
  },
  "openaiKey": "sk-..."
}
```

**Response:**
```json
{
  "response": "AI response text...",
  "model": "gpt-4"
}
```

#### POST /context

Consolidated endpoint that returns both screenshot metadata and page analysis.

**Request:**
```json
{
  "url": "https://example.com",
  "preferDataUri": true
}
```

**Response:**
```json
{
  "url": "https://example.com",
  "screenshot": "data:image/png;base64,...",
  "screenshotUrl": "data:image/png;base64,...",
  "originalScreenshotUrl": "https://backend.tooltipcompanion.com/screenshot/abcdef123456",
  "screenshotDataUri": "data:image/png;base64,...",
  "analysis": {
    "pageType": "banking",
    "keyTopics": ["pricing"],
    "suggestedActions": ["Financial page - verify security"],
    "confidence": 0.6
  },
  "text": "Extracted OCR text...",
  "cached": false,
  "timestamp": "2025-11-03T22:15:00.123Z"
}
```

> **Operation Juicebox:** Set `preferDataUri` to `true` when testing against strict CSP sites (banking, GitHub, etc.). The backend will return a `data:` URL fallback that bypasses mixed-content blocks. In production this will evolve into short-lived signed HTTPS URLs.

#### GET /health

Check service health and configuration.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-03T22:15:00.123Z",
  "browser": "initialized",
  "uptime": 123.45,
  "cache": {
    "screenshots": 5,
    "analysis": 5
  },
  "metrics": {
    "capture": {
      "totalRequests": 42,
      "successfulRequests": 40,
      "failedRequests": 2,
      "averageDurationMs": 1380,
      "lastFailureAt": "2025-11-03T21:58:10.000Z"
    }
  },
  "resilience": {
    "maxCaptureAttempts": 3,
    "captureBaseDelayMs": 1000,
    "circuitBreakerThreshold": 3,
    "circuitBreakerCooldownMs": 300000,
    "openCircuits": []
  },
  "config": {
    "openaiKeyConfigured": true,
    "openaiKeyLength": 56,
    "openaiKeyPrefix": "sk-proj-..."
  }
}
```

### Model Context Protocol (MCP)

#### POST /mcp

JSON-RPC 2.0 endpoint for MCP protocol.

See [MCP Usage Guide](../docs/MCP_USAGE_GUIDE.md) for detailed MCP documentation.

## Features

- ✅ Screenshot caching (5 minutes TTL)
- ✅ Automatic browser management
- ✅ OCR text extraction (Tesseract.js)
- ✅ OpenAI integration for AI chat
- ✅ Model Context Protocol (MCP) support
- ✅ Error handling and validation
- ✅ CORS enabled for browser extension
- ✅ Graceful shutdown
- ✅ Structured JSON logging compatible with CloudWatch Logs Insights
- ✅ Exponential backoff + circuit breaker for resilient captures (Operation Juicebox)

## Operation Juicebox Observability

- Review overall program status in `docs/OPERATION_JUICEBOX.md`
- Deploy monitoring scaffolding from `infra/operation-juicebox/` (CloudWatch alarms, log queries, ECS checklist)
- Inspect `/health` metrics to verify capture success, circuit breakers, and retry configuration

## Troubleshooting

### Browser Fails to Launch

**Linux:**
```bash
sudo apt-get install libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
```

**macOS:**
```bash
# Usually works out of the box
```

**Windows:**
```powershell
# Usually works out of the box
```

### Port Already in Use

If port 3000 is already in use, change it:
```bash
PORT=4000 npm start
```

### Performance Issues

- Reduce viewport size in `server.js`
- Increase timeout values
- Add more memory to Node.js process: `node --max-old-space-size=4096 server.js`

### Memory Leaks

The service automatically cleans up browser contexts after each screenshot. If you experience memory leaks:

- Restart the service periodically
- Check for browser process accumulation
- Monitor with `GET /health` endpoint

### OpenAI API Key Issues

1. **Check if key is set:**
   ```bash
   curl http://localhost:3000/health
   ```
   Look for `config.openaiConfigured: true`

2. **Set via environment variable:**
   ```bash
   export OPENAI_API_KEY=sk-...
   npm start
   ```

3. **Check logs:**
   The service logs API key configuration status on startup.

## Docker Deployment

The backend includes a Dockerfile for containerized deployment:

```bash
cd playwright_service
docker build -t tooltip-backend .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... tooltip-backend
```

## Production Deployment

For production deployment on AWS ECS, see the deployment scripts and documentation in the root directory.

## License

MIT

