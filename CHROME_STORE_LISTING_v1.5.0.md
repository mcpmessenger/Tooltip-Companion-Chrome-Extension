# Tooltip Companion – Chrome Web Store Listing (v1.5.0)

## Short description (≤ 132 chars)
AI-powered link previews with context-aware tooltips and chat. Privacy-first, CSP-safe, and production-ready.

## Full description
Tooltip Companion shows an instant, live preview of any link you hover over—so you can decide faster, browse safer, and get context without losing your place. With optional AI assistance, it understands what you see and helps you act on it.

### What it does
- Link previews: See a screenshot before you click
- Button insights: Understand a button’s purpose, state, and shortcuts
- Context-aware AI: Chat about what’s on your screen (optional API key)
- Enhanced Page Analysis: Semantic and visual analysis for richer context
- Works anywhere: CSP-aware fallback for security‑strict sites (e.g., banking)

### What’s new in v1.5.0 (Operation Juicebox)
- Reliability hardening: Retries with backoff + host-level circuit breaker
- CSP-aware fallback: Automatic data‑URI delivery for strict sites
- Health telemetry: `/health` exposes capture metrics & circuit states
- Structured logging: Production-ready observability (CloudWatch compatible)
- Performance & compatibility improvements across the board

### How it works (high level)
- The extension requests a screenshot of the hovered link via our backend.
- Optional OCR and Enhanced Page Analysis extract key text and structure.
- The tooltip displays a fast, cached preview with relevant context.
- If you enable AI chat (optional), your OpenAI key is used client-side.

## Permissions justification
- host_permissions: `http://*/*`, `https://*/*`
  - Needed to request screenshots for links you hover over across sites.
- storage
  - Caches settings and recent previews locally for speed and reliability.
- contextMenus
  - Adds convenience actions like “Precrawl Links” and “Refresh Cache.”
- tabs
  - Lets the extension understand which tab you’re on to show the correct tooltip.
- activeTab
  - Grants temporary access to the current page to enable tooltip logic safely.
- windows
  - Supports optional capture actions that require window context (e.g., visible tab capture fallback).

## Data usage and privacy (for Web Store “Privacy practices”)
- Data collected
  - Screenshots of hovered link targets (for the tooltip preview)
  - Page content snippets used for OCR/analysis (optional)
  - No personal data, no browsing history, no advertising identifiers
- Data purpose
  - Provide core functionality (tooltip previews and optional analysis)
  - Improve reliability (aggregated, structured logs without PII)
  - Not used for ads; not sold to third parties
- Data sharing
  - Shared with OpenAI (only when AI chat is enabled by the user) for analysis
  - Processed on AWS (backend) to render screenshots and analysis
  - Never shared for advertising
- Data retention
  - Transient processing; screenshots and analysis are short‑lived (up to ~5 minutes) for caching and delivery
- Security
  - Encryption in transit (TLS)
  - Backend hardening (circuit breaker, retries, health telemetry)
- User controls
  - AI chat is opt‑in and requires the user’s own OpenAI key
  - Users can clear cache and disable features in Options at any time

## Category and metadata
- Category: Productivity (or Developer Tools)
- Primary language: English (United States)
- Website: https://tooltipcompanion.com
- Privacy Policy URL: https://tooltipcompanion.com/privacy
- Terms of Service URL: https://tooltipcompanion.com/terms
- Support: support@tooltipcompanion.com

## Suggested screenshots (captions)
1) Hover preview on a news link – “Preview any link before you click”
2) Button tooltip on a web app – “Understand buttons at a glance”
3) AI chat panel – “Ask questions about what you’re viewing”
4) Options page – “Privacy-first controls and MCP/REST settings”
5) CSP banking site example – “Works with strict security policies”

## Promotional images (optional but recommended)
- Small tile: 440×280
- Large tile: 920×680
- Marquee: 1400×560

## Release notes (v1.5.0)
- Operation Juicebox hardening: retries, circuit breaker, health telemetry
- CSP-aware fallback for banking and security‑strict sites
- Structured logging for production observability
- Performance improvements and compatibility fixes

---

Notes:
- Ensure the `manifest.json` version is 1.5.0 (done).
- Upload `tooltip-companion-v1.5.0.zip` built from the extracted bundle.
- Keep privacy/terms URLs live and accessible.

