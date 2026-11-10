// AI Study Assistant - Popup Script

const status = document.getElementById('status');

function showStatus(message, type = 'info') {
  status.textContent = message;
  status.className = 'status ' + type;
}

// Open Sidebar button
document.getElementById('openSidebar').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      showStatus('Nie można uzyskać dostępu do karty', 'error');
      return;
    }
    
    // Check restricted pages
    const url = tab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
        url.startsWith('edge://') || url.startsWith('about:') || url === '') {
      showStatus('Użyj Ctrl+Shift+A na zwykłej stronie', 'info');
      return;
    }
    
    // Send message to content script via background
    chrome.runtime.sendMessage({ 
      action: 'openSidebar', 
      tabId: tab.id 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError);
        showStatus('Odśwież stronę i spróbuj ponownie', 'error');
      } else {
        window.close();
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    showStatus('Wystąpił błąd: ' + error.message, 'error');
  }
});

// Settings button
document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
