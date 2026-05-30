// OKStudy - Content Script
// Screenshot-based approach - Gemini sees the screen and finds the answer.

(function() {
  'use strict';

  // Set to true only when diagnosing problems (keeps console clean + private).
  const DEBUG = false;
  function dbg(...args) { if (DEBUG) console.log(...args); }

  let isProcessing = false;
  let cancelled = false;
  let currentMode = 'tutor';  // 'tutor' (default) explains; 'express' = short answer

  // Neutral, non-descriptive class name so it doesn't stand out in the DOM.
  const TOAST_CLASS = 'oks-note';

  // Inject the toast style. NEAR-INVISIBLE by design: no background, no pill,
  // just a tiny faint grey text tucked into the bottom-right corner. If you
  // don't know it's there, you won't notice it. A whisper-thin shadow keeps it
  // *barely* legible on both light and dark pages without drawing the eye.
  const style = document.createElement('style');
  style.textContent = `
    .${TOAST_CLASS} {
      position: fixed;
      bottom: 4px;
      right: 6px;
      background: transparent;
      color: rgba(140, 140, 140, 0.5);
      padding: 0;
      font-size: 11px;
      font-weight: 400;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.3;
      text-shadow: 0 0 1px rgba(0, 0, 0, 0.35);
      z-index: 2147483647;
      max-width: min(320px, 60vw);
      max-height: 38vh;
      overflow-y: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      text-align: right;
      pointer-events: none;
    }
    /* TUTOR mode: a visible, readable card centered at the bottom. */
    .${TOAST_CLASS}.oks-wide {
      bottom: 22px;
      right: auto;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.92);
      color: #f1f5f9;
      padding: 14px 18px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
      font-size: 14px;
      font-weight: 500;
      line-height: 1.5;
      text-shadow: none;
      text-align: left;
      max-width: min(560px, 90vw);
      max-height: 60vh;
      pointer-events: auto;   /* allow scrolling long explanations with the mouse */
    }
    /* Formatting inside the tutor card (rendered from simple markdown). */
    .${TOAST_CLASS}.oks-wide .oks-h {
      font-weight: 700;
      font-size: 14px;
      color: #ffffff;
      margin: 12px 0 4px;
    }
    .${TOAST_CLASS}.oks-wide .oks-h:first-child { margin-top: 0; }
    .${TOAST_CLASS}.oks-wide .oks-p { margin: 6px 0; }
    .${TOAST_CLASS}.oks-wide .oks-ul { margin: 4px 0 4px 4px; padding: 0; list-style: none; }
    .${TOAST_CLASS}.oks-wide .oks-ul li { margin: 3px 0; padding-left: 16px; position: relative; }
    .${TOAST_CLASS}.oks-wide .oks-ul li::before {
      content: "•"; color: #22c55e; position: absolute; left: 2px;
    }
    .${TOAST_CLASS}.oks-wide strong { color: #22c55e; font-weight: 700; }
    .${TOAST_CLASS}.oks-wide em { font-style: italic; color: #cbd5e1; }
    .${TOAST_CLASS}.oks-wide .oks-hr {
      border: none; border-top: 1px solid rgba(255, 255, 255, 0.15); margin: 10px 0;
    }
    .${TOAST_CLASS}.oks-wide code {
      background: rgba(255, 255, 255, 0.1); border-radius: 4px;
      padding: 1px 5px; font-size: 13px;
    }
  `;
  document.head.appendChild(style);

  // Load the saved mode once at startup (settings persist in storage.sync).
  chrome.storage.sync.get('stealthSettings', (r) => {
    if (r.stealthSettings?.mode === 'express') currentMode = 'express';
  });

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'solve' && request.screenshot) {
      handleSolve(request.screenshot, request.useInternet);
    }
    if (request.action === 'showAnswer' && request.answer) {
      // Repeat a stored answer (respect the current mode)
      if (currentMode === 'tutor') {
        showMessage(renderTutor(request.answer), tutorDuration(request.answer), true, true);
      } else {
        displayAnswer(parseResponse(request.answer));
      }
    }
    if (request.action === 'cancel') {
      // User pressed Alt+K - stop and clear everything
      cancelled = true;
      isProcessing = false;
      const existing = document.querySelector('.' + TOAST_CLASS);
      if (existing) existing.remove();
      showMessage('✕', 700);
    }
    if (request.action === 'copyAnswer' && request.text) {
      // User held Alt+P - copy to clipboard (full text in tutor, value in express)
      const toCopy = currentMode === 'tutor'
        ? request.text.trim()
        : (parseResponse(request.text).answer || request.text);
      copyToClipboard(toCopy);
    }
    if (request.action === 'modelChanged' && request.label) {
      showMessage(request.label, 900);
    }
    if (request.action === 'error') {
      showMessage('❌ ' + request.message, 2000);
    }
  });

  function copyToClipboard(text) {
    const done = () => showMessage('📋', 600);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else {
        fallbackCopy(text, done);
      }
    } catch (e) {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) {
      // give up silently
    }
  }

  async function handleSolve(screenshot, useInternet) {
    if (isProcessing) return;
    isProcessing = true;
    cancelled = false;

    // Brief mode indicator (disappears quickly)
    showMessage(useInternet ? '🌐' : '⚡', 1000);

    try {
      const result = await chrome.storage.sync.get('stealthSettings');
      const apiKey = result.stealthSettings?.geminiApiKey;
      const MODEL_MIGRATION = {
        'gemini-3-flash-preview': 'gemini-3.5-flash',
        'gemini-3-pro-preview': 'gemini-3.1-pro-preview'
      };
      const savedModel = result.stealthSettings?.model;
      const model = MODEL_MIGRATION[savedModel] || savedModel || 'gemini-3.5-flash';
      currentMode = result.stealthSettings?.mode === 'express' ? 'express' : 'tutor';

      if (!apiKey) {
        showMessage('⚠️ Brak klucza API', 3000);
        isProcessing = false;
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'callGeminiVision',
        screenshot: screenshot,
        apiKey: apiKey,
        model: model,
        useInternet: useInternet,
        mode: currentMode
      });

      // If the user cancelled while we were waiting, drop the result silently
      if (cancelled) {
        isProcessing = false;
        return;
      }

      if (response.success) {
        dbg('AI response received');
        if (currentMode === 'tutor') {
          showMessage(renderTutor(response.data), tutorDuration(response.data), true, true);
        } else {
          displayAnswer(parseResponse(response.data));
        }
      } else if (response.cancelled) {
        // Aborted by user - stay quiet
      } else if (response.timedOut) {
        // Request hung and auto-aborted after the timeout
        showMessage('⏱️ Za długo - spróbuj ponownie', 3000);
      } else {
        dbg('API error:', response.error);
        showMessage('❌ ' + (response.error || 'Błąd'), 5000);
      }

    } catch (error) {
      dbg('Error:', error);
      if (!cancelled) showMessage('❌ ' + error.message, 5000);
    }

    isProcessing = false;
  }

  function parseResponse(text) {
    // Expected format:
    //   TYP: zamknięte/otwarte/prawda-fałsz
    //   ODPOWIEDŹ: A, C, D  OR  a: 0.93, b: 0.07  OR  PRAWDA
    const typeMatch = text.match(/TYP:\s*(zamkni[eę]te|otwarte|prawda-fa[lł]sz)/i);
    const answerMatch = text.match(/ODPOWIED[ŹZ]:\s*(.+?)(?:\n|$)/i);

    const type = typeMatch ? typeMatch[1].toLowerCase() : 'unknown';
    let answer = answerMatch ? answerMatch[1].trim() : null;

    // Fallback: model ignored the format -> use the first meaningful line so
    // we still show *something* instead of "no answer".
    if (!answer) {
      const firstLine = text
        .replace(/^\s*TYP:.*$/im, '')      // drop a stray TYP: line if present
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)[0];
      answer = firstLine || (text.trim() || null);
    }

    // For closed questions, pull out letters
    let letters = [];
    if (type.includes('zamkni') && answer) {
      letters = answer.toUpperCase().match(/[A-F]/g) || [];
    }

    return { type, answer, letters, raw: text };
  }

  function displayAnswer(parsed) {
    if (!parsed.answer) {
      showMessage('🤔 Brak odpowiedzi', 2000);
      return;
    }

    let displayText;
    if (parsed.type.includes('zamkni') && parsed.letters.length > 0) {
      displayText = `✓ ${parsed.letters.join(', ')}`;
    } else if (parsed.type.includes('prawda')) {
      displayText = `✓ ${parsed.answer.toUpperCase()}`;
    } else {
      displayText = `✓ ${parsed.answer}`;
    }

    // Longer answers linger a bit longer so they can be read
    const duration = displayText.length > 40 ? 6000 : 4000;
    showMessage(displayText, duration);
  }

  // Tutor explanations are longer - keep them on screen long enough to read.
  function tutorDuration(text) {
    return Math.min(25000, Math.max(8000, (text || '').length * 60));
  }

  function showMessage(text, duration = 2000, wide = false, html = false) {
    const existing = document.querySelector('.' + TOAST_CLASS);
    if (existing) existing.remove();

    const msg = document.createElement('div');
    msg.className = TOAST_CLASS + (wide ? ' oks-wide' : '');
    if (html) {
      msg.innerHTML = text;   // only ever fed renderTutor() output (pre-escaped)
    } else {
      msg.textContent = text;
    }
    document.body.appendChild(msg);

    if (duration > 0) {
      setTimeout(() => msg.remove(), duration);
    }
    return msg;
  }

  // Escape first, THEN add our own tags -> safe to use with innerHTML.
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Inline markdown: **bold**, *italic*, `code`.
  function renderInline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  // Minimal, safe markdown -> HTML renderer for the tutor explanation.
  function renderTutor(raw) {
    const lines = escapeHtml((raw || '').trim()).split('\n');
    let html = '';
    let inList = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

    for (const line of lines) {
      const t = line.trim();
      if (!t) { closeList(); continue; }

      if (/^-{3,}$/.test(t) || /^_{3,}$/.test(t)) { closeList(); html += '<hr class="oks-hr">'; continue; }

      const heading = t.match(/^#{1,6}\s+(.*)$/);
      if (heading) { closeList(); html += '<div class="oks-h">' + renderInline(heading[1]) + '</div>'; continue; }

      const bullet = t.match(/^[*\-]\s+(.*)$/);
      if (bullet) {
        if (!inList) { html += '<ul class="oks-ul">'; inList = true; }
        html += '<li>' + renderInline(bullet[1]) + '</li>';
        continue;
      }

      closeList();
      html += '<div class="oks-p">' + renderInline(t) + '</div>';
    }
    closeList();
    return html;
  }

})();
