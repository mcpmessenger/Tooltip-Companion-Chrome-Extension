# Contributing to Tooltip Companion

Thank you for your interest in contributing to Tooltip Companion! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Tooltip-Companion-Chrome-Extension.git
   cd Tooltip-Companion-Chrome-Extension
   ```
3. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Extension Development

1. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension folder

2. Make your changes to the code

3. Test your changes:
   - Reload the extension in `chrome://extensions/`
   - Reload any open web pages to get the updated content script

### Backend Development

1. Navigate to the backend directory:
   ```bash
   cd playwright_service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

## Code Style

- Use **ES6+** JavaScript features
- Follow existing code style and formatting
- Add comments for complex logic
- Keep functions focused and modular

## Commit Messages

Use clear, descriptive commit messages:

```
feat: Add MCP protocol support
fix: Resolve OCR text extraction issue
docs: Update README with installation instructions
refactor: Simplify tooltip caching logic
```

## Pull Request Process

1. **Update documentation** if you've changed functionality
2. **Test thoroughly** - ensure all features work as expected
3. **Update version** in `manifest.json` if applicable
4. **Create a pull request** with:
   - Clear description of changes
   - Screenshots/videos if UI changes
   - Reference to any related issues

## Areas for Contribution

### Features

- New tooltip features
- UI/UX improvements
- Performance optimizations
- Additional AI model support
- MCP protocol enhancements

### Bug Fixes

- Fix issues reported in GitHub Issues
- Improve error handling
- Resolve compatibility issues

### Documentation

- Improve README
- Add code comments
- Create tutorial videos
- Write blog posts

### Testing

- Add unit tests
- Create integration tests
- Improve test coverage

## Questions?

- Open an issue on GitHub
- Check existing documentation in `/docs`
- Review the codebase for examples

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing! 🎉

