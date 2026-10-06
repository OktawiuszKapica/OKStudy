import DOMPurify from 'dompurify';
import { marked } from 'marked';
import renderMathInElement from 'katex/contrib/auto-render';
import { safeURL, MODES } from './config.js';

export const $ = (id) => document.getElementById(id);
export async function send(type, data = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...data });
  if (!response?.ok)
    throw Object.assign(
      new Error(response?.error || 'Rozszerzenie zostało przeładowane. Otwórz ten ekran ponownie.'),
      { code: response?.code }
    );
  return response.data;
}
const paths = {
  crop: '<path d="M6 3v15h15M3 6h15v15M18 3v3M3 18h3"/>',
  screen: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  text: '<path d="M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 3 2 3 1 3 3 1 3 2 3-2 3-1 1-3 2-3-2-3-3-1-1-3z"/><circle cx="12" cy="11" r="3"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  send: '<path d="m4 4 17 8-17 8 3-8zM7 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  book: '<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-5-5 3-3m-1 5 3-3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
};
export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
}
export function icons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}
export function brand() {
  document.querySelectorAll('[data-brand]').forEach((el) => {
    el.innerHTML = '<img src="assets/brand/mark.svg" alt="" width="40" height="26"><span>OKStudy</span>';
  });
}
export function applyTheme(theme) {
  document.documentElement.dataset.preference = theme;
  document.documentElement.dataset.theme =
    theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
}
export function status(message, error = false, target = 'status') {
  const el = $(target);
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
  el.classList.toggle('is-error', error);
}
export function modes(container, selected, change) {
  container.replaceChildren();
  for (const [key, name] of Object.entries(MODES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.dataset.mode = key;
    b.setAttribute('aria-pressed', key === selected);
    b.onclick = () => change(key);
    container.append(b);
  }
}
export function renderMarkdown(element, raw) {
  // Preserve LaTeX delimiters while parsing Markdown, then render safe KaTeX output.
  const math = [],
    prefix = `MATH${crypto.randomUUID().replaceAll('-', '')}X`;
  const source = String(raw).replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$/g, (m) => {
    math.push(m);
    return `${prefix}${math.length - 1}END`;
  });
  let html = marked.parse(source, { breaks: true, gfm: true });
  html = html.replace(new RegExp(`${prefix}(\\d+)END`, 'g'), (_, i) =>
    math[Number(i)].replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  );
  element.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['img', 'style', 'input', 'form', 'button', 'video', 'audio', 'iframe'],
    FORBID_ATTR: ['style'],
  });
  element.querySelectorAll('a').forEach((a) => {
    if (!safeURL(a.href)) a.removeAttribute('href');
    else {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  });
  renderMathInElement(element, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
    trust: false,
    strict: 'ignore',
  });
}
export function renderSuggestions(el, html) {
  el.innerHTML = DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ['div', 'span', 'a', 'p', 'ul', 'li'],
    ALLOWED_ATTR: ['href'],
  });
  el.querySelectorAll('a').forEach((a) => {
    if (!safeURL(a.href)) a.remove();
    else {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  });
}
export async function copy(text) {
  await navigator.clipboard.writeText(text);
}
export function downloadNote(entry) {
  const text = `# ${entry.title}\n\n${entry.messages.map((m) => `## ${m.role === 'user' ? 'Pytanie' : 'OKStudy'}\n\n${m.text}`).join('\n\n')}\n\n${entry.sources?.length ? '## Źródła\n\n' + entry.sources.map((s) => `- ${s.title}: ${s.url}`).join('\n') : ''}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = `OKStudy-${new Date(entry.createdAt).toISOString().slice(0, 10)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function historyRows(container, history, open, limit = 40) {
  container.replaceChildren();
  for (const e of history.slice(0, limit)) {
    const b = document.createElement('button');
    b.className = 'history-row';
    b.type = 'button';
    const symbol = document.createElement('span');
    symbol.className = 'history-icon';
    symbol.innerHTML = icon(e.source === 'text' ? 'text' : 'crop', 18);
    const content = document.createElement('span');
    content.className = 'history-copy';
    const title = document.createElement('strong');
    title.textContent = e.title;
    const meta = document.createElement('small');
    meta.textContent = `${new Date(e.createdAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} · ${MODES[e.mode] || 'Wyjaśnij'}`;
    const arrow = document.createElement('span');
    arrow.innerHTML = icon('arrow', 16);
    content.append(title, meta);
    b.append(symbol, content, arrow);
    b.onclick = () => open(e);
    container.append(b);
  }
}
export function initializeUI() {
  brand();
  icons();
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (document.documentElement.dataset.preference === 'system') applyTheme('system');
  });
}
