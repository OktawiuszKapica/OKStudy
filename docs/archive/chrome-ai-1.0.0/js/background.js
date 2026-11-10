// AI Study Assistant - Background Service Worker

// Handle messages from content scripts AND popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Screenshot capture from content script
  if (request.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 })
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  // Open sidebar from popup
  if (request.action === 'openSidebar' && request.tabId) {
    chrome.tabs.sendMessage(request.tabId, { action: 'open' })
      .then(() => sendResponse({ success: true }))
      .catch(async (error) => {
        // Try to inject content script first
        try {
          await chrome.scripting.executeScript({
            target: { tabId: request.tabId },
            files: ['js/content.js']
          });
          await chrome.scripting.insertCSS({
            target: { tabId: request.tabId },
            files: ['css/content.css']
          });
          // Wait and retry
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(request.tabId, { action: 'open' });
              sendResponse({ success: true });
            } catch (e) {
              sendResponse({ error: e.message });
            }
          }, 300);
        } catch (e) {
          sendResponse({ error: 'Nie można załadować na tej stronie' });
        }
      });
    return true;
  }
  
  return false;
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
  } catch {
    console.log('Content script not loaded yet');
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-sidebar' && tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    } catch {
      console.log('Content script not loaded');
    }
  }
});

// Context menu for quick access
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai-assistant-open',
    title: '🤖 Zapytaj AI Study Assistant',
    contexts: ['page', 'selection', 'image']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ai-assistant-open' && tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { action: 'open' });
  }
});

console.log('AI Study Assistant background script loaded');
