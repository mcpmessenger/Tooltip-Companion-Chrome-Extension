# Changelog

All notable changes to the Tooltip Companion extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2025-11-02

### Added
- Model Context Protocol (MCP) support with JSON-RPC 2.0
- Automatic REST API fallback if MCP initialization fails
- Enhanced error logging and debugging capabilities
- Comprehensive MCP documentation (Usage Guide, Debug Guide, Implementation Plan)
- Backend health endpoint with OpenAI API key status

### Changed
- Improved error handling in MCP client initialization
- Enhanced OCR response parsing for better compatibility
- Updated backend to support both MCP and REST protocols
- Better timeout handling (10-second timeout for MCP initialization)

### Fixed
- Extension context invalidation errors when extension is reloaded
- OCR text extraction response parsing
- Backend URL normalization issues

## [1.4.0] - 2025-10-30

### Added
- Context-aware AI chat that knows what you're hovering over
- OCR-powered context extraction from preview screenshots
- Enhanced button tooltips with purpose, shortcuts, and state
- Tooltip history console-like visibility
- Voice input support for AI chat

### Changed
- Simplified setup - everything works out of the box
- Production backend pre-configured
- Improved UI with obsidian glass-morphism design

## [1.3.0] - Previous Release

### Added
- Initial AI chat integration
- Screenshot upload functionality
- Basic OCR text extraction

## [1.2.0] - Previous Release

### Added
- Button tooltips
- Smart caching system

## [1.1.0] - Previous Release

### Added
- Initial tooltip preview feature
- Hover preview for links

## [1.0.0] - Initial Release

### Added
- Basic tooltip functionality
- Screenshot capture backend

