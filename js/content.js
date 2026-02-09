// AI Study Stealth - Content Script
// Screenshot-based approach - Gemini sees the screen and finds the answer

(function() {
  'use strict';

  let isProcessing = false;
  let lastDisplayedAnswer = null;

  // Inject minimal CSS for highlighting
  const style = document.createElement('style');
  style.textContent = `
    .ai-stealth-highlight {
      background: rgba(34, 197, 94, 0.08) !important;
      border-radius: 3px;
      transition: background 0.3s ease;
    }
    .ai-stealth-highlight-strong {
      background: rgba(34, 197, 94, 0.12) !important;
      outline: 1px solid rgba(34, 197, 94, 0.2);
      border-radius: 3px;
    }
    .ai-stealth-processing {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      z-index: 999999;
      max-width: 90%;
      text-align: center;
    }
  `;
  document.head.appendChild(style);

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'solve' && request.screenshot) {
      handleSolve(request.screenshot, request.useInternet);
    }
    if (request.action === 'showAnswer' && request.answer) {
      // Repeat last answer
      const parsed = parseResponse(request.answer);
      displayAnswer(parsed);
    }
    if (request.action === 'error') {
      showMessage('❌ ' + request.message, 2000);
    }
  });

  async function handleSolve(screenshot, useInternet) {
    if (isProcessing) return;
    isProcessing = true;

    // Show brief processing indicator (disappears after 1 second)
    const modeIcon = useInternet ? '🌐' : '⚡';
    showMessage(`${modeIcon}`, 1000);

    try {
      // Get API key and model
      const result = await chrome.storage.sync.get('stealthSettings');
      const apiKey = result.stealthSettings?.geminiApiKey;
      const model = result.stealthSettings?.model || 'gemini-3-flash-preview';
      
      if (!apiKey) {
        showMessage('⚠️ Brak klucza API', 3000);
        isProcessing = false;
        return;
      }

      // Call Gemini Vision API
      const response = await chrome.runtime.sendMessage({
        action: 'callGeminiVision',
        screenshot: screenshot,
        apiKey: apiKey,
        model: model,
        useInternet: useInternet
      });

      if (response.success) {
        console.log('[Stealth] AI response:', response.data);
        const parsed = parseResponse(response.data);
        displayAnswer(parsed);
      } else {
        console.error('[Stealth] API error:', response.error);
        showMessage('❌ ' + (response.error || 'Błąd'), 5000);
      }

    } catch (error) {
      console.error('[Stealth] Error:', error);
      showMessage('❌ ' + error.message, 5000);
    }

    isProcessing = false;
  }

  function parseResponse(text) {
    // Parse new format:
    // TYP: zamknięte/otwarte/prawda-fałsz
    // ODPOWIEDŹ: A, C, D  OR  0.9341  OR  PRAWDA
    
    const typeMatch = text.match(/TYP:\s*(zamkni[eę]te|otwarte|prawda-fa[lł]sz)/i);
    const answerMatch = text.match(/ODPOWIED[ŹZ]:\s*(.+?)(?:\n|$)/i);
    
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'unknown';
    let answer = answerMatch ? answerMatch[1].trim() : null;
    
    // For closed questions, extract letters
    let letters = [];
    if (type.includes('zamkni') && answer) {
      letters = answer.toUpperCase().match(/[A-F]/g) || [];
    }
    
    return {
      type: type,
      answer: answer,
      letters: letters,
      raw: text
    };
  }

  function displayAnswer(parsed) {
    if (!parsed.answer) {
      showMessage('🤔 Brak odpowiedzi', 2000);
      return;
    }
    
    lastDisplayedAnswer = parsed;
    
    // Format display based on type
    let displayText;
    
    if (parsed.type.includes('zamkni') && parsed.letters.length > 0) {
      // Closed question - show letters
      displayText = `✓ ${parsed.letters.join(', ')}`;
    } else if (parsed.type.includes('prawda')) {
      // True/false
      displayText = `✓ ${parsed.answer.toUpperCase()}`;
    } else {
      // Open question or unknown - show the value
      displayText = `✓ ${parsed.answer}`;
    }
    
    showMessage(displayText, 4000);
  }

  function showMessage(text, duration = 2000) {
    // Remove any existing messages
    const existing = document.querySelector('.ai-stealth-processing');
    if (existing) existing.remove();
    
    const msg = document.createElement('div');
    msg.className = 'ai-stealth-processing';
    msg.textContent = text;
    document.body.appendChild(msg);

    if (duration > 0) {
      setTimeout(() => msg.remove(), duration);
    }
    
    return msg;
  }

})();
