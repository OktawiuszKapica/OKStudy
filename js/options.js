// AI Study Stealth - Options Script

let selectedModel = 'gemini-3-flash-preview';

// Load saved settings
chrome.storage.sync.get('stealthSettings', (result) => {
  if (result.stealthSettings?.geminiApiKey) {
    document.getElementById('apiKey').value = result.stealthSettings.geminiApiKey;
  }
  if (result.stealthSettings?.model) {
    selectedModel = result.stealthSettings.model;
    document.querySelectorAll('.model-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.model === selectedModel);
    });
  }
});

// Model selector
document.querySelectorAll('.model-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.model-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedModel = btn.dataset.model;
  });
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  
  await chrome.storage.sync.set({
    stealthSettings: {
      geminiApiKey: apiKey,
      model: selectedModel
    }
  });
  
  const status = document.getElementById('status');
  status.classList.add('success');
  setTimeout(() => {
    status.classList.remove('success');
  }, 2000);
});
