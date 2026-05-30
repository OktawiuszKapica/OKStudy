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
  let currentPos = 'br';      // express position: br/bl/tr/tl/bc
  let voiceOn = false;        // read the answer aloud (Web Speech API)

  // Neutral, non-descriptive class name so it doesn't stand out in the DOM.
  const TOAST_CLASS = 'oks-note';

  // Maps the saved position to its CSS modifier class (br = bare default).
  const POS_CLASS = { br: '', bl: 'oks-bl', tr: 'oks-tr', tl: 'oks-tl', bc: 'oks-bc' };

  // The note lives in a closed Shadow DOM attached to <html> (documentElement),
  // NOT <body>. Why: if any page ancestor has transform/filter/perspective,
  // `position: fixed` is measured against THAT box instead of the viewport - so
  // at >100% browser zoom a body-mounted note gets pushed off-screen. Mounting
  // on the root element makes positioning reliably viewport-relative at any
  // zoom, and isolates us from the page's CSS.
  // NEAR-INVISIBLE by design: faint grey text, no background, tucked in a corner.
  let shadowRoot = null;
  const STYLE_CSS = `
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
    /* EXPRESS position variants (default = bottom-right above). */
    .${TOAST_CLASS}.oks-bl { left: 6px; right: auto; text-align: left; }
    .${TOAST_CLASS}.oks-tr { top: 4px; bottom: auto; }
    .${TOAST_CLASS}.oks-tl { top: 4px; bottom: auto; left: 6px; right: auto; text-align: left; }
    .${TOAST_CLASS}.oks-bc { left: 50%; right: auto; transform: translateX(-50%); text-align: center; }
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

  // Lazily build (or rebuild, if an SPA wiped it) the shadow host on <html>.
  function ensureRoot() {
    if (shadowRoot && document.documentElement.contains(shadowRoot.host)) return shadowRoot;
    const host = document.createElement('div');
    host.style.cssText = 'all: initial;';   // no transform / stacking context of its own
    shadowRoot = host.attachShadow({ mode: 'closed' });
    const s = document.createElement('style');
    s.textContent = STYLE_CSS;
    shadowRoot.appendChild(s);
    document.documentElement.appendChild(host);
    return shadowRoot;
  }

  // Load saved settings once at startup (they persist in storage.sync).
  chrome.storage.sync.get('stealthSettings', (r) => {
    if (r.stealthSettings?.mode === 'express') currentMode = 'express';
    if (r.stealthSettings?.pos && POS_CLASS.hasOwnProperty(r.stealthSettings.pos)) {
      currentPos = r.stealthSettings.pos;
    }
    voiceOn = !!r.stealthSettings?.voice;
  });

  // Speak text aloud in Polish via the browser's built-in synthesizer.
  // Chrome's speechSynthesis is notoriously flaky on the FIRST call:
  //  - getVoices() is empty until voices load asynchronously,
  //  - the engine "sleeps" after idle and silently ignores speak(),
  //  - cancel() immediately before speak() can kill the new utterance.
  // We work around all three below.

  let voicesReady = false;
  function primeVoices() {
    try {
      if (!('speechSynthesis' in window)) return;
      if (window.speechSynthesis.getVoices().length) voicesReady = true;
      // voiceschanged fires once the list is populated
      window.speechSynthesis.onvoiceschanged = () => {
        if (window.speechSynthesis.getVoices().length) voicesReady = true;
      };
    } catch (e) { /* ignore */ }
  }
  primeVoices();

  function pickPolishVoice() {
    try {
      const vs = window.speechSynthesis.getVoices() || [];
      return vs.find(v => /pl[-_]?PL/i.test(v.lang)) ||
             vs.find(v => /^pl/i.test(v.lang)) || null;
    } catch (e) { return null; }
  }

  function doSpeak(text) {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'pl-PL';
    u.rate = 1.0;
    const v = pickPolishVoice();
    if (v) u.voice = v;
    // Wake the engine if Chrome put it to sleep, then speak.
    try { synth.resume(); } catch (e) { /* ignore */ }
    synth.speak(u);
  }

  function speak(text) {
    try {
      if (!('speechSynthesis' in window) || !text) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      // If voices aren't loaded yet (first run), wait a tick so the very first
      // utterance isn't swallowed. Otherwise speak on a 0ms timeout to dodge
      // the cancel()->speak() race.
      const delay = voicesReady ? 0 : 250;
      setTimeout(() => { try { doSpeak(text); } catch (e) { /* ignore */ } }, delay);
    } catch (e) { /* ignore */ }
  }
  function stopSpeaking() {
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  // Pull the short spoken phrase out of a tutor answer: the "Wniosek:" line.
  function extractConclusion(raw) {
    const m = (raw || '').match(/Wniosek:\s*([\s\S]+)/i);
    let t = m ? m[1] : (raw || '');
    // strip markdown so the synthesizer doesn't read asterisks/hashes
    return t.replace(/[*#`>_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'solve' && request.screenshot) {
      handleSolve(request.screenshot, request.useInternet);
    }
    if (request.action === 'showAnswer' && request.answer) {
      // Repeat a stored answer (respect current mode + voice setting)
      if (voiceOn) {
        if (currentMode === 'tutor') {
          speak(extractConclusion(request.answer));
        } else {
          const p = parseResponse(request.answer);
          speak((p.letters.length ? p.letters.join(', ') : p.answer) || '');
        }
      } else if (currentMode === 'tutor') {
        showMessage(renderTutor(request.answer), tutorDuration(request.answer), true, true);
      } else {
        displayAnswer(parseResponse(request.answer));
      }
    }
    if (request.action === 'cancel') {
      // User pressed Alt+K - stop everything (clear bubble AND stop speaking)
      cancelled = true;
      isProcessing = false;
      stopSpeaking();
      const existing = ensureRoot().querySelector('.' + TOAST_CLASS);
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
      showMessage('❌ ' + request.message, 4500);
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
      const s = result.stealthSettings || {};

      const DEFAULTS = {
        gemini: 'gemini-3.5-flash',
        claude: 'claude-sonnet-4-6',
        openai: 'gpt-5-mini',
        grok: 'grok-4'
      };
      const GEMINI_MIGRATION = {
        'gemini-3-flash-preview': 'gemini-3.5-flash',
        'gemini-3-pro-preview': 'gemini-3.1-pro-preview'
      };

      const provider = ['gemini', 'claude', 'openai', 'grok'].includes(s.provider) ? s.provider : 'gemini';

      // Key + model: new per-provider maps, with legacy single fields as gemini fallback.
      const keys = s.keys || {};
      const apiKey = keys[provider] || (provider === 'gemini' ? s.geminiApiKey : '') || '';

      const models = s.models || {};
      let model = models[provider] || (provider === 'gemini' ? s.model : '') || DEFAULTS[provider];
      if (provider === 'gemini') model = GEMINI_MIGRATION[model] || model;

      currentMode = s.mode === 'express' ? 'express' : 'tutor';
      if (s.pos && POS_CLASS.hasOwnProperty(s.pos)) currentPos = s.pos;
      voiceOn = !!s.voice;

      if (!apiKey) {
        const NAMES = { gemini: 'Gemini', claude: 'Claude', openai: 'ChatGPT', grok: 'Grok' };
        showMessage('⚠️ Brak klucza API (' + (NAMES[provider] || provider) + ')', 3000);
        isProcessing = false;
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'callGeminiVision',
        screenshot: screenshot,
        provider: provider,
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
        if (voiceOn) {
          // Voice mode: speak only, no on-screen bubble (max screen discretion).
          if (currentMode === 'tutor') {
            speak(extractConclusion(response.data));
          } else {
            const p = parseResponse(response.data);
            speak((p.letters.length ? p.letters.join(', ') : p.answer) || '');
          }
        } else if (currentMode === 'tutor') {
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
    const root = ensureRoot();
    const existing = root.querySelector('.' + TOAST_CLASS);
    if (existing) existing.remove();

    const msg = document.createElement('div');
    // Position only applies to express (non-wide) notes; tutor card is always centered.
    const posClass = (!wide && POS_CLASS[currentPos]) ? ' ' + POS_CLASS[currentPos] : '';
    msg.className = TOAST_CLASS + (wide ? ' oks-wide' : posClass);
    if (html) {
      msg.innerHTML = text;   // only ever fed renderTutor() output (pre-escaped)
    } else {
      msg.textContent = text;
    }
    root.appendChild(msg);

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
