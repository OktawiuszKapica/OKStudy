// OKStudy - Background Service Worker

// ---- Debug -----------------------------------------------------------------
// Set to true only when diagnosing problems. Keeps the console clean (and
// avoids leaking answers/internal labels) during normal use.
const DEBUG = false;
function dbg(...args) { if (DEBUG) console.log(...args); }

// ---- Timeout ---------------------------------------------------------------
const REQUEST_TIMEOUT_MS = 30000; // give up on a hung request after 30s

// ---- Model constants -------------------------------------------------------
const FLASH = 'gemini-3.5-flash';
const PRO = 'gemini-3.1-pro-preview';

// Map retired model ids to current ones (auto-migration)
const MODEL_MIGRATION = {
  'gemini-3-flash-preview': FLASH,
  'gemini-3-pro-preview': PRO
};
function normalizeModel(model) {
  if (!model) return FLASH;
  return MODEL_MIGRATION[model] || model;
}

// ---- State -----------------------------------------------------------------
let currentController = null;  // AbortController for the in-flight request
let lastShownText = null;      // last answer actually shown (cache for hold-to-copy)

// Hold-detection for Alt+P (auto-repeat = "hold to copy")
let lastRepeatTs = 0;
let holdCount = 0;
let copiedThisHold = false;

const HISTORY_MAX = 5;
const HOLD_GAP_MS = 150;   // gaps shorter than this = key auto-repeat (holding)
const HOLD_TRIGGER = 4;    // this many fast fires in a row = copy

// History is kept in chrome.storage.session (NOT plain variables) because the
// MV3 service worker is killed after ~30s idle, which would wipe in-memory
// state and break Alt+P. storage.session survives worker restarts.
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
      // Screenshot failed (restricted page, lost permission, etc.) - tell the
      // user instead of silently doing nothing.
      dbg('Screenshot error:', error);
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'error',
          message: 'Nie udało się zrobić zrzutu - odśwież stronę i spróbuj ponownie'
        });
      } catch (e) { /* content script not loaded - cannot show anything here */ }
    }
  }

  if (command === 'repeat_last') {
    const h = await loadHistory();
    if (h.items.length === 0) return;

    const now = Date.now();
    const gap = now - lastRepeatTs;
    lastRepeatTs = now;

    if (gap < HOLD_GAP_MS) {
      // Key is being held down (OS auto-repeat) -> copy current answer once
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

    // Deliberate press -> step through history (newest -> older -> wrap)
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

  if (command === 'toggle_model') {
    const result = await chrome.storage.sync.get('stealthSettings');
    const settings = result.stealthSettings || {};
    const current = normalizeModel(settings.model);
    const next = current.includes('pro') ? FLASH : PRO;
    settings.model = next;
    await chrome.storage.sync.set({ stealthSettings: settings });

    const label = next.includes('pro') ? '🧠 Pro' : '⚡ Flash';
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'modelChanged', label });
    } catch (e) { /* content script not loaded */ }
  }
});

// ---- API request handling --------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'callGeminiVision') {
    handleVisionRequest(request, sendResponse);
    return true; // keep the message channel open for async sendResponse
  }
});

async function handleVisionRequest(request, sendResponse) {
  const controller = new AbortController();
  currentController = controller;

  // Auto-abort if the request hangs too long. We mark the reason so we can
  // tell a timeout apart from a user-initiated cancel (Alt+K).
  const timeoutId = setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);

  const model = normalizeModel(request.model);
  const mode = request.mode === 'express' ? 'express' : 'tutor';

  try {
    let data;
    let fallback = false;

    try {
      data = await callGeminiVisionWithRetry(
        request.screenshot, request.apiKey, model, request.useInternet, mode, controller.signal
      );
    } catch (error) {
      if (error.name === 'AbortError') throw error;

      // Internet mode failed for a non-key reason (e.g. google_search is
      // paid-only on the free tier) -> retry once WITHOUT search so the user
      // still gets an answer instead of an error.
      if (request.useInternet && !isApiKeyError(error) && !controller.signal.aborted) {
        dbg('Internet mode failed, falling back to offline:', error.message);
        data = await callGeminiVisionWithRetry(
          request.screenshot, request.apiKey, model, false, mode, controller.signal
        );
        fallback = true;
      } else {
        throw error;
      }
    }

    await pushAnswer(data);
    sendResponse({ success: true, data, fallback });
  } catch (error) {
    if (error.name === 'AbortError') {
      // Distinguish "timed out on its own" from "user pressed Alt+K"
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
         t.includes('api key not valid');
}

function friendlyError(status, rawText) {
  const t = (rawText || '').toLowerCase();
  if (status === 400 && (t.includes('api_key_invalid') || t.includes('api key not valid'))) {
    return '🔑 Nieprawidłowy klucz API';
  }
  if (status === 400) return '⚠️ Błędne zapytanie - sprawdź klucz lub model';
  if (status === 401 || status === 403) return '🚫 Brak dostępu - sprawdź klucz API i uprawnienia';
  if (status === 404) return '🔍 Model niedostępny dla tego klucza';
  if (status === 429) return '⏳ Limit zapytań - odczekaj chwilę';
  if (status >= 500) return '🛠️ Serwer Gemini przeciążony - spróbuj ponownie';
  return '❌ Błąd ' + status;
}

async function callGeminiVisionWithRetry(screenshot, apiKey, model, useInternet, mode, signal) {
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw abortError();

    try {
      if (attempt > 0) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, RETRY_DELAYS[attempt]);
          signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(abortError());
          }, { once: true });
        });
      }

      return await callGeminiVisionAPI(screenshot, apiKey, model, useInternet, mode, signal);
    } catch (error) {
      lastError = error;

      if (error.name === 'AbortError') throw error;

      const isRetryable =
        error.status === 429 ||
        error.status === 500 ||
        error.status === 502 ||
        error.status === 503 ||
        (error.raw || '').toLowerCase().includes('overloaded') ||
        (error.raw || '').toLowerCase().includes('rate');

      if (!isRetryable || attempt === MAX_RETRIES - 1) throw error;

      dbg(`Retry ${attempt + 1}/${MAX_RETRIES} after error:`, error.message);
    }
  }

  throw lastError;
}

async function callGeminiVisionAPI(screenshotDataUrl, apiKey, model, useInternet, mode, signal) {
  const modelId = model || FLASH;
  const base64Image = screenshotDataUrl.split(',')[1];
  const isTutor = mode !== 'express';

  // TUTOR (default): teach how to get to the answer, step by step.
  const tutorPrompt = `Jesteś cierpliwym korepetytorem. Na zrzucie ekranu widzisz pytanie lub zadanie.

IGNORUJ: menu, nawigację, przyciski, banery, sidebary - skup się TYLKO na pytaniu/zadaniu.

Twoim celem jest NAUCZYĆ, jak dojść do rozwiązania - prowadzisz ucznia, nie podajesz gołego wyniku.

ZASADY:
- Wyjaśnij KROK PO KROKU, jak rozwiązać zadanie, prostym i zrozumiałym językiem.
- Jeśli to matematyka lub obliczenia - pokaż tok rozumowania i użyte wzory.
- Bądź zwięzły: maksymalnie kilka krótkich kroków.
- Jeśli wymaga aktualnych informacji - ${useInternet ? 'skorzystaj z wyszukiwarki Google' : 'odpowiedz na podstawie wiedzy'}.
- Na końcu dodaj krótkie podsumowanie zaczynające się od "Wniosek:".

Odpowiedz po polsku.`;

  // EXPRESS (optional): just the answer, in a compact parseable format.
  const expressPrompt = `Jesteś ekspertem od testów. Na zrzucie ekranu widzisz stronę z testem/quizem.

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

  const requestBody = {
    contents: [{
      parts: [
        { text: isTutor ? tutorPrompt : expressPrompt },
        {
          inline_data: {
            mime_type: 'image/png',
            data: base64Image
          }
        }
      ]
    }],
    generationConfig: {
      temperature: isTutor ? 0.3 : 0.1
    }
  };

  if (useInternet) {
    requestBody.tools = [{ google_search: {} }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: signal
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`API ${response.status}`);
    err.status = response.status;
    err.raw = errorText;
    err.friendly = friendlyError(response.status, errorText);
    throw err;
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
