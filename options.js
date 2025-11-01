const defaultUrl = 'http://34.238.160.197:3000'; // AWS ECS Backend (updated 2025-11-01)

function saveOptions() {
  const url = document.getElementById('backendUrl').value;
  const openaiKey = document.getElementById('openaiKey').value;
  
  // Use chrome.storage.sync for cross-browser compatibility (Chrome/Firefox)
  const dataToSave = { backendUrl: url || defaultUrl };
  
  // Only save API key if provided
  if (openaiKey && openaiKey.trim()) {
    dataToSave.openaiKey = openaiKey.trim();
  }
  
  chrome.storage.sync.set(dataToSave, () => {
    const status = document.getElementById('status');
    status.textContent = 'Settings saved! ' + (openaiKey ? 'AI features enabled!' : '');
    status.style.color = '#4CAF50';
    setTimeout(() => {
      status.textContent = '';
    }, 3000);
  });
}

function restoreOptions() {
  // Use chrome.storage.sync for cross-browser compatibility (Chrome/Firefox)
  chrome.storage.sync.get({ backendUrl: defaultUrl, openaiKey: '' }, (items) => {
    document.getElementById('backendUrl').value = items.backendUrl;
    if (items.openaiKey) {
      document.getElementById('openaiKey').value = items.openaiKey;
    }
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveButton').addEventListener('click', saveOptions);

// Load logo image using chrome.runtime.getURL for extension context
function loadLogo() {
    const logoImg = document.getElementById('logo-img');
    if (!logoImg) {
        console.error('Logo img element not found');
        return;
    }

    // Set initial style to prevent layout shift
    logoImg.style.visibility = 'hidden';
    logoImg.style.width = '56px';
    logoImg.style.height = '56px';
    logoImg.style.objectFit = 'contain';

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        // Try multiple paths in order - start with icon128.png which is in manifest
        const pathsToTry = [
            'icons/icon128.png',  // Primary - defined in manifest
            'icons/glippy.png',   // Secondary - web accessible
            'icons/icon128.svg'   // Tertiary fallback
        ];
        
        let attemptIndex = 0;
        
        const tryNextPath = () => {
            if (attemptIndex >= pathsToTry.length) {
                console.error('All logo paths failed');
                logoImg.style.display = 'none';
                return;
            }
            
            const path = pathsToTry[attemptIndex];
            const logoUrl = chrome.runtime.getURL(path);
            console.log(`Attempting to load logo from: ${logoUrl} (${path})`);
            
            logoImg.onload = () => {
                console.log('✅ Logo loaded successfully from:', logoUrl);
                logoImg.style.visibility = 'visible';
            };
            
            logoImg.onerror = () => {
                console.warn('❌ Failed to load:', logoUrl);
                attemptIndex++;
                tryNextPath();
            };
            
            logoImg.src = logoUrl;
        };
        
        tryNextPath();
    } else {
        // Fallback for non-extension context (testing)
        console.log('Chrome runtime not available, using fallback path');
        logoImg.src = 'icons/icon128.png';
        logoImg.onload = () => {
            logoImg.style.visibility = 'visible';
        };
        logoImg.onerror = () => {
            console.error('Fallback logo path also failed');
            logoImg.style.display = 'none';
        };
    }
}

// Initialize logo when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadLogo);
} else {
    loadLogo();
}
