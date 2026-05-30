// OKStudy - Options Script (multi-provider)

// ---- Provider config (drives the UI) ---------------------------------------
const PROVIDERS = {
  gemini: {
    keyLabel: 'Klucz API Gemini',
    keyPlaceholder: 'AIza...',
    keyHint: 'Pobierz: <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a> (darmowy)',
    models: [
      { id: 'gemini-3.5-flash', icon: '⚡', name: 'Gemini 3.5 Flash', desc: 'Mądry (darmowy ~20/dzień)' },
      { id: 'gemini-3.1-pro-preview', icon: '🧠', name: 'Gemini 3.1 Pro', desc: 'Maks. moc' }
    ]
  },
  claude: {
    keyLabel: 'Klucz API Claude',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Pobierz: <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a> (wymaga karty)',
    models: [
      { id: 'claude-sonnet-4-6', icon: '🎯', name: 'Sonnet 4.6', desc: 'Zbalansowany' },
      { id: 'claude-haiku-4-5', icon: '⚡', name: 'Haiku 4.5', desc: 'Szybki, tańszy' },
      { id: 'claude-opus-4-8', icon: '🧠', name: 'Opus 4.8', desc: 'Maks. moc' }
    ]
  },
  openai: {
    keyLabel: 'Klucz API ChatGPT',
    keyPlaceholder: 'sk-...',
    keyHint: 'Pobierz: <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a> (wymaga karty)',
    models: [
      { id: 'gpt-5-mini', icon: '⚡', name: 'GPT-5 mini', desc: 'Szybki, tańszy' },
      { id: 'gpt-5.5', icon: '🧠', name: 'GPT-5.5', desc: 'Maks. moc' }
    ]
  },
  grok: {
    keyLabel: 'Klucz API Grok (xAI)',
    keyPlaceholder: 'xai-...',
    keyHint: 'Pobierz: <a href="https://console.x.ai" target="_blank">console.x.ai</a> (wymaga karty)',
    models: [
      { id: 'grok-4', icon: '🧠', name: 'Grok 4', desc: 'Maks. moc' },
      { id: 'grok-4-fast', icon: '⚡', name: 'Grok 4 Fast', desc: 'Szybki, tańszy' }
    ]
  }
};
const GEMINI_MIGRATION = {
  'gemini-3-flash-preview': 'gemini-3.5-flash',
  'gemini-3-pro-preview': 'gemini-3.1-pro-preview'
};
function defaultModel(p) { return PROVIDERS[p].models[0].id; }

// ---- State -----------------------------------------------------------------
let selectedProvider = 'gemini';
let keys = { gemini: '', claude: '', openai: '', grok: '' };
let models = {
  gemini: defaultModel('gemini'), claude: defaultModel('claude'),
  openai: defaultModel('openai'), grok: defaultModel('grok')
};
let selectedMode = 'tutor';
let selectedPos = 'br';
let selectedVoice = 'off';

const keyInput = document.getElementById('apiKey');

// ---- Load saved settings ---------------------------------------------------
chrome.storage.sync.get('stealthSettings', (result) => {
  const s = result.stealthSettings || {};

  if (['gemini', 'claude', 'openai', 'grok'].includes(s.provider)) selectedProvider = s.provider;

  // Keys: new per-provider map, with legacy single field as gemini fallback.
  if (s.keys) keys = Object.assign(keys, s.keys);
  if (!keys.gemini && s.geminiApiKey) keys.gemini = s.geminiApiKey;

  // Models: new per-provider map, with legacy single field as gemini fallback.
  if (s.models) models = Object.assign(models, s.models);
  if (s.model && !s.models) models.gemini = GEMINI_MIGRATION[s.model] || s.model;
  models.gemini = GEMINI_MIGRATION[models.gemini] || models.gemini;

  if (s.mode) selectedMode = s.mode === 'express' ? 'express' : 'tutor';
  if (s.pos) selectedPos = s.pos;
  selectedVoice = s.voice ? 'on' : 'off';

  // Reflect provider/mode/pos in the static buttons
  document.querySelectorAll('[data-provider]').forEach(b =>
    b.classList.toggle('active', b.dataset.provider === selectedProvider));
  document.querySelectorAll('[data-mode]').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === selectedMode));
  document.querySelectorAll('[data-pos]').forEach(b =>
    b.classList.toggle('active', b.dataset.pos === selectedPos));
  document.querySelectorAll('[data-voice]').forEach(b =>
    b.classList.toggle('active', b.dataset.voice === selectedVoice));

  renderProvider();
  updatePosState();
});

// Voice selector (Tekst / Głos)
document.querySelectorAll('[data-voice]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-voice]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedVoice = btn.dataset.voice;
  });
});

// ---- Render the key field + model buttons for the active provider ----------
function renderProvider() {
  const cfg = PROVIDERS[selectedProvider];
  document.getElementById('keyLabel').textContent = cfg.keyLabel;
  document.getElementById('keyHint').innerHTML = cfg.keyHint;
  keyInput.placeholder = cfg.keyPlaceholder;
  keyInput.value = keys[selectedProvider] || '';

  updateUsageLine();

  const sel = document.getElementById('modelSelector');
  sel.innerHTML = '';
  cfg.models.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'model-option' + (m.id === models[selectedProvider] ? ' active' : '');
    btn.dataset.model = m.id;
    btn.innerHTML =
      `<span class="model-icon">${m.icon}</span>` +
      `<span class="model-name">${m.name}</span>` +
      `<span class="model-desc">${m.desc}</span>`;
    btn.addEventListener('click', () => {
      models[selectedProvider] = m.id;
      sel.querySelectorAll('.model-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    sel.appendChild(btn);
  });
}

// Keep the typed key tied to the current provider as you type.
keyInput.addEventListener('input', () => { keys[selectedProvider] = keyInput.value.trim(); });

// Show today's Gemini usage (only Gemini has a daily free quota worth tracking).
function updateUsageLine() {
  const line = document.getElementById('usageLine');
  if (!line) return;
  if (selectedProvider !== 'gemini') { line.style.display = 'none'; return; }

  chrome.storage.local.get('geminiUsage', (r) => {
    const u = r.geminiUsage || {};
    // Pacific "today" - same basis Google uses for the daily reset.
    let today;
    try { today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()); }
    catch (e) { today = new Date().toISOString().slice(0, 10); }
    const count = (u.day === today) ? (u.count || 0) : 0;

    line.style.display = 'block';
    line.textContent = `Dziś użyto: ${count} zapytań Gemini (limit darmowy resetuje się o 9:00).`;
  });
}

// ---- Provider selector -----------------------------------------------------
document.querySelectorAll('[data-provider]').forEach(btn => {
  btn.addEventListener('click', () => {
    keys[selectedProvider] = keyInput.value.trim();   // save current before switching
    document.querySelectorAll('[data-provider]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedProvider = btn.dataset.provider;
    renderProvider();
  });
});

// ---- Mode selector ---------------------------------------------------------
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
    updatePosState();
  });
});

// ---- Position selector (Express only) --------------------------------------
document.querySelectorAll('[data-pos]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-pos]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedPos = btn.dataset.pos;
  });
});

function updatePosState() {
  const card = document.getElementById('posCard');
  if (card) card.classList.toggle('dimmed', selectedMode !== 'express');
}

// ---- Save ------------------------------------------------------------------
document.getElementById('saveBtn').addEventListener('click', async () => {
  keys[selectedProvider] = keyInput.value.trim();

  await chrome.storage.sync.set({
    stealthSettings: {
      provider: selectedProvider,
      keys: keys,
      models: models,
      mode: selectedMode,
      pos: selectedPos,
      voice: selectedVoice === 'on',
      // legacy mirror so older builds still find a Gemini key
      geminiApiKey: keys.gemini,
      model: models.gemini
    }
  });

  const status = document.getElementById('status');
  status.classList.add('success');
  setTimeout(() => status.classList.remove('success'), 2000);
});

// ---- Connection test (per provider) ----------------------------------------
function friendlyError(status, rawText) {
  const t = (rawText || '').toLowerCase();
  // Insufficient funds: Claude returns this as a 400, OpenAI/Grok as 429.
  if (t.includes('credit balance is too low') || t.includes('insufficient_quota') ||
      t.includes('insufficient credits') || t.includes('billing')) {
    return '💳 Klucz OK, ale konto bez środków - doładuj konto API';
  }
  if (t.includes('api_key_invalid') || t.includes('api key not valid') ||
      t.includes('invalid_api_key') || t.includes('incorrect api key')) {
    return '🔑 Nieprawidłowy klucz API';
  }
  if (status === 400) return '⚠️ Błędne zapytanie - sprawdź klucz lub model';
  if (status === 401) return '🔑 Nieprawidłowy klucz API';
  if (status === 403) return '🚫 Brak dostępu - sprawdź klucz i uprawnienia';
  if (status === 404) return '🔍 Ten model jest niedostępny dla Twojego klucza';
  if (status === 429) return '⏳ Limit zapytań lub brak środków - odczekaj lub doładuj';
  if (status >= 500) return '🛠️ Serwer przeciążony - spróbuj ponownie';
  return '❌ Błąd ' + status;
}

function showTestStatus(text, ok) {
  const el = document.getElementById('testStatus');
  el.textContent = text;
  el.style.display = 'block';
  el.style.background = ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)';
  el.style.color = ok ? '#22c55e' : '#f87171';
}

async function testProvider(provider, apiKey, model) {
  if (provider === 'gemini') {
    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
    });
  }
  if (provider === 'claude') {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
    });
  }
  // openai + grok share the OpenAI-compatible shape; only the endpoint differs.
  const endpoint = provider === 'grok'
    ? 'https://api.x.ai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model: model, messages: [{ role: 'user', content: 'ping' }], max_completion_tokens: 1 })
  });
}

document.getElementById('testBtn').addEventListener('click', async () => {
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    showTestStatus('⚠️ Najpierw wklej klucz API', false);
    return;
  }

  showTestStatus('⏳ Sprawdzam…', true);
  const el = document.getElementById('testStatus');
  el.style.color = '#94a3b8';
  el.style.background = 'rgba(255,255,255,0.05)';

  const model = models[selectedProvider];
  try {
    const response = await testProvider(selectedProvider, apiKey, model);
    if (response.ok) {
      showTestStatus('✅ Klucz działa - ' + model + ' OK', true);
    } else {
      const errorText = await response.text();
      showTestStatus(friendlyError(response.status, errorText), false);
    }
  } catch (e) {
    showTestStatus('❌ Brak połączenia z API', false);
  }
});

// ---- Check GitHub for a newer version --------------------------------------
// Reads the raw manifest.json from the repo's main branch and compares its
// version to the installed one. Shows a banner if the repo is ahead.
const REPO_MANIFEST_URL = 'https://raw.githubusercontent.com/OktawiuszKapica/OKStudy/main/manifest.json';

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function checkForUpdate() {
  const installed = chrome.runtime.getManifest().version;
  try {
    const res = await fetch(REPO_MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const remote = await res.json();
    if (remote.version && compareVersions(remote.version, installed) > 0) {
      const banner = document.getElementById('updateBanner');
      const ver = document.getElementById('updateVer');
      if (ver) ver.textContent = 'v' + remote.version;
      if (banner) banner.style.display = 'block';
    }
  } catch (e) {
    // Offline or repo unreachable - just stay quiet, no banner.
  }
}
checkForUpdate();
