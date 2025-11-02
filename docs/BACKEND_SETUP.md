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

#### GET /health

Check service health and configuration.

**Response:**
```json
{
  "status": "healthy",
  "browser": "initialized",
  "config": {
    "openaiConfigured": true,
    "openaiKeyPrefix": "sk-proj-..."
  },
  "cache": {
    "size": 5,
    "entries": []
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

