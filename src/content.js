import { shortAnswer } from './config.js';
import { createSystemSpeech } from './speech.js';
import { expressTheme, positionWithin } from './appearance.js';

if (!globalThis.__okstudyV2) {
  globalThis.__okstudyV2 = true;
  let host, root, noteTimer, cancelSelection;
  let currentSettings = { activityIndicator: 'full' };
  let altHeld = false;
  const expressCSS =
    '.express{animation:none}.express-label{border:1px solid var(--answer-border);border-radius:8px;padding:5px 9px;background:var(--answer-bg);text-shadow:none}.express-card{border:1px solid var(--answer-border);border-radius:14px;padding:14px 18px;background:var(--answer-bg);box-shadow:0 5px 22px #0002;text-shadow:none}.express.interactive{pointer-events:auto;cursor:grab;touch-action:none}.express.interactive:active{cursor:grabbing}';
  const speaker = createSystemSpeech((state, error) => {
    if (state === 'error') errorNotice(error, currentSettings, true);
  });
  const feedbackCSS = `.mini{width:36px;height:28px;padding:0;border-radius:9px;max-height:none;overflow:visible;box-shadow:0 2px 9px #0003;display:grid;place-items:center}.mini button{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;border-radius:8px;gap:3px;color:#bcf35a;font:700 15px/1 system-ui}.mini button:focus-visible{outline:2px solid #bcf35a;outline-offset:3px}.dot{width:3px;height:3px;background:currentColor;border-radius:50%}.mini.error{width:24px;height:24px;border-color:#c87d64}.mini.error button{color:#ffc1a8}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}@media(prefers-reduced-motion:no-preference){.dot{animation:pulse 1.1s ease-in-out infinite}.dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}@keyframes pulse{0%,70%,100%{opacity:.3;transform:translateY(0)}35%{opacity:1;transform:translateY(-2px)}}}`;
  const css = `:host{all:initial;color-scheme:dark}*{box-sizing:border-box}button{font:600 13px/1.4 system-ui;cursor:pointer;border:1px solid #4b554e;border-radius:10px;padding:10px 14px;background:#222a28;color:#f1f2ea}button:focus-visible{outline:3px solid #bcf35a;outline-offset:3px}button:disabled{opacity:.4;cursor:default}.primary{background:#bcf35a;color:#121617;border-color:#bcf35a}.note{position:fixed;z-index:2147483647;right:20px;bottom:20px;max-width:min(400px,90vw);border:1px solid #4b554e;border-radius:14px;background:#121617;color:#f1f2ea;box-shadow:0 10px 40px #0005;padding:13px 16px;font:500 14px/1.6 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;max-height:50vh;overflow:auto}.note button{margin:10px 6px 0 0}.error{border-color:#c87d64}.express{border:none;box-shadow:none;background:transparent;padding:4px;text-shadow:0 1px 3px #000;color:#e8eddc;max-width:min(460px,75vw);pointer-events:none}.selector{position:fixed;inset:0;z-index:2147483647;font:500 14px/1.5 system-ui;color:#f1f2ea;cursor:crosshair;touch-action:none;user-select:none}.freeze{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none}.selection{position:absolute;border:2px solid #bcf35a;box-shadow:0 0 0 99999px #07100bb3;pointer-events:none;border-radius:4px}.help,.toolbar{position:absolute;left:50%;transform:translateX(-50%);background:#121617;border:1px solid #4b554e;border-radius:14px;padding:12px 16px;box-shadow:0 6px 30px #0005;cursor:default;max-width:90vw}.help{top:18px;text-align:center}.help small{display:block;color:#b6c1b8;margin-top:3px}.toolbar{bottom:24px;display:flex;gap:8px;white-space:nowrap}.hidden{display:none}@media(prefers-reduced-motion:no-preference){.note{animation:enter .16s ease-out}@keyframes enter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}}`;
  function ensureRoot() {
    if (host?.isConnected) return root;
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:static;';
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css + feedbackCSS + expressCSS;
    root.append(style);
    document.documentElement.append(host);
    return root;
  }
  function clear() {
    clearTimeout(noteTimer);
    ensureRoot()
      .querySelectorAll('.note')
      .forEach((note) => note.remove());
  }
  function notice(text, error = false, duration = 6000, preserveAnswer = false) {
    if (!preserveAnswer) clear();
    const note = document.createElement('div');
    note.className = `note${error ? ' error' : ''}`;
    note.setAttribute('role', error ? 'alert' : 'status');
    note.textContent = text;
    ensureRoot().append(note);
    if (preserveAnswer) {
      note.style.top = '12px';
      note.style.bottom = 'auto';
    }
    if (duration) noteTimer = setTimeout(() => note.remove(), duration);
    return note;
  }
  function stopSpeech() {
    speaker.stop();
  }
  function errorNotice(text, settings = currentSettings, preserveAnswer = false) {
    if (settings.activityIndicator === 'full') return notice(text, true, 6000, preserveAnswer);
    const n = notice('', true, 1500, preserveAnswer);
    n.classList.add('mini');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '!';
    b.title = text;
    b.setAttribute('aria-label', `${text} Otwórz panel OKStudy.`);
    b.onclick = () => chrome.runtime.sendMessage({ type: 'openPanel' }).catch(() => {});
    const accessible = document.createElement('span');
    accessible.className = 'sr-only';
    accessible.textContent = text;
    n.append(b, accessible);
    return n;
  }
  function working(settings = currentSettings) {
    clear();
    currentSettings = settings;
    if (settings.activityIndicator === 'off') return;
    const minimal = settings.activityIndicator === 'minimal';
    const n = notice(minimal ? '' : 'OKStudy analizuje zadanie…', false, 0);
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Przerwij analizę');
    b.title = 'Analizuję zadanie. Kliknij, aby przerwać.';
    b.onclick = () => chrome.runtime.sendMessage({ type: 'cancel' }).catch(() => {});
    if (minimal) {
      n.classList.add('mini');
      n.setAttribute('aria-label', 'OKStudy analizuje zadanie');
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.setAttribute('aria-hidden', 'true');
        b.append(dot);
      }
    } else {
      b.textContent = 'Przerwij';
      n.append(document.createElement('br'));
    }
    n.append(b);
  }
  function paintAnswer(n, settings) {
    const box = n.getBoundingClientRect();
    const previous = host.style.visibility;
    host.style.visibility = 'hidden';
    let element = document.elementFromPoint(
      Math.min(innerWidth - 1, box.x + box.width / 2),
      Math.min(innerHeight - 1, box.y + box.height / 2)
    );
    const layers = [];
    while (element) {
      const values = getComputedStyle(element)
        .backgroundColor.match(/[\d.]+/g)
        ?.map(Number);
      if (values?.length >= 3) layers.push(values);
      element = element.parentElement;
    }
    host.style.visibility = previous;
    let color = [255, 255, 255];
    for (const layer of layers.reverse())
      color = color.map((value, i) => layer[i] * (layer[3] ?? 1) + value * (1 - (layer[3] ?? 1)));
    const theme = expressTheme(settings, color);
    n.style.color = theme.color;
    n.style.setProperty('--answer-bg', theme.background);
    n.style.setProperty('--answer-border', theme.border);
    n.style.textShadow = settings.expressStyle === 'text' ? theme.shadow : 'none';
  }
  function placeAnswer(n, position) {
    const box = n.getBoundingClientRect();
    const point = positionWithin(position, box.width, box.height, innerWidth, innerHeight);
    n.style.left = `${point.left}px`;
    n.style.top = `${point.top}px`;
    n.style.right = 'auto';
    n.style.bottom = 'auto';
    n.style.transform = 'none';
    n.savedPosition = position;
  }
  function bindAnswer(n, settings) {
    n.classList.toggle('interactive', altHeld);
    let drag;
    n.addEventListener('pointerdown', (event) => {
      if (!event.altKey || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const box = n.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: box.x, top: box.y, moved: false };
      n.setPointerCapture(event.pointerId);
    });
    n.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (!drag.moved) return;
      n.dataset.moved = 'true';
      const box = n.getBoundingClientRect();
      placeAnswer(n, {
        x: Math.min(1, Math.max(0, (drag.left + dx - 4) / Math.max(1, innerWidth - box.width - 8))),
        y: Math.min(1, Math.max(0, (drag.top + dy - 4) / Math.max(1, innerHeight - box.height - 8))),
      });
    });
    n.addEventListener('pointerup', (event) => {
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      n.releasePointerCapture(event.pointerId);
      if (drag.moved) {
        paintAnswer(n, settings);
        void chrome.runtime.sendMessage({ type: 'position.save', position: n.savedPosition }).catch(() => {});
      } else void chrome.runtime.sendMessage({ type: 'explain' }).catch(() => {});
      drag = null;
    });
    n.addEventListener('pointercancel', () => {
      drag = null;
    });
    void chrome.runtime
      .sendMessage({ type: 'position.load' })
      .then((result) => {
        if (!n.isConnected) return;
        if (result?.ok && result.data && !n.dataset.moved) placeAnswer(n, result.data);
        paintAnswer(n, settings);
      })
      .catch(() => {});
  }
  const setAlt = (value) => {
    altHeld = value;
    root?.querySelector('.express')?.classList.toggle('interactive', value);
  };
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Alt') setAlt(true);
    },
    true
  );
  document.addEventListener(
    'keyup',
    (event) => {
      if (!event.altKey) setAlt(false);
    },
    true
  );
  window.addEventListener('blur', () => setAlt(false));
  window.addEventListener('resize', () => {
    const n = root?.querySelector('.express');
    if (n?.savedPosition) placeAnswer(n, n.savedPosition);
    if (n) paintAnswer(n, currentSettings);
  });
  function showAnswer(text, settings) {
    clear();
    currentSettings = settings;
    if (settings.voice !== 'off' && settings.voiceEngine !== 'openai')
      speaker.speak(
        settings.mode === 'express' ? shortAnswer(text) : text.match(/Wniosek:\s*([\s\S]+)/i)?.[1] || text,
        settings
      );
    if (settings.voice === 'only') return;
    if (settings.mode !== 'express') {
      if (settings.activityIndicator !== 'full') return;
      const n = notice('Odpowiedź jest gotowa.', false, 12000);
      const b = document.createElement('button');
      b.textContent = 'Otwórz wyjaśnienie';
      b.onclick = () =>
        chrome.runtime.sendMessage({ type: 'openPanel' }).then((r) => {
          if (!r?.ok) notice(r?.error || 'Otwórz panel pod ikoną OKStudy.');
        });
      n.append(document.createElement('br'), b);
      return;
    }
    const n = notice(shortAnswer(text), false, settings.expressDuration * 1000);
    n.classList.add('express');
    if (settings.expressStyle !== 'text') n.classList.add(`express-${settings.expressStyle}`);
    n.style.maxWidth = `min(${settings.expressWidth || 460}px, calc(100vw - 16px))`;
    n.style.fontSize = `${settings.expressSize}px`;
    n.style.opacity = settings.expressOpacity;
    if (settings.pos.startsWith('t')) {
      n.style.top = '10px';
      n.style.bottom = 'auto';
    }
    if (settings.pos.endsWith('l')) {
      n.style.left = '10px';
      n.style.right = 'auto';
    }
    if (settings.pos === 'bc') {
      n.style.left = '50%';
      n.style.right = 'auto';
      n.style.transform = 'translateX(-50%)';
    }
    bindAnswer(n, settings);
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      notice('Skopiowano odpowiedź.', false, 1500);
    } catch {
      notice('Nie udało się skopiować. Użyj przycisku „Kopiuj” w panelu odpowiedzi.', true);
    }
  }
  function selectRegion(screenshot) {
    cancelSelection?.();
    clear();
    return new Promise((resolve) => {
      const oldFocus = document.activeElement,
        width = innerWidth,
        height = innerHeight;
      const layer = document.createElement('div');
      layer.className = 'selector';
      layer.setAttribute('role', 'dialog');
      layer.setAttribute('aria-modal', 'true');
      layer.setAttribute('aria-label', 'Zaznacz fragment zadania');
      const img = document.createElement('img');
      img.className = 'freeze';
      img.src = screenshot;
      img.alt = '';
      const box = document.createElement('div');
      box.className = 'selection hidden';
      const help = document.createElement('div');
      help.className = 'help';
      help.textContent = 'Przeciągnij ramkę wokół zadania';
      const small = document.createElement('small');
      small.textContent =
        'Enter: analizuj · Esc: anuluj · strzałki: przesuń · Shift + strzałki: zmień rozmiar';
      help.append(small);
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      const keyboard = document.createElement('button');
      keyboard.textContent = 'Zaznacz klawiaturą';
      const cancel = document.createElement('button');
      cancel.textContent = 'Anuluj';
      const confirm = document.createElement('button');
      confirm.className = 'primary';
      confirm.textContent = 'Analizuj fragment';
      confirm.disabled = true;
      toolbar.append(keyboard, cancel, confirm);
      layer.append(img, box, help, toolbar);
      ensureRoot().append(layer);
      let rect,
        start,
        done = false;
      const render = () => {
        box.classList.remove('hidden');
        Object.assign(box.style, {
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
        confirm.disabled = rect.width < 8 || rect.height < 8;
      };
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener('resize', resize);
        document.removeEventListener('keydown', keydown, true);
        layer.remove();
        cancelSelection = null;
        oldFocus?.focus?.({ preventScroll: true });
        resolve(value);
      };
      cancelSelection = () => finish({ cancelled: true });
      const resize = () => {
        finish({ cancelled: true });
        notice('Rozmiar strony zmienił się. Zaznacz zadanie ponownie.');
      };
      const selectDefault = () => {
        rect = { x: width * 0.2, y: height * 0.25, width: width * 0.6, height: height * 0.5 };
        render();
        confirm.focus();
      };
      const keydown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          finish({ cancelled: true });
        }
        if (e.key === 'Enter' && rect && !confirm.disabled) {
          e.preventDefault();
          e.stopImmediatePropagation();
          confirm.click();
        }
        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!rect) selectDefault();
          const d = 5,
            horizontal = ['ArrowLeft', 'ArrowRight'].includes(e.key),
            sign = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1;
          if (e.shiftKey) {
            const k = horizontal ? 'width' : 'height';
            rect[k] = Math.max(
              8,
              Math.min(horizontal ? width - rect.x : height - rect.y, rect[k] + sign * d)
            );
          } else {
            const k = horizontal ? 'x' : 'y';
            rect[k] = Math.max(
              0,
              Math.min(horizontal ? width - rect.width : height - rect.height, rect[k] + sign * d)
            );
          }
          render();
        }
        if (e.key === 'Tab') {
          const buttons = [keyboard, cancel, confirm].filter((b) => !b.disabled),
            i = buttons.indexOf(root.activeElement);
          e.preventDefault();
          buttons[(i + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
        }
      };
      keyboard.onclick = selectDefault;
      cancel.onclick = () => finish({ cancelled: true });
      confirm.onclick = () => {
        if (rect && !confirm.disabled) finish({ ...rect, viewportWidth: width, viewportHeight: height });
      };
      layer.onpointerdown = (e) => {
        if (toolbar.contains(e.target) || help.contains(e.target) || e.button !== 0) return;
        start = { x: e.clientX, y: e.clientY };
        rect = { ...start, width: 0, height: 0 };
        layer.setPointerCapture(e.pointerId);
        render();
        e.preventDefault();
      };
      layer.onpointermove = (e) => {
        if (!start) return;
        const x = Math.max(0, Math.min(width, e.clientX)),
          y = Math.max(0, Math.min(height, e.clientY));
        rect = {
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          width: Math.abs(x - start.x),
          height: Math.abs(y - start.y),
        };
        render();
      };
      layer.onpointerup = () => {
        if (start) {
          start = null;
          if (!confirm.disabled) confirm.focus();
        }
      };
      layer.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
      window.addEventListener('resize', resize);
      document.addEventListener('keydown', keydown, true);
      cancel.focus();
    });
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'prepare') {
      currentSettings = message.settings || currentSettings;
      cancelSelection?.();
      clear();
      stopSpeech();
      requestAnimationFrame(() => requestAnimationFrame(() => respond({ ready: true })));
      return true;
    }
    if (message.type === 'selectionText') {
      const el = document.activeElement;
      const text =
        el && ['TEXTAREA', 'INPUT'].includes(el.tagName) && el.type !== 'password'
          ? el.value.slice(el.selectionStart || 0, el.selectionEnd || 0)
          : window.getSelection()?.toString();
      respond({ text });
    }
    if (message.type === 'selectRegion') {
      selectRegion(message.screenshot).then(respond);
      return true;
    }
    if (message.type === 'working') {
      working(message.settings);
    }
    if (message.type === 'answer') showAnswer(message.text, message.settings);
    if (message.type === 'notice') {
      if (message.error)
        errorNotice(message.text, message.settings || currentSettings, message.speech === true);
      else notice(message.text);
    }
    if (message.type === 'copy') void copy(message.text);
    if (message.type === 'cancel') {
      cancelSelection?.();
      clear();
      stopSpeech();
    }
  });
  window.addEventListener('pagehide', stopSpeech);
}
