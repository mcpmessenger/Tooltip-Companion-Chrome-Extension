/**
 * Interactive Elements Extractor
 * Extracts and analyzes interactive elements (buttons, forms, links) from pages
 * 
 * Phase 2: Context Gathering Enhancement
 */

const logger = require('../logger');

/**
 * Extract interactive elements from a page
 * @param {Page} page - Playwright page object
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Interactive elements structure
 */
async function extractInteractiveElements(page, options = {}) {
    const {
        maxButtons = 50,
        maxForms = 10,
        maxLinks = 100,
        includeHidden = false
    } = options;

    const interactiveLogger = logger.child({ scope: 'extract.interactive' });

    try {
        interactiveLogger.debug({ event: 'extract.interactive.start' }, 'Starting interactive elements extraction');

        const result = await page.evaluate((opts) => {
            const { maxButtons, maxForms, maxLinks, includeHidden } = opts;

            /**
             * Calculate element importance based on position, size, and styling
             */
            function calculateImportance(element) {
                let score = 0.5; // Base score

                // Position scoring (elements in viewport are more important)
                const rect = element.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                
                const isInViewport = rect.top >= 0 && rect.left >= 0 && 
                                    rect.bottom <= viewportHeight && 
                                    rect.left <= viewportWidth;
                
                if (isInViewport) {
                    score += 0.2;
                }

                // Size scoring (larger elements are more important)
                const area = rect.width * rect.height;
                const viewportArea = viewportWidth * viewportHeight;
                const relativeSize = area / viewportArea;
                score += Math.min(relativeSize * 2, 0.2);

                // Styling scoring (prominent elements)
                const style = window.getComputedStyle(element);
                const fontSize = parseFloat(style.fontSize) || 14;
                if (fontSize > 18) score += 0.05;
                if (fontSize > 24) score += 0.05;

                // Color contrast (bright colors are more visible)
                const bgColor = style.backgroundColor;
                if (bgColor && !bgColor.includes('rgba(0, 0, 0, 0)') && 
                    bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
                    score += 0.05;
                }

                return Math.min(score, 1.0);
            }

            /**
             * Determine element purpose from context
             */
            function determinePurpose(element, type) {
                const text = element.textContent?.trim().toLowerCase() || '';
                const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
                const label = (text + ' ' + ariaLabel).trim();
                
                // Check parent context
                const parent = element.closest('form, nav, header, footer, aside');
                const parentRole = parent?.getAttribute('role') || '';
                
                // Common patterns
                if (label.includes('submit') || label.includes('send') || label.includes('post')) {
                    return 'Submit form or action';
                }
                if (label.includes('login') || label.includes('sign in')) {
                    return 'Authentication';
                }
                if (label.includes('sign up') || label.includes('register') || label.includes('join')) {
                    return 'Registration';
                }
                if (label.includes('buy') || label.includes('purchase') || label.includes('add to cart')) {
                    return 'Purchase action';
                }
                if (label.includes('subscribe') || label.includes('newsletter')) {
                    return 'Subscription';
                }
                if (label.includes('download') || label.includes('get')) {
                    return 'Download';
                }
                if (label.includes('share') || label.includes('social')) {
                    return 'Social sharing';
                }
                if (parentRole === 'navigation' || parent?.tagName === 'NAV') {
                    return 'Navigation';
                }
                if (type === 'link' && text.length < 30) {
                    return 'Navigation link';
                }
                
                return text.length > 0 ? `Action: ${text.substring(0, 50)}` : 'Interactive element';
            }

            /**
             * Extract buttons
             */
            function extractButtons() {
                const buttonSelectors = [
                    'button',
                    'input[type="button"]',
                    'input[type="submit"]',
                    'input[type="reset"]',
                    '[role="button"]',
                    'a.button',
                    'a[class*="btn"]'
                ];

                const buttons = [];
                const seen = new Set();

                buttonSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach((el, idx) => {
                        if (idx >= maxButtons) return;
                        
                        const style = window.getComputedStyle(el);
                        const isVisible = style.display !== 'none' && 
                                       style.visibility !== 'hidden' && 
                                       style.opacity !== '0';
                        
                        if (!includeHidden && !isVisible) return;

                        const rect = el.getBoundingClientRect();
                        const text = el.textContent?.trim() || el.value || el.getAttribute('aria-label') || '';
                        
                        // Create unique key
                        const key = `${selector}-${text}-${rect.x}-${rect.y}`;
                        if (seen.has(key)) return;
                        seen.add(key);

                        const state = el.disabled ? 'disabled' : 
                                    (!isVisible ? 'hidden' : 'enabled');

                        buttons.push({
                            text: text || 'Button',
                            purpose: determinePurpose(el, 'button'),
                            state: state,
                            location: {
                                x: Math.round(rect.x),
                                y: Math.round(rect.y),
                                visible: isVisible
                            },
                            importance: calculateImportance(el),
                            type: el.type || 'button'
                        });
                    });
                });

                // Sort by importance
                return buttons.sort((a, b) => b.importance - a.importance).slice(0, maxButtons);
            }

            /**
             * Extract forms
             */
            function extractForms() {
                const forms = [];
                const formElements = document.querySelectorAll('form');
                
                formElements.forEach((form, idx) => {
                    if (idx >= maxForms) return;

                    const style = window.getComputedStyle(form);
                    const isVisible = style.display !== 'none' && 
                                   style.visibility !== 'hidden' && 
                                   style.opacity !== '0';
                    
                    if (!includeHidden && !isVisible) return;

                    const fields = [];
                    const inputs = form.querySelectorAll('input, textarea, select');
                    
                    inputs.forEach(input => {
                        const fieldStyle = window.getComputedStyle(input);
                        const fieldVisible = fieldStyle.display !== 'none';
                        
                        if (!includeHidden && !fieldVisible) return;

                        fields.push({
                            name: input.name || input.id || '',
                            type: input.type || input.tagName.toLowerCase(),
                            required: input.required || input.hasAttribute('required'),
                            label: input.labels?.[0]?.textContent?.trim() || 
                                   input.getAttribute('aria-label') || 
                                   input.getAttribute('placeholder') || ''
                        });
                    });

                    if (fields.length > 0) {
                        forms.push({
                            fields: fields,
                            action: form.action || null,
                            method: form.method?.toUpperCase() || 'GET'
                        });
                    }
                });

                return forms.slice(0, maxForms);
            }

            /**
             * Extract links
             */
            function extractLinks() {
                const links = [];
                const linkElements = document.querySelectorAll('a[href]');
                const seen = new Set();

                linkElements.forEach((link, idx) => {
                    if (idx >= maxLinks) return;

                    const href = link.href;
                    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

                    const style = window.getComputedStyle(link);
                    const isVisible = style.display !== 'none' && 
                                   style.visibility !== 'hidden' && 
                                   style.opacity !== '0';
                    
                    if (!includeHidden && !isVisible) return;

                    const text = link.textContent?.trim() || '';
                    const key = `${href}-${text}`;
                    if (seen.has(key)) return;
                    seen.add(key);

                    links.push({
                        text: text || href,
                        url: href,
                        purpose: determinePurpose(link, 'link'),
                        visible: isVisible
                    });
                });

                // Sort by importance (prioritize visible links with text)
                return links
                    .sort((a, b) => {
                        if (a.visible !== b.visible) return b.visible - a.visible;
                        return b.text.length - a.text.length;
                    })
                    .slice(0, maxLinks);
            }

            return {
                buttons: extractButtons(),
                forms: extractForms(),
                links: extractLinks()
            };
        }, { maxButtons, maxForms, maxLinks, includeHidden });

        interactiveLogger.info({
            event: 'extract.interactive.success',
            buttonsCount: result.buttons.length,
            formsCount: result.forms.length,
            linksCount: result.links.length
        }, 'Interactive elements extraction completed');

        return result;
    } catch (error) {
        interactiveLogger.warn({
            event: 'extract.interactive.error',
            error: error.message
        }, 'Interactive elements extraction failed');
        return {
            buttons: [],
            forms: [],
            links: []
        };
    }
}

module.exports = {
    extractInteractiveElements
};

