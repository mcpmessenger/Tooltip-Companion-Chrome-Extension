/**
 * Semantic HTML Extractor
 * Extracts structured content from web pages for AI context
 * 
 * Phase 2: Context Gathering Enhancement
 */

const logger = require('../logger');

/**
 * Extract semantic HTML content from a page
 * @param {Page} page - Playwright page object
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Semantic content structure
 */
async function extractSemanticHTML(page, options = {}) {
    const {
        maxMainContentLength = 5000,
        maxArticleLength = 3000,
        maxSectionLength = 2000,
        includeStructuredData = true,
        includeNavigation = false
    } = options;

    const semanticLogger = logger.child({ scope: 'extract.semantic' });

    try {
        semanticLogger.debug({ event: 'extract.semantic.start' }, 'Starting semantic HTML extraction');

        // Extract main content
        const mainContent = await extractMainContent(page, maxMainContentLength);

        // Extract articles
        const articles = await extractArticles(page, maxArticleLength);

        // Extract sections
        const sections = await extractSections(page, maxSectionLength);

        // Extract structured data (JSON-LD, microdata)
        const structuredData = includeStructuredData 
            ? await extractStructuredData(page)
            : null;

        // Extract navigation (optional)
        const navigation = includeNavigation
            ? await extractNavigation(page)
            : null;

        const result = {
            mainContent: mainContent || null,
            articles: articles || [],
            sections: sections || [],
            structuredData: structuredData || null,
            navigation: navigation || null
        };

        semanticLogger.info({
            event: 'extract.semantic.success',
            hasMainContent: !!mainContent,
            articlesCount: articles.length,
            sectionsCount: sections.length,
            hasStructuredData: !!structuredData
        }, 'Semantic HTML extraction completed');

        return result;
    } catch (error) {
        semanticLogger.warn({
            event: 'extract.semantic.error',
            error: error.message
        }, 'Semantic HTML extraction failed');
        return {
            mainContent: null,
            articles: [],
            sections: [],
            structuredData: null,
            navigation: null
        };
    }
}

/**
 * Extract main content from <main> or <article> elements
 * @param {Page} page - Playwright page object
 * @param {number} maxLength - Maximum content length
 * @returns {Promise<string|null>} Main content text
 */
async function extractMainContent(page, maxLength = 5000) {
    try {
        // Try to get <main> element first
        const mainContent = await page.evaluate((maxLen) => {
            // Try <main> element
            let main = document.querySelector('main');
            if (!main) {
                // Fallback to <article> if no <main>
                main = document.querySelector('article');
            }
            if (!main) {
                // Fallback to content area with id="content" or class="content"
                main = document.querySelector('#content, .content, [role="main"]');
            }

            if (!main) return null;

            // Get text content, filtering out navigation and footer
            const clone = main.cloneNode(true);
            
            // Remove navigation, footer, sidebar, ads
            const unwanted = clone.querySelectorAll('nav, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .ad, .advertisement, .sidebar');
            unwanted.forEach(el => el.remove());

            let text = clone.textContent || '';
            
            // Clean up whitespace
            text = text.replace(/\s+/g, ' ').trim();
            
            // Truncate if needed
            if (text.length > maxLen) {
                // Try to truncate at sentence boundary
                const truncated = text.substring(0, maxLen);
                const lastPeriod = truncated.lastIndexOf('.');
                if (lastPeriod > maxLen * 0.8) {
                    text = truncated.substring(0, lastPeriod + 1);
                } else {
                    text = truncated + '...';
                }
            }

            return text || null;
        }, maxLength);

        return mainContent;
    } catch (error) {
        logger.warn({ event: 'extract.main_content.error', error: error.message }, 'Failed to extract main content');
        return null;
    }
}

/**
 * Extract article elements
 * @param {Page} page - Playwright page object
 * @param {number} maxLength - Maximum content length per article
 * @returns {Promise<Array>} Array of article objects
 */
async function extractArticles(page, maxLength = 3000) {
    try {
        const articles = await page.evaluate((maxLen) => {
            const articleElements = document.querySelectorAll('article');
            const result = [];

            articleElements.forEach((article, index) => {
                // Skip if hidden
                const style = window.getComputedStyle(article);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return;
                }

                // Get title (from h1-h3 or article title attribute)
                let title = '';
                const titleElement = article.querySelector('h1, h2, h3, [itemprop="headline"], .title, .article-title');
                if (titleElement) {
                    title = titleElement.textContent.trim();
                }

                // Get article URL (from link or parent)
                let url = null;
                const linkElement = article.querySelector('a[href]');
                if (linkElement) {
                    url = linkElement.href;
                }

                // Get content
                const clone = article.cloneNode(true);
                clone.querySelectorAll('nav, footer, aside, .ad, .advertisement').forEach(el => el.remove());
                let content = clone.textContent || '';
                content = content.replace(/\s+/g, ' ').trim();

                // Truncate if needed
                if (content.length > maxLen) {
                    const truncated = content.substring(0, maxLen);
                    const lastPeriod = truncated.lastIndexOf('.');
                    if (lastPeriod > maxLen * 0.8) {
                        content = truncated.substring(0, lastPeriod + 1);
                    } else {
                        content = truncated + '...';
                    }
                }

                if (content.length > 50) { // Only include articles with substantial content
                    result.push({
                        title: title || `Article ${index + 1}`,
                        content: content,
                        url: url || null
                    });
                }
            });

            return result;
        }, maxLength);

        return articles || [];
    } catch (error) {
        logger.warn({ event: 'extract.articles.error', error: error.message }, 'Failed to extract articles');
        return [];
    }
}

/**
 * Extract section elements with headings
 * @param {Page} page - Playwright page object
 * @param {number} maxLength - Maximum content length per section
 * @returns {Promise<Array>} Array of section objects
 */
async function extractSections(page, maxLength = 2000) {
    try {
        const sections = await page.evaluate((maxLen) => {
            const result = [];
            
            // Get all section elements
            const sectionElements = document.querySelectorAll('section, [role="region"]');
            
            sectionElements.forEach((section, index) => {
                // Skip if hidden
                const style = window.getComputedStyle(section);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return;
                }

                // Get heading (h1-h6)
                let heading = '';
                let level = 2;
                const headingElement = section.querySelector('h1, h2, h3, h4, h5, h6');
                if (headingElement) {
                    heading = headingElement.textContent.trim();
                    const tagName = headingElement.tagName.toLowerCase();
                    level = parseInt(tagName.charAt(1)) || 2;
                }

                // Get content
                const clone = section.cloneNode(true);
                clone.querySelectorAll('nav, footer, aside, .ad, .advertisement').forEach(el => el.remove());
                let content = clone.textContent || '';
                content = content.replace(/\s+/g, ' ').trim();

                // Truncate if needed
                if (content.length > maxLen) {
                    const truncated = content.substring(0, maxLen);
                    const lastPeriod = truncated.lastIndexOf('.');
                    if (lastPeriod > maxLen * 0.8) {
                        content = truncated.substring(0, lastPeriod + 1);
                    } else {
                        content = truncated + '...';
                    }
                }

                if (content.length > 30) { // Only include sections with content
                    result.push({
                        heading: heading || `Section ${index + 1}`,
                        content: content,
                        level: level
                    });
                }
            });

            // Also extract headings hierarchy from page
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
                .filter(h => {
                    const style = window.getComputedStyle(h);
                    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                })
                .slice(0, 20) // Limit to first 20 headings
                .map(h => ({
                    text: h.textContent.trim(),
                    level: parseInt(h.tagName.charAt(1))
                }));

            // If we have headings but no sections, create sections from headings
            if (result.length === 0 && headings.length > 0) {
                headings.forEach((h, idx) => {
                    if (h.text.length > 0) {
                        result.push({
                            heading: h.text,
                            content: '', // No content for heading-only sections
                            level: h.level
                        });
                    }
                });
            }

            return result;
        }, maxLength);

        return sections || [];
    } catch (error) {
        logger.warn({ event: 'extract.sections.error', error: error.message }, 'Failed to extract sections');
        return [];
    }
}

/**
 * Extract structured data (JSON-LD, microdata, Open Graph)
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object|null>} Structured data object
 */
async function extractStructuredData(page) {
    try {
        const structuredData = await page.evaluate(() => {
            const result = {
                jsonLd: [],
                microdata: null,
                openGraph: {},
                schema: {}
            };

            // Extract JSON-LD
            const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
            jsonLdScripts.forEach(script => {
                try {
                    const data = JSON.parse(script.textContent);
                    if (data) {
                        result.jsonLd.push(data);
                    }
                } catch (e) {
                    // Invalid JSON, skip
                }
            });

            // Extract Open Graph meta tags
            const ogTags = document.querySelectorAll('meta[property^="og:"]');
            ogTags.forEach(tag => {
                const property = tag.getAttribute('property');
                const content = tag.getAttribute('content');
                if (property && content) {
                    result.openGraph[property] = content;
                }
            });

            // Extract basic microdata (simplified)
            const itemProps = document.querySelectorAll('[itemprop]');
            if (itemProps.length > 0) {
                result.microdata = {};
                itemProps.forEach(el => {
                    const prop = el.getAttribute('itemprop');
                    const value = el.textContent?.trim() || el.getAttribute('content') || '';
                    if (prop && value) {
                        if (!result.microdata[prop]) {
                            result.microdata[prop] = [];
                        }
                        result.microdata[prop].push(value);
                    }
                });
            }

            // Extract schema.org type
            const itemType = document.querySelector('[itemtype]');
            if (itemType) {
                result.schema.type = itemType.getAttribute('itemtype');
            }

            return result;
        });

        // Only return if we have some data
        if (structuredData.jsonLd.length > 0 || 
            Object.keys(structuredData.openGraph).length > 0 ||
            structuredData.microdata) {
            return structuredData;
        }

        return null;
    } catch (error) {
        logger.warn({ event: 'extract.structured_data.error', error: error.message }, 'Failed to extract structured data');
        return null;
    }
}

/**
 * Extract navigation structure (optional)
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object|null>} Navigation structure
 */
async function extractNavigation(page) {
    try {
        const navigation = await page.evaluate(() => {
            const navElements = document.querySelectorAll('nav, [role="navigation"]');
            if (navElements.length === 0) return null;

            const navItems = [];
            navElements.forEach((nav, idx) => {
                const links = nav.querySelectorAll('a[href]');
                const items = Array.from(links)
                    .slice(0, 20) // Limit to first 20 links
                    .map(link => ({
                        text: link.textContent.trim(),
                        url: link.href,
                        visible: link.offsetParent !== null
                    }))
                    .filter(item => item.text.length > 0 && item.visible);

                if (items.length > 0) {
                    navItems.push({
                        index: idx,
                        items: items
                    });
                }
            });

            return navItems.length > 0 ? { navigations: navItems } : null;
        });

        return navigation;
    } catch (error) {
        logger.warn({ event: 'extract.navigation.error', error: error.message }, 'Failed to extract navigation');
        return null;
    }
}

module.exports = {
    extractSemanticHTML,
    extractMainContent,
    extractArticles,
    extractSections,
    extractStructuredData,
    extractNavigation
};

