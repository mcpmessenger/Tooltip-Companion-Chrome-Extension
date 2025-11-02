# Tooltip Companion Backend Service

Backend service for the Tooltip Companion Chrome Extension. Provides screenshot capture, OCR text extraction, and AI chat capabilities using Playwright and Tesseract.js.

## Quick Start

### 1. Install Dependencies

```bash
cd playwright_service
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 3. Start the Service

```bash
npm start
```

The service will start on `http://localhost:3000`

## Features

- ✅ **Screenshot Capture**: Playwright-based screenshot generation
- ✅ **OCR Text Extraction**: Tesseract.js for extracting text from images
- ✅ **AI Chat Integration**: OpenAI API integration for context-aware chat
- ✅ **Model Context Protocol (MCP)**: JSON-RPC 2.0 protocol support
- ✅ **REST API**: Traditional REST endpoints for backward compatibility
- ✅ **Screenshot Caching**: 5-minute TTL cache for performance
- ✅ **Automatic Browser Management**: Efficient browser instance reuse
- ✅ **Error Handling**: Robust error handling and validation
- ✅ **CORS Enabled**: Ready for browser extension use
- ✅ **Health Monitoring**: `/health` endpoint for status checks

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
  "openaiKey": "sk-..."  // Optional: uses OPENAI_API_KEY env var if not provided
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

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "capture_screenshot",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

**Available Tools:**
- `capture_screenshot` - Capture screenshot of a URL
- `chat` - AI chat with context
- `ocr_upload` - Extract text from image
- `analyze_page` - Get page analysis

See [MCP Usage Guide](../docs/MCP_USAGE_GUIDE.md) for detailed documentation.

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

### Cache TTL

Default: 5 minutes

Edit in `server.js`:
```javascript
const CACHE_TTL = 5 * 60 * 1000; // Change this value
```

## Dependencies

### Core
- **express**: Web framework
- **playwright**: Browser automation
- **cors**: Cross-origin resource sharing
- **tesseract.js**: OCR text extraction

### AI
- **openai**: OpenAI API client

## Project Structure

```
playwright_service/
├── server.js         # Express server with REST endpoints
├── mcp-server.js     # MCP server implementation
├── package.json      # Dependencies
├── Dockerfile        # Container configuration
└── eng.traineddata   # Tesseract OCR language data
```

## Troubleshooting

### Browser Fails to Launch

On Linux, you may need additional dependencies:
```bash
sudo apt-get install libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
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

### OpenAI API Key

1. Set via environment variable:
   ```bash
   export OPENAI_API_KEY=sk-...
   npm start
   ```

2. Or pass in chat requests (see `/chat` endpoint)

3. Check configuration:
   ```bash
   curl http://localhost:3000/health
   ```

## Docker Deployment

Build and run with Docker:

```bash
docker build -t tooltip-backend .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... tooltip-backend
```

## Production Deployment

See [Backend Setup Guide](../docs/BACKEND_SETUP.md) for production deployment instructions.

## License

MIT
