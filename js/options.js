// AI Study Stealth - Options Script

let selectedModel = 'gemini-3.5-flash';
let selectedMode = 'tutor';

// Map retired model ids to current ones
const MODEL_MIGRATION = {
  'gemini-3-flash-preview': 'gemini-3.5-flash',
  'gemini-3-pro-preview': 'gemini-3.1-pro-preview'
};

// Load saved settings
chrome.storage.sync.get('stealthSettings', (result) => {
  if (result.stealthSettings?.geminiApiKey) {
    document.getElementById('apiKey').value = result.stealthSettings.geminiApiKey;
  }
  if (result.stealthSettings?.model) {
    selectedModel = MODEL_MIGRATION[result.stealthSettings.model] || result.stealthSettings.model;
    document.querySelectorAll('[data-model]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.model === selectedModel);
    });
  }
  if (result.stealthSettings?.mode) {
    selectedMode = result.stealthSettings.mode === 'express' ? 'express' : 'tutor';
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === selectedMode);
    });
  }
});

// Model selector
document.querySelectorAll('[data-model]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-model]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedModel = btn.dataset.model;
  });
});

// Mode selector (Tłumacz / Express)
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();

  await chrome.storage.sync.set({
    stealthSettings: {
      geminiApiKey: apiKey,
      model: selectedModel,
      mode: selectedMode
    }
  });

  const status = document.getElementById('status');
  status.classList.add('success');
  setTimeout(() => {
    status.classList.remove('success');
  }, 2000);
});

// Friendly error messages for the connection test
function friendlyError(status, rawText) {
  const t = (rawText || '').toLowerCase();
  if (status === 400 && (t.includes('api_key_invalid') || t.includes('api key not valid'))) {
    return '🔑 Nieprawidłowy klucz API';
  }
  if (status === 400) return '⚠️ Błędne zapytanie - sprawdź klucz lub model';
  if (status === 401 || status === 403) return '🚫 Brak dostępu - sprawdź klucz i uprawnienia';
  if (status === 404) return '🔍 Ten model jest niedostępny dla Twojego klucza';
  if (status === 429) return '⏳ Limit zapytań - odczekaj chwilę';
  if (status >= 500) return '🛠️ Serwer Gemini przeciążony - spróbuj ponownie';
  return '❌ Błąd ' + status;
}

function showTestStatus(text, ok) {
  const el = document.getElementById('testStatus');
  el.textContent = text;
  el.style.display = 'block';
  el.style.background = ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)';
  el.style.color = ok ? '#22c55e' : '#f87171';
}

// Test API key + model with a tiny request
document.getElementById('testBtn').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    showTestStatus('⚠️ Najpierw wklej klucz API', false);
    return;
  }

  showTestStatus('⏳ Sprawdzam…', true);
  document.getElementById('testStatus').style.color = '#94a3b8';
  document.getElementById('testStatus').style.background = 'rgba(255,255,255,0.05)';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
      }
    );

    if (response.ok) {
      const modelName = selectedModel.includes('pro') ? 'Pro' : 'Flash';
      showTestStatus(`✅ Klucz działa - model ${modelName} OK`, true);
    } else {
      const errorText = await response.text();
      showTestStatus(friendlyError(response.status, errorText), false);
    }
  } catch (e) {
    showTestStatus('❌ Brak połączenia z API', false);
  }
});
