// AI Study Stealth - Background Service Worker

// Store last answer for repeat function
let lastAnswer = null;

// Listen for keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'solve_fast' || command === 'solve_internet') {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'solve',
          screenshot: dataUrl,
          useInternet: command === 'solve_internet'
        });
      } catch (e) {
        // Content script not loaded on this page - ignore silently
        console.log('[Stealth] Cannot run on this page');
      }
    } catch (error) {
      console.error('Screenshot error:', error);
    }
  }
  
  if (command === 'repeat_last') {
    if (lastAnswer) {
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'showAnswer',
          answer: lastAnswer
        });
      } catch (e) {
        // Content script not loaded - ignore
      }
    }
  }
});

// Handle API calls from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'callGeminiVision') {
    callGeminiVisionWithRetry(request.screenshot, request.apiKey, request.model, request.useInternet)
      .then(response => {
        // Store answer for repeat function
        lastAnswer = response;
        sendResponse({ success: true, data: response });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

const MAX_RETRIES = 3;
const RETRY_DELAYS = [0, 2000, 4000];

async function callGeminiVisionWithRetry(screenshot, apiKey, model, useInternet) {
  let lastError;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
      
      return await callGeminiVisionAPI(screenshot, apiKey, model, useInternet);
    } catch (error) {
      lastError = error;
      
      const isRetryable = 
        error.message.includes('503') ||
        error.message.includes('429') ||
        error.message.includes('500') ||
        error.message.includes('502') ||
        error.message.toLowerCase().includes('overloaded') ||
        error.message.toLowerCase().includes('rate');
      
      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        throw error;
      }
      
      console.log(`[Stealth] Retry ${attempt + 1}/${MAX_RETRIES} after error:`, error.message);
    }
  }
  
  throw lastError;
}

async function callGeminiVisionAPI(screenshotDataUrl, apiKey, model, useInternet) {
  const modelId = model || 'gemini-3-flash-preview';
  
  const base64Image = screenshotDataUrl.split(',')[1];
  
  const requestBody = {
    contents: [{
      parts: [
        {
          text: `Jesteś ekspertem od testów. Na zrzucie ekranu widzisz stronę z testem/quizem.

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
ODPOWIEDŹ: [litery LUB wszystkie wartości w formacie "a: X, b: Y, c: Z" LUB prawda/fałsz]`
        },
        {
          inline_data: {
            mime_type: 'image/png',
            data: base64Image
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1
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
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
