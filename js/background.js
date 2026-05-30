// OKStudy - Background Service Worker (multi-provider: Gemini / Claude / OpenAI)

// ---- Debug -----------------------------------------------------------------
const DEBUG = false;
function dbg(...args) { if (DEBUG) console.log(...args); }

// ---- Timeout ---------------------------------------------------------------
const REQUEST_TIMEOUT_MS = 30000; // give up on a hung request after 30s

// ---- Providers & models ----------------------------------------------------
const PROVIDERS = {
  gemini: { models: ['gemini-3.5-flash', 'gemini-3.1-pro-preview'] },
  claude: { models: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-8'] },
  openai: { models: ['gpt-5-mini', 'gpt-5.5'] },
  grok:   { models: ['grok-4', 'grok-4-fast'] }
};
function defaultModel(provider) { return PROVIDERS[provider]?.models[0] || PROVIDERS.gemini.models[0]; }

// Map retired Gemini ids to current ones (auto-migration of old settings)
const MODEL_MIGRATION = {
  'gemini-3-flash-preview': 'gemini-3.5-flash',
  'gemini-3-pro-preview': 'gemini-3.1-pro-preview'
};
function normalizeModel(provider, model) {
  if (provider === 'gemini') return MODEL_MIGRATION[model] || model || defaultModel('gemini');
  return model || defaultModel(provider);
}

// A short, human label for the on-screen "model changed" toast.
function modelShortLabel(model) {
  if (!model) return '';
  if (model.includes('gemini')) {
    if (model.includes('pro')) return '🧠 Gemini Pro';
    return '⚡ Gemini Flash';
  }
  if (model.includes('claude')) {
    if (model.includes('opus')) return '🧠 Claude Opus';
    if (model.includes('haiku')) return '⚡ Claude Haiku';
    return '🎯 Claude Sonnet';
  }
  if (model.includes('gpt-5-mini')) return '⚡ GPT-5 mini';
  if (model.includes('gpt')) return '🧠 GPT-5.5';
  if (model.includes('grok')) {
    if (model.includes('fast')) return '⚡ Grok fast';
    return '🧠 Grok 4';
  }
  return model;
}

// ---- State -----------------------------------------------------------------
let currentController = null;  // AbortController for the in-flight request
let lastShownText = null;      // last answer actually shown (cache for hold-to-copy)

// Hold-detection for Alt+P (auto-repeat = "hold to copy")
let lastRepeatTs = 0;
let holdCount = 0;
let copiedThisHold = false;

const HISTORY_MAX = 5;
const HOLD_GAP_MS = 150;
const HOLD_TRIGGER = 4;

// History lives in chrome.storage.session because the MV3 worker is killed
// after ~30s idle, which would wipe in-memory state and break Alt+P.
const HISTORY_KEY = 'oksHistory';

async function loadHistory() {
  try {
    const r = await chrome.storage.session.get(HISTORY_KEY);
    return r[HISTORY_KEY] || { items: [], idx: 0 };
  } catch (e) {
    return { items: [], idx: 0 };
  }
}
async function saveHistory(h) {
  try { await chrome.storage.session.set({ [HISTORY_KEY]: h }); } catch (e) { /* ignore */ }
}
async function pushAnswer(text) {
  const h = await loadHistory();
  h.items.unshift(text);
  if (h.items.length > HISTORY_MAX) h.items.pop();
  h.idx = 0;
  await saveHistory(h);
  lastShownText = text;
}

// ---- Gemini daily usage counter --------------------------------------------
// Only Gemini has a meaningful free daily quota, so we only track it. The day
// key uses US Pacific time because that's when Google resets RPD (midnight PT).
function pacificDayKey() {
  // en-CA gives YYYY-MM-DD; the timeZone option shifts it to Pacific.
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}
async function bumpGeminiUsage() {
  try {
    const day = pacificDayKey();
    const r = await chrome.storage.local.get('geminiUsage');
    const u = r.geminiUsage || {};
    u.count = (u.day === day) ? (u.count || 0) + 1 : 1;
    u.day = day;
    await chrome.storage.local.set({ geminiUsage: u });
  } catch (e) { /* ignore */ }
}

// ---- Open options when the toolbar icon is clicked -------------------------
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// ---- Keyboard commands -----------------------------------------------------
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // solve_alt is a backup shortcut (no default key) - behaves like solve_fast.
  if (command === 'solve_fast' || command === 'solve_internet' || command === 'solve_alt') {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'solve',
          screenshot: dataUrl,
          useInternet: command === 'solve_internet'
        });
      } catch (e) {
        dbg('Cannot run on this page');
      }
    } catch (error) {
      dbg('Screenshot error:', error);
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'error',
          message: 'Nie udało się zrobić zrzutu - odśwież stronę i spróbuj ponownie'
        });
      } catch (e) { /* content script not loaded */ }
    }
  }

  if (command === 'repeat_last') {
    const h = await loadHistory();
    if (h.items.length === 0) return;

    const now = Date.now();
    const gap = now - lastRepeatTs;
    lastRepeatTs = now;

    if (gap < HOLD_GAP_MS) {
      holdCount++;
      if (holdCount >= HOLD_TRIGGER && !copiedThisHold) {
        copiedThisHold = true;
        const text = (lastShownText != null) ? lastShownText : h.items[0];
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'copyAnswer', text });
        } catch (e) { /* content script not loaded */ }
      }
      return;
    }

    holdCount = 0;
    copiedThisHold = false;

    const idx = h.idx % h.items.length;
    const ans = h.items[idx];
    lastShownText = ans;
    h.idx = (h.idx + 1) % h.items.length;
    await saveHistory(h);

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'showAnswer', answer: ans });
    } catch (e) { /* content script not loaded */ }
  }

  if (command === 'cancel') {
    if (currentController) {
      currentController.abort();
      currentController = null;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'cancel' });
    } catch (e) { /* content script not loaded */ }
  }

  // Alt+M: cycle to the next model within the ACTIVE provider.
  if (command === 'toggle_model') {
    const result = await chrome.storage.sync.get('stealthSettings');
    const settings = result.stealthSettings || {};
    const provider = settings.provider || 'gemini';
    const list = PROVIDERS[provider]?.models || PROVIDERS.gemini.models;

    settings.models = settings.models || {};
    const current = normalizeModel(provider, settings.models[provider]);
    const i = list.indexOf(current);
    const next = list[(i + 1) % list.length];
    settings.models[provider] = next;
    await chrome.storage.sync.set({ stealthSettings: settings });

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'modelChanged', label: modelShortLabel(next) });
    } catch (e) { /* content script not loaded */ }
  }
});

// ---- API request handling --------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'callGeminiVision') {   // action name kept for compat
    handleVisionRequest(request, sendResponse);
    return true; // keep the message channel open for async sendResponse
  }
});

async function handleVisionRequest(request, sendResponse) {
  const controller = new AbortController();
  currentController = controller;
  const timeoutId = setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);

  const provider = PROVIDERS[request.provider] ? request.provider : 'gemini';
  // useInternet (Google Search grounding) is Gemini-only.
  const model = normalizeModel(provider, request.model);
  const mode = request.mode === 'express' ? 'express' : 'tutor';
  // Google Search grounding is Gemini-only; ignore "internet" for others.
  const useInternet = !!request.useInternet && provider === 'gemini';

  try {
    let data;
    let fallback = false;

    try {
      data = await callWithRetry(provider, request.screenshot, request.apiKey, model, useInternet, mode, controller.signal);
    } catch (error) {
      if (error.name === 'AbortError') throw error;

      // Gemini internet mode failed for a non-key reason (search is paid-only
      // on the free tier) -> retry once WITHOUT search so user still gets an answer.
      if (useInternet && !isApiKeyError(error) && !controller.signal.aborted) {
        dbg('Internet mode failed, falling back to offline:', error.message);
        data = await callWithRetry(provider, request.screenshot, request.apiKey, model, false, mode, controller.signal);
        fallback = true;
      } else {
        throw error;
      }
    }

    await pushAnswer(data);
    if (provider === 'gemini') await bumpGeminiUsage();
    sendResponse({ success: true, data, fallback });
  } catch (error) {
    if (error.name === 'AbortError') {
      if (controller.signal.reason === 'timeout') {
        sendResponse({ success: false, timedOut: true });
      } else {
        sendResponse({ success: false, cancelled: true });
      }
    } else {
      sendResponse({ success: false, error: error.friendly || error.message });
    }
  } finally {
    clearTimeout(timeoutId);
    if (currentController === controller) currentController = null;
  }
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [0, 2000, 4000];

function abortError() {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function isApiKeyError(error) {
  const t = (error.raw || error.message || '').toLowerCase();
  return error.status === 401 ||
         t.includes('api_key_invalid') ||
         t.includes('api key not valid') ||
         t.includes('invalid_api_key') ||
         t.includes('authentication');
}

function friendlyError(status, rawText) {
  const t = (rawText || '').toLowerCase();
  if (status === 400 && (t.includes('api_key_invalid') || t.includes('api key not valid'))) {
    return '🔑 Nieprawidłowy klucz API';
  }
  if (status === 400) return '⚠️ Błędne zapytanie - sprawdź klucz lub model';
  if (status === 401 || status === 403) return '🚫 Brak dostępu - sprawdź klucz API i uprawnienia';
  if (status === 404) return '🔍 Model niedostępny dla tego klucza';
  if (status === 429) return '⏳ Limit zapytań - odczekaj chwilę lub spróbuj jutro';
  if (status >= 500) return '🛠️ Serwer przeciążony - spróbuj ponownie';
  return '❌ Błąd ' + status;
}

function httpError(status, rawText) {
  const err = new Error('API ' + status);
  err.status = status;
  err.raw = rawText;
  err.friendly = friendlyError(status, rawText);
  return err;
}

// ---- Shared prompt builder -------------------------------------------------
function buildPrompt(mode, useInternet) {
  const isTutor = mode !== 'express';
  if (isTutor) {
    return `Jesteś cierpliwym korepetytorem. Na zrzucie ekranu widzisz pytanie lub zadanie.

IGNORUJ: menu, nawigację, przyciski, banery, sidebary - skup się TYLKO na pytaniu/zadaniu.

Twoim celem jest NAUCZYĆ, jak dojść do rozwiązania - prowadzisz ucznia, nie podajesz gołego wyniku.

ZASADY:
- Wyjaśnij KROK PO KROKU, jak rozwiązać zadanie, prostym i zrozumiałym językiem.
- Jeśli to matematyka lub obliczenia - pokaż tok rozumowania i użyte wzory.
- Bądź zwięzły: maksymalnie kilka krótkich kroków.
- Jeśli wymaga aktualnych informacji - ${useInternet ? 'skorzystaj z wyszukiwarki Google' : 'odpowiedz na podstawie wiedzy'}.
- Na końcu dodaj krótkie podsumowanie zaczynające się od "Wniosek:".

Odpowiedz po polsku.`;
  }
  return `Jesteś ekspertem od testów. Na zrzucie ekranu widzisz stronę z testem/quizem.

IGNORUJ: menu, nawigację, przyciski, bannery, sidebary - skup się TYLKO na pytaniu testowym.

ROZPOZNAJ TYP PYTANIA:

1. PYTANIE ZAMKNIĘTE (wybór A/B/C/D/E/F):
   - Może być JEDNA lub WIĘCEJ poprawnych odpowiedzi
   - ODPOWIEDŹ: podaj litery, np. "A" lub "A, C, D"

2. PYTANIA OTWARTE (pola tekstowe do wpisania):
   - Może być WIELE pytań otwartych na ekranie (a, b, c, d, e, f, g...)
   - ODPOWIEDŹ: podaj WSZYSTKIE odpowiedzi w formacie "a: wartość, b: wartość, c: wartość..."
   - Przykład: "a: 0.9341, b: 0.0659, c: 0.1481, d: 0.4931"

3. PRAWDA/FAŁSZ:
   - ODPOWIEDŹ: "PRAWDA" lub "FAŁSZ"

ZASADY:
- Przeanalizuj DOKŁADNIE treść pytania/pytań
- Jeśli matematyka - OBLICZ dokładnie każdą wartość
- Jeśli wymaga aktualnych informacji - ${useInternet ? 'UŻYJ WYSZUKIWARKI GOOGLE' : 'odpowiedz na podstawie wiedzy'}
- Jeśli nie wiesz - napisz "NIE WIEM"

FORMAT ODPOWIEDZI:
TYP: [zamknięte/otwarte/prawda-fałsz]
ODPOWIEDŹ: [litery LUB wszystkie wartości w formacie "a: X, b: Y, c: Z" LUB prawda/fałsz]`;
}

// ---- Retry wrapper (dispatches to the right provider) ----------------------
async function callWithRetry(provider, screenshot, apiKey, model, useInternet, mode, signal) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw abortError();
    try {
      if (attempt > 0) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, RETRY_DELAYS[attempt]);
          signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
        });
      }
      return await callProvider(provider, screenshot, apiKey, model, useInternet, mode, signal);
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError') throw error;
      const retryable =
        error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503 ||
        (error.raw || '').toLowerCase().includes('overloaded') ||
        (error.raw || '').toLowerCase().includes('rate');
      if (!retryable || attempt === MAX_RETRIES - 1) throw error;
      dbg(`Retry ${attempt + 1}/${MAX_RETRIES}:`, error.message);
    }
  }
  throw lastError;
}

function callProvider(provider, screenshot, apiKey, model, useInternet, mode, signal) {
  const prompt = buildPrompt(mode, useInternet);
  const base64 = screenshot.split(',')[1];   // raw base64 (Gemini, Claude)
  if (provider === 'claude') return callClaude(prompt, base64, apiKey, model, signal);
  if (provider === 'openai') return callOpenAICompatible('https://api.openai.com/v1/chat/completions', prompt, screenshot, apiKey, model, signal);
  if (provider === 'grok') return callOpenAICompatible('https://api.x.ai/v1/chat/completions', prompt, screenshot, apiKey, model, signal);
  return callGemini(prompt, base64, apiKey, model, useInternet, mode, signal);
}

// ---- Adapter: Gemini -------------------------------------------------------
async function callGemini(prompt, base64Image, apiKey, model, useInternet, mode, signal) {
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/png', data: base64Image } }
      ]
    }],
    generationConfig: { temperature: mode === 'express' ? 0.1 : 0.3 }
  };
  if (useInternet) body.tools = [{ google_search: {} }];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }
  );
  if (!res.ok) throw httpError(res.status, await res.text());
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ---- Adapter: Claude (Anthropic Messages API) ------------------------------
async function callClaude(prompt, base64Image, apiKey, model, signal) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Image } }
        ]
      }]
    }),
    signal
  });
  if (!res.ok) throw httpError(res.status, await res.text());
  const data = await res.json();
  // content is an array of blocks; collect the text ones.
  if (Array.isArray(data.content)) {
    return data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  }
  return '';
}

// ---- Adapter: OpenAI-compatible (used by both ChatGPT and Grok) ------------
// Grok exposes an OpenAI-compatible endpoint, so the same request shape works;
// only the URL differs. We omit `temperature` because the GPT-5 family rejects
// custom values, and Grok is fine with the default too.
async function callOpenAICompatible(endpoint, prompt, dataUrl, apiKey, model, signal) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }]
    }),
    signal
  });
  if (!res.ok) throw httpError(res.status, await res.text());
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
