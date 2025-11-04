// Test script for Enhanced Page Analysis
// Tests all three phases: LLM semantic analysis, HTML metadata, and vision model analysis
// Requires Node.js 18+ (built-in fetch) or install node-fetch: npm install node-fetch

// Use built-in fetch if available (Node 18+), otherwise try to require node-fetch
let fetch;
if (typeof globalThis.fetch === 'function') {
    fetch = globalThis.fetch;
} else {
    try {
        fetch = require('node-fetch');
    } catch (e) {
        console.error('❌ fetch is not available. Please use Node.js 18+ or install node-fetch: npm install node-fetch');
        process.exit(1);
    }
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const TEST_URL = process.argv[2] || 'https://example.com';

async function testEnhancedAnalysis() {
    console.log('🧪 Testing Enhanced Page Analysis');
    console.log(`📡 Backend URL: ${BACKEND_URL}`);
    console.log(`🌐 Test URL: ${TEST_URL}\n`);

    try {
        // Step 1: Check health endpoint
        console.log('1️⃣ Checking backend health...');
        const healthRes = await fetch(`${BACKEND_URL}/health`);
        const health = await healthRes.json();
        console.log(`   Status: ${health.status}`);
        console.log(`   OpenAI Key Configured: ${health.config?.openaiKeyConfigured || false}`);
        console.log(`   Key Prefix: ${health.config?.openaiKeyPrefix || 'not set'}\n`);

        if (!health.config?.openaiKeyConfigured) {
            console.warn('⚠️  WARNING: OpenAI API key not configured!');
            console.warn('   Enhanced analysis (LLM + Vision) will not work.');
            console.warn('   Set BACKEND_OPENAI_API_KEY in server.js or OPENAI_API_KEY env var.\n');
        }

        // Step 2: Test context endpoint (includes all enhancements)
        console.log('2️⃣ Testing /context endpoint (includes all enhanced features)...');
        console.log(`   Fetching context for: ${TEST_URL}`);
        const startTime = Date.now();
        
        const contextRes = await fetch(`${BACKEND_URL}/context`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: TEST_URL,
                preferDataUri: false
            })
        });

        const duration = Date.now() - startTime;
        
        if (!contextRes.ok) {
            const error = await contextRes.json().catch(() => ({ message: contextRes.statusText }));
            throw new Error(`Context endpoint failed: ${error.message || contextRes.status}`);
        }

        const context = await contextRes.json();
        console.log(`   ✅ Success! (${duration}ms)\n`);

        // Step 3: Analyze results
        console.log('3️⃣ Analyzing enhanced features:\n');

        // Phase 1: LLM Semantic Analysis
        if (context.analysis) {
            console.log('📊 PHASE 1: Semantic Analysis (LLM)');
            console.log(`   ✅ Analysis present: ${!!context.analysis}`);
            console.log(`   Page Type: ${context.analysis.pageType || 'unknown'}`);
            console.log(`   Analysis Method: ${context.analysis.analysisMethod || 'keyword'}`);
            
            if (context.analysis.analysisMethod === 'llm') {
                console.log(`   ✅ LLM Analysis Active!`);
                if (context.analysis.pagePurpose) {
                    console.log(`   Page Purpose: ${context.analysis.pagePurpose.substring(0, 100)}...`);
                }
                if (context.analysis.sentiment) {
                    console.log(`   Sentiment: ${context.analysis.sentiment}`);
                }
            } else {
                console.log(`   ⚠️  Using keyword-based fallback (LLM not available or failed)`);
            }
            
            console.log(`   Key Topics: ${context.analysis.keyTopics?.join(', ') || 'none'}`);
            console.log(`   Suggested Actions: ${context.analysis.suggestedActions?.slice(0, 3).join(', ') || 'none'}...`);
            console.log(`   Confidence: ${Math.round((context.analysis.confidence || 0) * 100)}%\n`);
        } else {
            console.log('   ❌ Analysis missing\n');
        }

        // Phase 2: HTML Metadata
        if (context.analysis?.htmlMetadata) {
            console.log('🏷️  PHASE 2: HTML Metadata Extraction');
            console.log(`   ✅ HTML metadata present`);
            console.log(`   Title: ${context.analysis.htmlMetadata.title || 'N/A'}`);
            console.log(`   Meta Description: ${context.analysis.htmlMetadata.metaDescription ? context.analysis.htmlMetadata.metaDescription.substring(0, 80) + '...' : 'N/A'}`);
            console.log(`   H1 Tags (${context.analysis.htmlMetadata.h1Tags?.length || 0}): ${context.analysis.htmlMetadata.h1Tags?.slice(0, 2).join(', ') || 'none'}\n`);
        } else {
            console.log('   ⚠️  HTML metadata not present\n');
        }

        // Phase 3: Visual Analysis
        if (context.analysis?.visualSummary) {
            console.log('👁️  PHASE 3: Visual Context Integration (Vision Model)');
            console.log(`   ✅ Visual summary present`);
            console.log(`   Layout: ${context.analysis.visualSummary.layout || 'N/A'}`);
            console.log(`   Design Style: ${context.analysis.visualSummary.designStyle || 'N/A'}`);
            console.log(`   Color Scheme: ${context.analysis.visualSummary.colorScheme || 'N/A'}`);
            console.log(`   Visual Hierarchy: ${context.analysis.visualSummary.visualHierarchy ? context.analysis.visualSummary.visualHierarchy.substring(0, 80) + '...' : 'N/A'}`);
            console.log(`   Key Elements (${context.analysis.visualSummary.keyElements?.length || 0}): ${context.analysis.visualSummary.keyElements?.slice(0, 3).join(', ') || 'none'}...`);
            console.log(`   Confidence: ${Math.round((context.analysis.visualSummary.confidence || 0) * 100)}%\n`);
        } else {
            console.log('   ⚠️  Visual summary not present (vision model may not be available or failed)\n');
        }

        // Summary
        console.log('📋 SUMMARY:');
        const features = {
            'LLM Analysis': context.analysis?.analysisMethod === 'llm',
            'HTML Metadata': !!context.analysis?.htmlMetadata,
            'Visual Analysis': !!context.analysis?.visualSummary,
            'Screenshot': !!context.screenshot,
            'OCR Text': !!(context.text && context.text.length > 0)
        };

        for (const [feature, active] of Object.entries(features)) {
            console.log(`   ${active ? '✅' : '❌'} ${feature}: ${active ? 'Active' : 'Inactive'}`);
        }

        console.log(`\n⏱️  Total time: ${duration}ms`);
        console.log(`💾 Cached: ${context.cached ? 'Yes' : 'No'}`);

        // Success!
        console.log('\n✅ Enhanced Page Analysis test completed!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run test
testEnhancedAnalysis();

