<div align="center">

  
  # 📎 Tooltip Companion
  
  AI-powered browser extension that displays live screenshot previews when hovering over hyperlinks, with context-aware assistance.
  
  **Chrome Web Store Ready - v1.4.1**
  
  ![Version](https://img.shields.io/badge/version-1.4.1-blue)
  ![License](https://img.shields.io/badge/license-MIT-green)
  ![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-lightgrey)
  
  Visit [tooltipcompanion.com](https://tooltipcompanion.com) for more information.
</div>

## ✨ Features

### 🎯 Core Features (No API Key Required!)
- **Hover Preview**: Instantly see what's behind any link before clicking
- **Button Tooltips**: See detailed information about buttons (purpose, shortcuts, state)
- **Smart Caching**: Screenshots cached for retina-quality previews
- **Beautiful UI**: Obsidian glass-morphism design with smooth animations
- **Universal Compatibility**: Works on all modern websites

### 🤖 AI Features (API Key Required)
- **Context-Aware Chat**: AI assistant that knows what you're hovering over
- **OCR-Powered Context**: Automatically extracts text from preview screenshots
- **Console-Like Awareness**: See in chat what the AI sees (tooltip history, console logs)
- **Visual Understanding**: AI sees what's actually visible, not just HTML metadata
- **Screenshot Analysis**: Upload screenshots for AI to analyze
- **Voice Input**: Speak to AI assistant using browser speech recognition

### 🔌 Protocol Support
- **Model Context Protocol (MCP)**: Standard JSON-RPC 2.0 protocol for AI context sharing
- **REST API Fallback**: Automatic fallback to REST if MCP is unavailable
- **Hybrid Architecture**: Best of both worlds - modern protocol with reliable fallback

## 🚀 Quick Start

### Installation

1. **Download** or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right corner)
4. Click **Load unpacked** and select this extension folder
5. **Done!** Tooltips work immediately - hover over any link to see previews!

### Using AI Chat (Optional)

The AI chat feature requires an OpenAI API key. Here's how to set it up:

1. **Get your API key** from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **Add to extension**:
   - Click the extension icon 📎 (or right-click → Options)
   - Paste your OpenAI API key
   - Click **Save Settings**
3. **Start chatting!** Click the 📎 icon on any webpage to open the AI chat

**That's it!** No backend setup needed - everything works out of the box! 🎉

## 🚀 Current Status

**Version:** 1.4.1  
**Status:** ✅ All Features Working

### What's New in 1.4.1
- 🔌 **Model Context Protocol (MCP) Support** - Standard protocol for AI context sharing
- 🛡️ **Robust Error Handling** - Automatic fallback to REST API if MCP unavailable
- 🔍 **Enhanced Debugging** - Comprehensive logging for troubleshooting
- ⚡ **Improved Reliability** - Better connection handling and timeout management

### Production Backend
- ✅ **Deployed and Running** - AWS ECS Fargate
- ✅ **No Configuration** - Pre-configured to use production backend
- ✅ **Always Free** - No backend setup needed for users
- ✅ **MCP & REST** - Supports both protocols for maximum compatibility

---

## 📖 How It Works

### Tooltips
1. **Hover over any link** → See a live preview screenshot
2. **Hover over buttons** → See button details (purpose, shortcuts, state)
3. **All cached** → Fast previews on repeat visits

### AI Chat (with API Key)
1. **Click the 📎 icon** on any webpage
2. **Chat naturally** - AI understands what you're looking at
3. **Hover awareness** - AI sees what you hover over (like console logs!)
4. **Upload screenshots** - Get AI analysis of page content
5. **Voice input** - Speak your questions directly

### Example Conversation

```
You: *hovers over promotional link*
Console: 🔗 Tooltip shown for link: https://bank.com/offer
Console: 📝 Tooltip OCR text extracted: $325 new checking customer bonus...
Console: ✅ Tooltip OCR completed for: https://bank.com/offer

You: "What's the bonus amount?"
AI: "Based on the tooltip preview, the offer shows a **$325 bonus** for new checking customers. The OCR extracted text confirms this amount is clearly displayed in the preview."
```

## 📁 Project Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker (MCP client, REST fallback)
├── content.js            # Content scripts (tooltips, chat widget)
├── options.html          # Settings page
├── options.js            # Settings logic
├── mcp-client.js         # MCP client library (JSON-RPC 2.0)
├── icons/                # Extension icons
│   ├── glippy.png        # Main logo/branding
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── playwright_service/   # Backend service (local development)
│   ├── server.js         # Express server with Playwright & OCR
│   ├── mcp-server.js     # MCP server implementation
│   ├── package.json      # Backend dependencies
│   └── Dockerfile        # Container configuration
├── docs/                 # Documentation
│   ├── MCP_USAGE_GUIDE.md
│   ├── MCP_DEBUG_GUIDE.md
│   └── BACKEND_SETUP.md
└── privacy-policy.md     # Privacy policy
```

## 🛡️ Privacy

This extension processes data locally and only communicates with your configured backend service. See [privacy-policy.md](privacy-policy.md) for details.

## 📝 License

MIT License - see LICENSE file for details.

## 🔧 For Developers

Want to run your own backend or contribute?

### Requirements
- **Extension**: Chrome or Edge browser
- **Backend**: Node.js 18+ (only if running local backend)

### Quick Local Development

1. Clone the repository
2. Load extension in Chrome (`chrome://extensions/` → Developer mode → Load unpacked)
3. **Option A**: Use production backend (default - no setup!)
4. **Option B**: Run local backend:
   ```bash
   cd playwright_service
   npm install
   npx playwright install chromium
   node server.js
   ```

See [docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md) for detailed backend setup.

### Backend Endpoints

#### REST API (Fallback)
- `POST /capture` - Screenshot generation
- `POST /ocr-upload` - OCR text extraction
- `POST /chat` - AI chat with context
- `GET /health` - Health check

#### Model Context Protocol (MCP)
- `POST /mcp` - JSON-RPC 2.0 endpoint
  - `initialize` - Protocol handshake
  - `tools/call` - Call tools (capture_screenshot, chat, ocr_upload, analyze_page)
  - `tools/list` - List available tools
  - `resources/list` - List available resources

## 📚 Documentation

- **[MCP Usage Guide](docs/MCP_USAGE_GUIDE.md)** - How to use Model Context Protocol ⭐
- **[MCP Debug Guide](docs/MCP_DEBUG_GUIDE.md)** - Troubleshooting MCP issues
- **[Backend Setup](docs/BACKEND_SETUP.md)** - Detailed backend installation
- **[MCP Implementation Plan](docs/MCP_IMPLEMENTATION_PLAN.md)** - Migration documentation
- **[Privacy Policy](privacy-policy.md)** - Data handling and privacy

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🌟 Support

- **Website**: [tooltipcompanion.com](https://tooltipcompanion.com)
- **Issues**: [GitHub Issues](https://github.com/mcpmessenger/Tooltip-Companion-Chrome-Extension/issues)

---

## 🎯 Why Tooltip Companion?

### For Everyone
- **No more broken links** - See exactly where links go before clicking
- **Discover faster** - Preview pages without losing your current context
- **Understand buttons** - See what each button does at a glance

### For AI Users
- **Console-like AI** - The AI sees what you're exploring, just like a developer console
- **Context-aware** - Natural conversations about what's on your screen
- **Smart assistance** - AI understands your browsing context
- **Standard Protocol** - Uses Model Context Protocol (MCP) for interoperability

### For Developers
- **Production ready** - Fully deployed and stable
- **Well documented** - Clear setup and development guides
- **Modern architecture** - MCP support with REST fallback
- **MIT licensed** - Free to use and modify

---

<div align="center">
  <img src="icons/glippy.png" alt="Tooltip Companion" width="48" height="48">
  
  **Made with ❤️ for better web browsing**
  
  ⭐ Star us on GitHub if you find this useful!
</div>