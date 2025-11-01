// background.js - Service Worker for Tooltip Companion

// Function to create/update context menu items
function createContextMenu() {
    // Remove existing items to avoid duplicates
    chrome.contextMenus.removeAll(() => {
        // Create context menu items (tooltips always enabled, no toggle needed)
        chrome.contextMenus.create({
            id: 'precrawl-links',
            title: 'Precrawl Links (Cache Screenshots)',
            contexts: ['all']
        });
        
        chrome.contextMenus.create({
            id: 'refresh-cache',
            title: 'Refresh Cache (Clear & Reload)',
            contexts: ['all']
        });
        
        console.log('✅ Context menu created');
    });
}

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('Tooltip Companion installed');
    createContextMenu();
});

// Create context menu when service worker starts (runs on every reload)
console.log('🚀 Tooltip Companion service worker starting...');
try {
    createContextMenu();
} catch (error) {
    console.error('❌ Error creating context menu:', error);
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'precrawl-links') {
        console.log('Precrawling links...');
        
        // Send message to current tab to trigger precrawl
        if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
                action: 'precrawl-links'
            }).then(() => {
                console.log('✅ Precrawl triggered');
            }).catch(() => {
                console.error('❌ Failed to trigger precrawl - reload the page');
            });
        }
    }
    else if (info.menuItemId === 'refresh-cache') {
        console.log('Refreshing cache...');
        
        // Clear IndexedDB for all tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'refresh-cache'
                }).catch(() => {
                    // Ignore errors for tabs that don't have content script
                });
            });
        });
    }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Background received message:', request.action);
    
    if (request.action === 'chat') {
        console.log('💬 Forwarding chat message to backend...');
        console.log('🔹 Message:', request.message);
        console.log('🔹 URL:', request.url);
        console.log('🔹 API Key present:', request.openaiKey ? 'Yes' : 'No');
        console.log('🔹 Tooltip history items:', request.tooltipHistory ? request.tooltipHistory.length : 0);
        
        // Get backend URL from storage (defaults to AWS backend, allows localhost override)
        chrome.storage.sync.get({ backendUrl: 'http://54.211.114.152:3000' }, (storageItems) => {
            const backendUrl = storageItems.backendUrl || 'http://54.211.114.152:3000';
            
            fetch(`${backendUrl}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: request.message,
                url: request.url,
                consoleLogs: request.consoleLogs,
                pageInfo: request.pageInfo,
                tooltipHistory: request.tooltipHistory,
                openaiKey: request.openaiKey
            })
        })
        .then(res => {
            console.log('🔹 Fetch response status:', res.status);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            return res.json();
        })
        .then(data => {
            console.log('✅ Chat response received from backend:', data);
            console.log('📤 Sending response back to content script...');
            // Backend returns 'response' field, not 'reply'
            sendResponse({ reply: data.response || data.reply || 'No response from backend' });
        })
        .catch(error => {
            console.error('❌ Chat error:', error);
            console.error('Error stack:', error.stack);
            sendResponse({ reply: `Error: ${error.message}. Backend may be down or CORS issue.` });
        });
    });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'transcribe') {
        console.log('🎤 Forwarding transcription to backend...');
        
        // Get backend URL from storage
        chrome.storage.sync.get({ backendUrl: 'http://54.211.114.152:3000' }, (storageItems) => {
            const backendUrl = storageItems.backendUrl || 'http://54.211.114.152:3000';
            
            fetch(`${backendUrl}/transcribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: request.audio,
                openaiKey: request.openaiKey
            })
        })
        .then(res => res.json())
        .then(data => {
            console.log('✅ Transcription received');
            sendResponse({ text: data.text });
        })
        .catch(error => {
            console.error('❌ Transcription error:', error);
            sendResponse({ text: null, error: 'Transcription service unavailable.' });
        });
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'parse-key') {
        console.log('🔑 Forwarding API key parsing request to backend...');
        console.log('🔹 Text length:', request.text ? request.text.length : 0);
        
        // Get backend URL from storage
        chrome.storage.sync.get({ backendUrl: 'http://localhost:3000' }, (items) => {
            const backendUrl = items.backendUrl.replace(/\/$/, '');
            
            fetch(`${backendUrl}/parse-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: request.text
                })
            })
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                return res.json();
            })
            .then(data => {
                console.log('✅ API key parsed:', data.api_key ? 'Found' : 'Not found');
                sendResponse(data);
            })
            .catch(error => {
                console.error('❌ Parse key error:', error);
                sendResponse({ 
                    error: error.message,
                    api_key: 'NOT_FOUND'
                });
            });
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'fetch-screenshot') {
        // Proxy screenshot request through background script to avoid Mixed Content issues
        // Background scripts can make HTTP requests even when page is HTTPS
        console.log('📸 Fetching screenshot from backend (proxying through background)...');
        console.log('🔹 URL:', request.url);
        
        // Keep message channel open for async response
        const sendResponseAsync = (response) => {
            try {
                if (chrome.runtime.lastError) {
                    console.error('❌ Runtime error sending response:', chrome.runtime.lastError);
                } else {
                    sendResponse(response);
                }
            } catch (error) {
                console.error('❌ Error sending response:', error);
            }
        };
        
        // Get backend URL from storage
        chrome.storage.sync.get({ backendUrl: 'http://18.232.131.174:3000' }, (storageItems) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Storage error:', chrome.runtime.lastError);
                sendResponseAsync({ 
                    success: false, 
                    error: chrome.runtime.lastError.message 
                });
                return;
            }
            
            const backendUrl = storageItems.backendUrl || 'http://18.232.131.174:3000';
            
            fetch(`${backendUrl}/capture`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: request.url })
            })
            .then(async res => {
                console.log('📸 Backend response status:', res.status);
                if (!res.ok) {
                    let errorDetails = `HTTP error! status: ${res.status}`;
                    try {
                        const errorText = await res.text();
                        if (errorText) {
                            errorDetails += ` - ${errorText.substring(0, 200)}`;
                        }
                    } catch (e) {
                        // If can't read error body, just use status
                    }
                    throw new Error(errorDetails);
                }
                return res.json();
            })
            .then(data => {
                console.log('✅ Screenshot data received from backend');
                sendResponseAsync({ success: true, data: data });
            })
            .catch(error => {
                console.error('❌ Screenshot fetch error:', error);
                sendResponseAsync({ 
                    success: false, 
                    error: error.message,
                    backendUrl: backendUrl
                });
            });
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'ocr-upload') {
        // Proxy OCR upload request through background script to avoid Mixed Content issues
        console.log('📝 Uploading image for OCR (proxying through background)...');
        console.log('🔹 Image data length:', request.image ? request.image.length : 0);
        
        // Keep message channel open for async response
        const sendResponseAsync = (response) => {
            try {
                if (chrome.runtime.lastError) {
                    console.error('❌ Runtime error sending response:', chrome.runtime.lastError);
                } else {
                    sendResponse(response);
                }
            } catch (error) {
                console.error('❌ Error sending response:', error);
            }
        };
        
        // Get backend URL from storage
        chrome.storage.sync.get({ backendUrl: 'http://18.232.131.174:3000' }, (storageItems) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Storage error:', chrome.runtime.lastError);
                sendResponseAsync({ 
                    success: false, 
                    error: chrome.runtime.lastError.message 
                });
                return;
            }
            
            const backendUrl = storageItems.backendUrl || 'http://18.232.131.174:3000';
            
            fetch(`${backendUrl}/ocr-upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image: request.image })
            })
            .then(res => {
                console.log('📝 OCR upload response status:', res.status);
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                console.log('✅ OCR result received from backend');
                sendResponseAsync({ success: true, data: data });
            })
            .catch(error => {
                console.error('❌ OCR upload error:', error);
                sendResponseAsync({ 
                    success: false, 
                    error: error.message,
                    backendUrl: backendUrl
                });
            });
        });
        
        return true; // Keep message channel open for async response
    }
    else if (request.action === 'capture-screenshot') {
        console.log('📸 Capturing screenshot of current tab...');
        
        // Get the current active tab first to ensure we have the right context
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Tab query error:', chrome.runtime.lastError.message);
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }
            
            if (!tabs || tabs.length === 0) {
                sendResponse({ error: 'No active tab found' });
                return;
            }
            
            const tab = tabs[0];
            console.log('📸 Capturing from tab:', tab.url);
            
            // Get current window
            chrome.windows.getCurrent((window) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Window error:', chrome.runtime.lastError.message);
                    sendResponse({ error: chrome.runtime.lastError.message });
                    return;
                }
                
                // Capture visible tab with explicit window ID
                chrome.tabs.captureVisibleTab(window ? window.id : null, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ Screenshot error:', chrome.runtime.lastError.message);
                        sendResponse({ error: chrome.runtime.lastError.message });
                        return;
                    }
                    
                    if (!dataUrl) {
                        sendResponse({ error: 'Failed to capture screenshot - no data returned' });
                        return;
                    }
                    
                    console.log('✅ Screenshot captured successfully');
                    sendResponse({ screenshot: dataUrl });
                });
            });
        });
        
        return true; // Keep message channel open for async response
    }
});

// Handle extension icon click - open options
if (chrome.action && chrome.action.onClicked) {
    chrome.action.onClicked.addListener(() => {
        chrome.runtime.openOptionsPage();
    });
} else {
    console.log('⚠️ chrome.action API not available');
}

