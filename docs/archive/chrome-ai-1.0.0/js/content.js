// AI Study Assistant - Content Script
// Etyczny asystent AI do nauki z obsługą Claude i Gemini

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__AI_STUDY_ASSISTANT_LOADED__) return;
  window.__AI_STUDY_ASSISTANT_LOADED__ = true;

  // ===========================================
  // CONFIGURATION - Aktualne modele AI (styczeń 2026)
  // ===========================================
  
  const AI_MODELS = {
    // Google Gemini Models (najnowsze)
    'gemini-3-pro-preview': {
      name: 'Gemini 3 Pro',
      provider: 'gemini',
      description: 'Najinteligentniejszy model Gemini',
      speed: 'medium'
    },
    'gemini-3-flash-preview': {
      name: 'Gemini 3 Flash',
      provider: 'gemini',
      description: 'Szybki z inteligencją na poziomie Pro',
      speed: 'fast'
    },
    // Anthropic Claude Models (najnowsze)
    'claude-opus-4-5-20251101': {
      name: 'Claude Opus 4.5',
      provider: 'claude',
      description: 'Najinteligentniejszy model Claude',
      speed: 'medium'
    },
    'claude-sonnet-4-5-20250929': {
      name: 'Claude Sonnet 4.5',
      provider: 'claude',
      description: 'Zbalansowany - świetny dla większości zadań',
      speed: 'fast'
    },
    'claude-haiku-4-5-20251001': {
      name: 'Claude Haiku 4.5',
      provider: 'claude',
      description: 'Najszybszy i najtańszy Claude',
      speed: 'fast'
    }
  };

  const DEFAULT_SETTINGS = {
    claudeApiKey: '',
    geminiApiKey: '',
    selectedModel: 'gemini-3-flash-preview',
    theme: 'system',
    responseStyle: 'short',
    quickPrompts: [
      { icon: '📐', text: 'Która odpowiedź jest poprawna?' },
      { icon: '💡', text: 'Wyjaśnij krótko' },
      { icon: '🔍', text: 'Rozwiąż krok po kroku' },
      { icon: '✅', text: 'Sprawdź moje rozwiązanie' },
      { icon: '📚', text: 'Wyjaśnij to pojęcie' }
    ]
  };

  // ===========================================
  // STATE
  // ===========================================
  
  let state = {
    sidebarOpen: false,
    settingsOpen: false,
    modelSelectorOpen: false,
    isLoading: false,
    messages: [],
    currentImage: null,
    settings: { ...DEFAULT_SETTINGS }
  };

  // ===========================================
  // SYSTEM PROMPTS based on response style
  // ===========================================

  function getSystemPrompt(style) {
    // Wspólna baza anty-halucynacyjna dla wszystkich trybów
    const verificationBase = `
WERYFIKACJA OBOWIĄZKOWA - poprawność > szybkość:
- Jeśli nie wiesz na 100% - napisz "Nie wiem" lub "Nie jestem pewien"
- Jeśli źródła się różnią - napisz o konflikcie
- Dla matematyki/logiki - ZAWSZE oblicz i sprawdź wynik przed odpowiedzią
- Dla faktów/definicji/dat/nazwisk - zweryfikuj (użyj internetu jeśli potrzeba)
- NIE zgaduj, NIE interpretuj, NIE wymyślaj
- Poprawność jest ważniejsza niż kreatywność i styl

FORMATOWANIE MATEMATYKI - OBOWIĄZKOWE:
- ZAWSZE używaj $...$ dla wzorów inline (np. $x^2 + y^2$)
- ZAWSZE używaj $$...$$ dla wzorów blokowych
- NIGDY nie pisz surowego LaTeX bez $...$ (źle: x^2, dobrze: $x^2$)
- Przykłady: $A = [a_{i,j}]$, $m \\times n$, $\\frac{a}{b}$, $\\sqrt{x}$`;

    const prompts = {
      short: `Jesteś asystentem do testów i zadań. 
${verificationBase}

FORMAT ODPOWIEDZI - ULTRA KRÓTKI:
- Dla testu wyboru: TYLKO litera (a, b, c, d) lub "Nie wiem"
- Dla obliczeń: TYLKO wynik liczbowy (z $ jeśli to wzór)
- Dla prawda/fałsz: TYLKO "Prawda" lub "Fałsz"
- NIE wyjaśniaj, NIE tłumacz, NIE rozpisuj się
- Odpowiadaj po polsku`,

      medium: `Jesteś asystentem edukacyjnym.
${verificationBase}

FORMAT ODPOWIEDZI - ZWIĘZŁY:
- Podaj odpowiedź + KRÓTKIE wyjaśnienie (max 2-3 zdania)
- Dla testów: najpierw litera, potem krótko dlaczego
- Bądź zwięzły - nie rozwlekaj
- Odpowiadaj po polsku

Przykład: "b - ponieważ według definicji X oznacza Y, co pasuje do odpowiedzi b"`,

      detailed: `Jesteś pomocnym asystentem edukacyjnym.
${verificationBase}

FORMAT ODPOWIEDZI - SZCZEGÓŁOWY:
- Wyjaśniaj krok po kroku
- Dla kodu używaj bloków: \`\`\`python
- Bądź dokładny i cierpliwy
- Odpowiadaj po polsku
- Pomagaj zrozumieć, nie tylko podawaj odpowiedź
- Przy faktach podaj źródło jeśli możliwe`
    };

    return prompts[style] || prompts.short;
  }

  // ===========================================
  // API FUNCTIONS with retry logic
  // ===========================================

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [0, 2000, 4000]; // exponential backoff

  function isRetryableError(status, errorMessage) {
    // Retry na te błędy
    if (status === 503 || status === 429 || status === 500 || status === 502) return true;
    if (errorMessage && errorMessage.toLowerCase().includes('overloaded')) return true;
    if (errorMessage && errorMessage.toLowerCase().includes('rate limit')) return true;
    // NIE retry na błędy auth
    if (status === 401 || status === 403) return false;
    return false;
  }

  function updateRetryStatus(attempt, maxRetries) {
    const chatContainer = document.getElementById('ai-chat-container');
    const loadingEl = chatContainer?.querySelector('.ai-loading');
    if (loadingEl) {
      const parent = loadingEl.closest('.ai-message-content');
      if (parent) {
        let retryInfo = parent.querySelector('.ai-retry-info');
        if (!retryInfo) {
          retryInfo = document.createElement('div');
          retryInfo.className = 'ai-retry-info';
          parent.appendChild(retryInfo);
        }
        retryInfo.textContent = `⏳ Model przeciążony, ponawiam (${attempt}/${maxRetries})...`;
      }
    }
  }

  async function callClaudeWithRetry(message, image, attempt = 1) {
    const { claudeApiKey, selectedModel, responseStyle } = state.settings;
    
    if (!claudeApiKey) {
      throw new Error('Brak klucza API Claude. Skonfiguruj go w ustawieniach.');
    }

    const content = [];
    if (image) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: image
        }
      });
    }
    content.push({ type: 'text', text: message });

    const systemPrompt = getSystemPrompt(responseStyle);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 4096,
          messages: [{ role: 'user', content }],
          system: systemPrompt
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errorMessage = error.error?.message || `Błąd API Claude: ${response.status}`;
        
        if (isRetryableError(response.status, errorMessage) && attempt < MAX_RETRIES) {
          updateRetryStatus(attempt + 1, MAX_RETRIES);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
          return callClaudeWithRetry(message, image, attempt + 1);
        }
        
        throw new Error(attempt >= MAX_RETRIES 
          ? `${errorMessage}. Spróbuj za chwilę lub zmień model.`
          : errorMessage);
      }

      const data = await response.json();
      return data.content[0]?.text || 'Brak odpowiedzi';
    } catch (error) {
      if (error.name === 'TypeError' && attempt < MAX_RETRIES) {
        // Network error - retry
        updateRetryStatus(attempt + 1, MAX_RETRIES);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        return callClaudeWithRetry(message, image, attempt + 1);
      }
      throw error;
    }
  }

  async function callGeminiWithRetry(message, image, attempt = 1) {
    const { geminiApiKey, selectedModel, responseStyle } = state.settings;
    
    if (!geminiApiKey) {
      throw new Error('Brak klucza API Gemini. Skonfiguruj go w ustawieniach.');
    }

    const parts = [];
    if (image) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: image
        }
      });
    }
    parts.push({ text: message });

    const systemPrompt = getSystemPrompt(responseStyle);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiApiKey}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.7 }
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errorMessage = error.error?.message || `Błąd API Gemini: ${response.status}`;
        
        if (isRetryableError(response.status, errorMessage) && attempt < MAX_RETRIES) {
          updateRetryStatus(attempt + 1, MAX_RETRIES);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
          return callGeminiWithRetry(message, image, attempt + 1);
        }
        
        throw new Error(attempt >= MAX_RETRIES 
          ? `${errorMessage}. Spróbuj za chwilę lub zmień model.`
          : errorMessage);
      }

      const data = await response.json();
      if (!data.candidates?.length) throw new Error('Brak odpowiedzi od Gemini');
      return data.candidates[0].content.parts[0]?.text || 'Brak odpowiedzi';
    } catch (error) {
      if (error.name === 'TypeError' && attempt < MAX_RETRIES) {
        // Network error - retry
        updateRetryStatus(attempt + 1, MAX_RETRIES);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        return callGeminiWithRetry(message, image, attempt + 1);
      }
      throw error;
    }
  }

  // Wrapper functions for backward compatibility
  async function callClaude(message, image) {
    return callClaudeWithRetry(message, image, 1);
  }

  async function callGemini(message, image) {
    return callGeminiWithRetry(message, image, 1);
  }

  async function sendMessage(text) {
    if ((!text.trim() && !state.currentImage) || state.isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      image: state.currentImage,
      timestamp: Date.now()
    };

    state.messages.push(userMessage);
    const imageToSend = state.currentImage;
    state.currentImage = null;
    state.isLoading = true;
    renderChat();

    try {
      const model = AI_MODELS[state.settings.selectedModel];
      let response;

      if (model.provider === 'claude') {
        response = await callClaude(text, imageToSend);
      } else {
        response = await callGemini(text, imageToSend);
      }

      state.messages.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      });
    } catch (error) {
      state.messages.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ Błąd: ${error.message}`,
        timestamp: Date.now(),
        isError: true
      });
    } finally {
      state.isLoading = false;
      renderChat();
    }
  }

  // ===========================================
  // SCREENSHOT FUNCTIONALITY
  // ===========================================

  function captureScreenshot() {
    return new Promise((resolve, reject) => {
      const sidebar = document.getElementById('ai-assistant-sidebar');
      const toggleBtn = document.getElementById('ai-toggle-btn');
      
      // Store original display states
      const sidebarOriginalDisplay = sidebar ? sidebar.style.display : '';
      const toggleOriginalDisplay = toggleBtn ? toggleBtn.style.display : '';
      
      // HIDE sidebar and toggle button IMMEDIATELY with display:none
      if (sidebar) {
        sidebar.style.display = 'none';
      }
      if (toggleBtn) {
        toggleBtn.style.display = 'none';
      }
      
      // Force browser repaint
      document.body.offsetHeight;
      
      const overlay = document.createElement('div');
      overlay.id = 'ai-screenshot-overlay';
      overlay.innerHTML = `
        <div class="ai-screenshot-instructions">
          📷 Zaznacz obszar do zrzutu ekranu (ESC aby anulować)
        </div>
        <div class="ai-screenshot-selection"></div>
      `;
      document.body.appendChild(overlay);

      const selection = overlay.querySelector('.ai-screenshot-selection');
      let startX, startY, isDrawing = false;

      const restoreSidebar = () => {
        // Restore sidebar and toggle button
        if (sidebar) {
          sidebar.style.display = sidebarOriginalDisplay || '';
        }
        if (toggleBtn) {
          toggleBtn.style.display = toggleOriginalDisplay || '';
        }
      };

      const cleanup = () => {
        overlay.remove();
        document.removeEventListener('keydown', handleKeydown);
        restoreSidebar();
      };

      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          reject(new Error('Anulowano'));
        }
      };
      document.addEventListener('keydown', handleKeydown);

      overlay.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        isDrawing = true;
        selection.style.display = 'block';
        selection.style.left = startX + 'px';
        selection.style.top = startY + 'px';
      });

      overlay.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const width = Math.abs(e.clientX - startX);
        const height = Math.abs(e.clientY - startY);
        selection.style.left = Math.min(startX, e.clientX) + 'px';
        selection.style.top = Math.min(startY, e.clientY) + 'px';
        selection.style.width = width + 'px';
        selection.style.height = height + 'px';
      });

      overlay.addEventListener('mouseup', async (e) => {
        if (!isDrawing) return;
        isDrawing = false;

        const rect = {
          x: Math.min(startX, e.clientX),
          y: Math.min(startY, e.clientY),
          width: Math.abs(e.clientX - startX),
          height: Math.abs(e.clientY - startY)
        };

        if (rect.width < 10 || rect.height < 10) {
          cleanup();
          reject(new Error('Zaznaczony obszar jest za mały'));
          return;
        }

        // Hide overlay before capture
        overlay.style.display = 'none';
        
        // Wait for browser to repaint (longer delay)
        await new Promise(r => setTimeout(r, 150));

        try {
          const response = await chrome.runtime.sendMessage({ action: 'captureTab' });
          if (response.error) throw new Error(response.error);

          const base64 = await cropImage(response.dataUrl, rect);
          cleanup();
          resolve(base64);
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    });
  }

  function cropImage(dataUrl, rect) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        ctx.drawImage(
          img,
          rect.x * dpr, rect.y * dpr,
          rect.width * dpr, rect.height * dpr,
          0, 0,
          rect.width * dpr, rect.height * dpr
        );

        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = () => reject(new Error('Nie można przetworzyć obrazu'));
      img.src = dataUrl;
    });
  }

  // ===========================================
  // MATH RENDERING (KaTeX-like)
  // ===========================================

  function renderMath(text) {
    if (!text) return '';
    
    // Process block math $$...$$ 
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      return `<div class="ai-math-block">${renderLatexToHtml(math.trim(), true)}</div>`;
    });

    // Process inline math $...$
    text = text.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
      return `<span class="ai-math-inline">${renderLatexToHtml(math.trim(), false)}</span>`;
    });

    // Process code blocks ```lang...```
    text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="ai-code-block" data-lang="${lang || 'text'}"><code>${escapeHtml(code.trim())}</code></pre>`;
    });

    // Process inline code `...`
    text = text.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

    // Process bold **...**
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Process italic *...*
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

    // Process headers ### 
    text = text.replace(/^#{4}\s+(.+)$/gm, '<h5 class="ai-heading">$1</h5>');
    text = text.replace(/^#{3}\s+(.+)$/gm, '<h4 class="ai-heading">$1</h4>');
    text = text.replace(/^#{2}\s+(.+)$/gm, '<h3 class="ai-heading">$1</h3>');

    // Process line breaks
    text = text.replace(/\n\n/g, '</p><p>');
    text = text.replace(/\n/g, '<br>');

    return `<div class="ai-prose"><p>${text}</p></div>`;
  }

  // Advanced LaTeX to HTML renderer
  function renderLatexToHtml(latex, isBlock) {
    let html = latex;
    
    // Fractions: \frac{a}{b} -> styled fraction
    html = html.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (_, num, den) => {
      return `<span class="math-frac"><span class="math-num">${renderLatexToHtml(num, false)}</span><span class="math-den">${renderLatexToHtml(den, false)}</span></span>`;
    });
    
    // Square root: \sqrt{x} or \sqrt[n]{x}
    html = html.replace(/\\sqrt\[([^\]]*)\]\{([^}]*)\}/g, (_, n, content) => {
      return `<span class="math-root"><sup>${n}</sup>√<span class="math-root-content">${renderLatexToHtml(content, false)}</span></span>`;
    });
    html = html.replace(/\\sqrt\{([^}]*)\}/g, (_, content) => {
      return `<span class="math-sqrt">√<span class="math-root-content">${renderLatexToHtml(content, false)}</span></span>`;
    });
    
    // Superscript: x^{2} or x^2
    html = html.replace(/\^{([^}]*)}/g, '<sup>$1</sup>');
    html = html.replace(/\^(\d+|[a-zA-Z])/g, '<sup>$1</sup>');
    
    // Subscript: x_{i} or x_i  
    html = html.replace(/_{([^}]*)}/g, '<sub>$1</sub>');
    html = html.replace(/_(\d+|[a-zA-Z])/g, '<sub>$1</sub>');
    
    // Greek letters
    const greekLetters = {
      'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
      'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
      'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π',
      'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ', 'phi': 'φ',
      'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
      'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ', 'Xi': 'Ξ',
      'Pi': 'Π', 'Sigma': 'Σ', 'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω'
    };
    for (const [name, symbol] of Object.entries(greekLetters)) {
      html = html.replace(new RegExp(`\\\\${name}(?![a-zA-Z])`, 'g'), symbol);
    }
    
    // Math operators and symbols
    const symbols = {
      'times': '×', 'div': '÷', 'cdot': '·', 'pm': '±', 'mp': '∓',
      'leq': '≤', 'geq': '≥', 'neq': '≠', 'approx': '≈', 'equiv': '≡',
      'sim': '∼', 'propto': '∝', 'infty': '∞', 'partial': '∂',
      'nabla': '∇', 'sum': 'Σ', 'prod': 'Π', 'int': '∫',
      'iint': '∬', 'iiint': '∭', 'oint': '∮',
      'forall': '∀', 'exists': '∃', 'nexists': '∄',
      'in': '∈', 'notin': '∉', 'subset': '⊂', 'supset': '⊃',
      'subseteq': '⊆', 'supseteq': '⊇', 'cup': '∪', 'cap': '∩',
      'emptyset': '∅', 'varnothing': '∅',
      'rightarrow': '→', 'leftarrow': '←', 'leftrightarrow': '↔',
      'Rightarrow': '⇒', 'Leftarrow': '⇐', 'Leftrightarrow': '⇔',
      'uparrow': '↑', 'downarrow': '↓',
      'implies': '⟹', 'iff': '⟺',
      'neg': '¬', 'land': '∧', 'lor': '∨',
      'angle': '∠', 'perp': '⊥', 'parallel': '∥',
      'triangle': '△', 'square': '□', 'circ': '∘',
      'star': '⋆', 'ast': '∗', 'oplus': '⊕', 'otimes': '⊗',
      'ldots': '…', 'cdots': '⋯', 'vdots': '⋮', 'ddots': '⋱',
      'prime': '′', 'dprime': '″',
      'degree': '°', 'celsius': '°C',
      'hbar': 'ℏ', 'ell': 'ℓ', 'Re': 'ℜ', 'Im': 'ℑ',
      'aleph': 'ℵ', 'wp': '℘'
    };
    for (const [name, symbol] of Object.entries(symbols)) {
      html = html.replace(new RegExp(`\\\\${name}(?![a-zA-Z])`, 'g'), symbol);
    }
    
    // Text in math: \text{...}
    html = html.replace(/\\text\{([^}]*)\}/g, '<span class="math-text">$1</span>');
    html = html.replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>');
    html = html.replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>');
    
    // Matrix/pmatrix/bmatrix
    html = html.replace(/\\begin\{(p|b|v|V)?matrix\}([\s\S]*?)\\end\{(p|b|v|V)?matrix\}/g, (_, type, content) => {
      const brackets = { 'p': ['(', ')'], 'b': ['[', ']'], 'v': ['|', '|'], 'V': ['‖', '‖'], '': ['', ''] };
      const [left, right] = brackets[type || ''] || ['', ''];
      const rows = content.trim().split('\\\\').map(row => {
        const cells = row.trim().split('&').map(cell => 
          `<td>${renderLatexToHtml(cell.trim(), false)}</td>`
        ).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<span class="math-matrix"><span class="math-bracket">${left}</span><table class="math-matrix-table">${rows}</table><span class="math-bracket">${right}</span></span>`;
    });
    
    // Cases environment
    html = html.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, content) => {
      const rows = content.trim().split('\\\\').map(row => {
        const parts = row.split('&');
        return `<tr><td>${renderLatexToHtml(parts[0]?.trim() || '', false)}</td><td class="math-case-cond">${renderLatexToHtml(parts[1]?.trim() || '', false)}</td></tr>`;
      }).join('');
      return `<span class="math-cases"><span class="math-brace">{</span><table class="math-cases-table">${rows}</table></span>`;
    });
    
    // Parentheses sizing: \left( \right)
    html = html.replace(/\\left\(/g, '<span class="math-lparen">(</span>');
    html = html.replace(/\\right\)/g, '<span class="math-rparen">)</span>');
    html = html.replace(/\\left\[/g, '<span class="math-lbracket">[</span>');
    html = html.replace(/\\right\]/g, '<span class="math-rbracket">]</span>');
    html = html.replace(/\\left\{/g, '<span class="math-lbrace">{</span>');
    html = html.replace(/\\right\}/g, '<span class="math-rbrace">}</span>');
    html = html.replace(/\\left\|/g, '<span class="math-lvert">|</span>');
    html = html.replace(/\\right\|/g, '<span class="math-rvert">|</span>');
    
    // Overline/underline
    html = html.replace(/\\overline\{([^}]*)\}/g, '<span class="math-overline">$1</span>');
    html = html.replace(/\\underline\{([^}]*)\}/g, '<span class="math-underline">$1</span>');
    html = html.replace(/\\vec\{([^}]*)\}/g, '<span class="math-vec">$1</span>');
    html = html.replace(/\\hat\{([^}]*)\}/g, '<span class="math-hat">$1</span>');
    html = html.replace(/\\bar\{([^}]*)\}/g, '<span class="math-bar">$1</span>');
    html = html.replace(/\\dot\{([^}]*)\}/g, '<span class="math-dot">$1</span>');
    html = html.replace(/\\ddot\{([^}]*)\}/g, '<span class="math-ddot">$1</span>');
    
    // Binomial coefficient
    html = html.replace(/\\binom\{([^}]*)\}\{([^}]*)\}/g, (_, n, k) => {
      return `<span class="math-binom"><span class="math-bracket">(</span><span class="math-binom-content"><span class="math-binom-top">${renderLatexToHtml(n, false)}</span><span class="math-binom-bot">${renderLatexToHtml(k, false)}</span></span><span class="math-bracket">)</span></span>`;
    });
    
    // Limits, sums with bounds
    html = html.replace(/\\(sum|prod|int|lim)_\{([^}]*)\}\^\{([^}]*)\}/g, (_, op, lower, upper) => {
      const opSymbol = { sum: 'Σ', prod: 'Π', int: '∫', lim: 'lim' }[op];
      return `<span class="math-bigop"><span class="math-op-upper">${renderLatexToHtml(upper, false)}</span><span class="math-op-sym">${opSymbol}</span><span class="math-op-lower">${renderLatexToHtml(lower, false)}</span></span>`;
    });
    
    // Clean up remaining backslashes before known commands
    html = html.replace(/\\([a-zA-Z]+)/g, (match, cmd) => {
      // If we haven't handled it, just remove the backslash
      return cmd;
    });
    
    // Clean up extra spaces and braces
    html = html.replace(/\{([^{}]*)\}/g, '$1');
    html = html.replace(/\s+/g, ' ').trim();
    
    return html;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ===========================================
  // STORAGE
  // ===========================================

  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      if (result.settings) {
        state.settings = { ...DEFAULT_SETTINGS, ...result.settings };
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    applyTheme();
  }

  async function saveSettings() {
    try {
      await chrome.storage.sync.set({ settings: state.settings });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  function applyTheme() {
    const isDark = state.settings.theme === 'dark' ||
      (state.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    const sidebar = document.getElementById('ai-assistant-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('dark', isDark);
    }
  }

  // ===========================================
  // UI RENDERING
  // ===========================================

  function createSidebar() {
    if (document.getElementById('ai-assistant-sidebar')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'ai-assistant-sidebar';
    sidebar.innerHTML = `
      <div class="ai-sidebar-header">
        <div class="ai-header-left">
          <div class="ai-logo">AI</div>
          <span class="ai-title">Study Assistant</span>
        </div>
        <div class="ai-header-right">
          <button class="ai-btn-icon" id="ai-btn-settings" title="Ustawienia">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button class="ai-btn-icon" id="ai-btn-close" title="Zamknij">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="ai-model-selector" id="ai-model-selector"></div>
      
      <div class="ai-chat-container" id="ai-chat-container"></div>
      
      <div class="ai-input-area">
        <div class="ai-quick-prompts" id="ai-quick-prompts"></div>
        <div class="ai-image-preview" id="ai-image-preview"></div>
        <div class="ai-input-row">
          <button class="ai-btn-icon" id="ai-btn-screenshot" title="Zrzut ekranu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          <textarea id="ai-input" placeholder="Zadaj pytanie..." rows="1"></textarea>
          <button class="ai-btn-send" id="ai-btn-send" title="Wyślij">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div class="ai-input-hint">
          <kbd>Enter</kbd> wyślij • <kbd>Shift+Enter</kbd> nowa linia
        </div>
        <div class="ai-footer">
          Created by <strong>Oktawiusz Kapica</strong>
        </div>
      </div>
    `;

    document.body.appendChild(sidebar);
    
    // Event listeners
    document.getElementById('ai-btn-close').addEventListener('click', toggleSidebar);
    document.getElementById('ai-btn-settings').addEventListener('click', toggleSettings);
    document.getElementById('ai-btn-screenshot').addEventListener('click', handleScreenshot);
    document.getElementById('ai-btn-send').addEventListener('click', handleSend);
    
    const input = document.getElementById('ai-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    input.addEventListener('input', autoResize);

    renderModelSelector();
    renderQuickPrompts();
    renderChat();
    applyTheme();
  }

  function renderModelSelector() {
    const container = document.getElementById('ai-model-selector');
    if (!container) return;

    const geminiModels = Object.entries(AI_MODELS).filter(([_, m]) => m.provider === 'gemini');
    const claudeModels = Object.entries(AI_MODELS).filter(([_, m]) => m.provider === 'claude');
    
    // Get current model info
    const currentModel = AI_MODELS[state.settings.selectedModel];
    const currentModelName = currentModel ? currentModel.name : 'Wybierz model';

    container.innerHTML = `
      <div class="ai-model-header" id="ai-model-toggle">
        <div class="ai-model-current">
          <span class="ai-model-current-icon">🤖</span>
          <span class="ai-model-current-name">${currentModelName}</span>
        </div>
        <svg class="ai-model-chevron ${state.modelSelectorOpen ? 'open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="ai-model-list ${state.modelSelectorOpen ? 'open' : ''}">
        <div class="ai-model-group">
          <div class="ai-model-group-title">Google Gemini</div>
          ${geminiModels.map(([id, model]) => `
            <label class="ai-model-option ${state.settings.selectedModel === id ? 'selected' : ''}">
              <input type="radio" name="ai-model" value="${id}" ${state.settings.selectedModel === id ? 'checked' : ''}>
              <div class="ai-model-info">
                <span class="ai-model-name">${model.name}</span>
                <span class="ai-model-desc">${model.description}</span>
              </div>
              <span class="ai-model-speed ${model.speed}">${model.speed === 'fast' ? '⚡' : '🧠'}</span>
            </label>
          `).join('')}
        </div>
        <div class="ai-model-group">
          <div class="ai-model-group-title">Anthropic Claude</div>
          ${claudeModels.map(([id, model]) => `
            <label class="ai-model-option ${state.settings.selectedModel === id ? 'selected' : ''}">
              <input type="radio" name="ai-model" value="${id}" ${state.settings.selectedModel === id ? 'checked' : ''}>
              <div class="ai-model-info">
                <span class="ai-model-name">${model.name}</span>
                <span class="ai-model-desc">${model.description}</span>
              </div>
              <span class="ai-model-speed ${model.speed}">${model.speed === 'fast' ? '⚡' : '🧠'}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;

    // Toggle model list
    document.getElementById('ai-model-toggle').addEventListener('click', () => {
      state.modelSelectorOpen = !state.modelSelectorOpen;
      renderModelSelector();
    });

    // Model selection
    container.querySelectorAll('input[name="ai-model"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.selectedModel = e.target.value;
        state.modelSelectorOpen = false; // Close after selection
        saveSettings();
        renderModelSelector();
      });
    });
  }

  function renderQuickPrompts() {
    const container = document.getElementById('ai-quick-prompts');
    if (!container) return;

    container.innerHTML = state.settings.quickPrompts.slice(0, 4).map(prompt => `
      <button class="ai-quick-prompt" data-text="${escapeHtml(prompt.text)}">
        <span>${prompt.icon}</span>
        <span>${prompt.text.substring(0, 15)}...</span>
      </button>
    `).join('');

    container.querySelectorAll('.ai-quick-prompt').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('ai-input');
        input.value = btn.dataset.text;
        input.focus();
        autoResize({ target: input });
      });
    });
  }

  function renderChat() {
    const container = document.getElementById('ai-chat-container');
    if (!container) return;

    if (state.messages.length === 0) {
      container.innerHTML = `
        <div class="ai-chat-empty">
          <div class="ai-chat-empty-icon">💬</div>
          <h3>Rozpocznij rozmowę</h3>
          <p>Zadaj pytanie lub zrób zrzut ekranu, aby uzyskać pomoc w nauce</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.messages.map(msg => `
      <div class="ai-message ${msg.role} ${msg.isError ? 'error' : ''}">
        <div class="ai-message-avatar">${msg.role === 'user' ? '👤' : '🤖'}</div>
        <div class="ai-message-content">
          ${msg.image ? `<img src="data:image/png;base64,${msg.image}" class="ai-message-image" alt="Załączony obraz">` : ''}
          <div class="ai-message-text">${msg.role === 'assistant' ? renderMath(msg.content) : escapeHtml(msg.content)}</div>
          <div class="ai-message-time">${new Date(msg.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    `).join('');

    if (state.isLoading) {
      container.innerHTML += `
        <div class="ai-message assistant">
          <div class="ai-message-avatar">🤖</div>
          <div class="ai-message-content">
            <div class="ai-loading">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      `;
    }

    container.scrollTop = container.scrollHeight;
  }

  function renderImagePreview() {
    const container = document.getElementById('ai-image-preview');
    if (!container) return;

    if (state.currentImage) {
      container.innerHTML = `
        <div class="ai-preview-wrapper">
          <img src="data:image/png;base64,${state.currentImage}" alt="Zrzut ekranu">
          <button class="ai-preview-remove" id="ai-remove-image">✕</button>
        </div>
      `;
      document.getElementById('ai-remove-image').addEventListener('click', () => {
        state.currentImage = null;
        renderImagePreview();
      });
    } else {
      container.innerHTML = '';
    }
  }

  function autoResize(e) {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  // ===========================================
  // SETTINGS PANEL
  // ===========================================

  function toggleSettings() {
    state.settingsOpen = !state.settingsOpen;
    
    let modal = document.getElementById('ai-settings-modal');
    
    if (state.settingsOpen) {
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ai-settings-modal';
        modal.innerHTML = `
          <div class="ai-settings-overlay"></div>
          <div class="ai-settings-panel">
            <div class="ai-settings-header">
              <h2>⚙️ Ustawienia</h2>
              <button class="ai-btn-icon" id="ai-close-settings">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div class="ai-settings-body">
              <div class="ai-setting-group">
                <label>📝 Styl odpowiedzi</label>
                <div class="ai-style-selector">
                  <button class="ai-style-btn ${state.settings.responseStyle === 'short' ? 'active' : ''}" data-style="short">
                    <span class="ai-style-icon">⚡</span>
                    <span class="ai-style-name">Krótki</span>
                    <span class="ai-style-desc">Tylko odpowiedź</span>
                  </button>
                  <button class="ai-style-btn ${state.settings.responseStyle === 'medium' ? 'active' : ''}" data-style="medium">
                    <span class="ai-style-icon">💬</span>
                    <span class="ai-style-name">Średni</span>
                    <span class="ai-style-desc">+ krótkie wyjaśnienie</span>
                  </button>
                  <button class="ai-style-btn ${state.settings.responseStyle === 'detailed' ? 'active' : ''}" data-style="detailed">
                    <span class="ai-style-icon">📚</span>
                    <span class="ai-style-name">Szczegółowy</span>
                    <span class="ai-style-desc">Krok po kroku</span>
                  </button>
                </div>
              </div>
              <div class="ai-setting-group">
                <label>🔑 Klucz API Claude (Anthropic)</label>
                <input type="password" id="ai-claude-key" value="${state.settings.claudeApiKey}" placeholder="sk-ant-...">
                <p class="ai-setting-hint">Pobierz: <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a></p>
              </div>
              <div class="ai-setting-group">
                <label>🔑 Klucz API Gemini (Google)</label>
                <input type="password" id="ai-gemini-key" value="${state.settings.geminiApiKey}" placeholder="AIza...">
                <p class="ai-setting-hint">Pobierz: <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a></p>
              </div>
              <div class="ai-setting-group">
                <label>🎨 Motyw</label>
                <div class="ai-theme-selector">
                  <button class="ai-theme-btn ${state.settings.theme === 'light' ? 'active' : ''}" data-theme="light">☀️ Jasny</button>
                  <button class="ai-theme-btn ${state.settings.theme === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Ciemny</button>
                  <button class="ai-theme-btn ${state.settings.theme === 'system' ? 'active' : ''}" data-theme="system">💻 System</button>
                </div>
              </div>
              <div class="ai-setting-info">
                🔒 Twoje klucze API są przechowywane lokalnie i nigdy nie są wysyłane na nasze serwery.
              </div>
            </div>
            <div class="ai-settings-footer">
              <button class="ai-btn-primary" id="ai-save-settings">💾 Zapisz</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.ai-settings-overlay').addEventListener('click', toggleSettings);
        modal.querySelector('#ai-close-settings').addEventListener('click', toggleSettings);
        modal.querySelector('#ai-save-settings').addEventListener('click', () => {
          state.settings.claudeApiKey = modal.querySelector('#ai-claude-key').value;
          state.settings.geminiApiKey = modal.querySelector('#ai-gemini-key').value;
          saveSettings();
          toggleSettings();
        });

        modal.querySelectorAll('.ai-theme-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            state.settings.theme = btn.dataset.theme;
            modal.querySelectorAll('.ai-theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyTheme();
            saveSettings();
          });
        });

        modal.querySelectorAll('.ai-style-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            state.settings.responseStyle = btn.dataset.style;
            modal.querySelectorAll('.ai-style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            saveSettings();
          });
        });
      }
      modal.classList.add('visible');
    } else if (modal) {
      modal.classList.remove('visible');
    }
  }

  // ===========================================
  // EVENT HANDLERS
  // ===========================================

  function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    
    if (state.sidebarOpen) {
      createSidebar();
      document.getElementById('ai-assistant-sidebar').classList.add('visible');
      createToggleButton(false);
    } else {
      const sidebar = document.getElementById('ai-assistant-sidebar');
      if (sidebar) sidebar.classList.remove('visible');
      createToggleButton(true);
    }
  }

  function createToggleButton(show) {
    let btn = document.getElementById('ai-toggle-btn');
    
    if (show) {
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'ai-toggle-btn';
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>`;
        btn.title = 'AI Study Assistant (Ctrl+Shift+A)';
        btn.addEventListener('click', toggleSidebar);
        document.body.appendChild(btn);
      }
      btn.style.display = 'flex';
    } else if (btn) {
      btn.style.display = 'none';
    }
  }

  async function handleScreenshot() {
    try {
      state.currentImage = await captureScreenshot();
      renderImagePreview();
    } catch (error) {
      if (error.message !== 'Anulowano') {
        console.error('Screenshot error:', error);
      }
    }
  }

  function handleSend() {
    const input = document.getElementById('ai-input');
    const text = input.value.trim();
    
    if (text || state.currentImage) {
      sendMessage(text);
      input.value = '';
      input.style.height = 'auto';
      renderImagePreview();
    }
  }

  // ===========================================
  // MESSAGE LISTENER
  // ===========================================

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      toggleSidebar();
    } else if (request.action === 'open') {
      if (!state.sidebarOpen) toggleSidebar();
    }
    sendResponse({ success: true });
  });

  // ===========================================
  // INITIALIZATION
  // ===========================================

  async function init() {
    await loadSettings();
    createToggleButton(true);
    
    // Listen for theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }

  init();
})();
