import { PROVIDERS, MODES, modelLabel, safeURL, USAGE_URL } from './config.js';
import {
  $,
  send,
  initializeUI,
  applyTheme,
  status,
  renderMarkdown,
  renderSuggestions,
  historyRows,
  copy,
  downloadNote,
} from './ui.js';
initializeUI();
let tabId,
  windowId,
  history = [],
  entry,
  selectedId,
  historyOpen = false,
  rendered = '',
  seenJob,
  refreshTimer,
  refreshSequence = 0,
  utterance;
$('openSettings').onclick = () => chrome.runtime.openOptionsPage();
function openEntry(e) {
  selectedId = e.id;
  entry = e;
  historyOpen = false;
  renderEntry();
  $('historyView').hidden = true;
}
function showHistory() {
  historyOpen = true;
  $('historyView').hidden = false;
  $('welcome').hidden = true;
  $('answerView').hidden = true;
  $('composer').hidden = true;
  filterHistory();
  $('historySearch').focus();
}
function filterHistory() {
  const q = $('historySearch').value.toLocaleLowerCase('pl');
  const items = history.filter((e) =>
    `${e.title} ${e.messages.map((m) => m.text).join(' ')}`.toLocaleLowerCase('pl').includes(q)
  );
  historyRows($('historyList'), items, openEntry);
  $('historyEmpty').hidden = !!items.length;
  $('historyEmpty').textContent = history.length
    ? 'Nie znaleziono zadań pasujących do wyszukiwania.'
    : 'Tu pojawią się Twoje zadania. Zacznij od pierwszego zaznaczenia.';
  $('historyArtwork').hidden = !!items.length || !!history.length;
}
$('showHistory').onclick = showHistory;
$('historySearch').oninput = filterHistory;
$('closeHistory').onclick = () => {
  historyOpen = false;
  $('historyView').hidden = true;
  renderEntry();
};
function renderEntry() {
  $('welcome').hidden = !!entry || historyOpen;
  $('answerView').hidden = !entry || historyOpen;
  $('composer').hidden = !entry || historyOpen;
  if (!entry || historyOpen) return;
  $('answerMode').textContent = (MODES[entry.mode] || 'Wyjaśnij').toUpperCase();
  $('answerTitle').textContent = entry.title;
  $('answerMeta').replaceChildren();
  $('answerMeta').append(
    document.createTextNode(
      `${entry.auth === 'chatgpt' ? 'ChatGPT · Twój plan' : PROVIDERS[entry.provider]?.name || 'AI'} · ${modelLabel(entry.provider, entry.model)}${entry.internet ? ' · Wyszukiwanie włączone' : ''}`
    )
  );
  if (entry.auth === 'chatgpt') {
    const a = document.createElement('a');
    a.href = USAGE_URL;
    a.textContent = 'Zarządzaj użyciem ↗';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    $('answerMeta').append(a);
  }
  const fingerprint = `${entry.id}:${entry.messages.length}:${entry.messages.at(-1).text}`;
  if (rendered !== fingerprint) {
    rendered = fingerprint;
    $('conversation').replaceChildren();
    entry.messages.forEach((m, i) => {
      if (i === 0 && entry.source !== 'text') return;
      const article = document.createElement('article');
      article.className = m.role === 'assistant' ? 'message-assistant' : 'message-user';
      if (m.role === 'assistant') {
        const label = document.createElement('div');
        label.className = 'message-label';
        label.textContent = 'OKSTUDY';
        const prose = document.createElement('div');
        prose.className = 'prose';
        renderMarkdown(prose, m.text);
        article.append(label, prose);
      } else article.textContent = m.text;
      $('conversation').append(article);
    });
    $('sources').replaceChildren();
    for (const [i, source] of (entry.sources || []).entries()) {
      const url = safeURL(source.url);
      if (!url) continue;
      const a = document.createElement('a');
      a.href = url;
      a.textContent = `${i + 1}. ${source.title || new URL(url).hostname}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      $('sources').append(a);
    }
    renderSuggestions($('searchSuggestions'), entry.searchSuggestions);
  }
  $('nextHint').hidden = entry.mode !== 'hint';
  $('reveal').hidden = entry.mode !== 'hint';
  $('contextNote').textContent =
    entry.source !== 'text'
      ? 'Po ponownym otwarciu rozszerzenia dopytujesz na podstawie zapisanej rozmowy. Aby sprawdzić obraz ponownie, zaznacz zadanie jeszcze raz.'
      : 'AI może się pomylić. Sprawdzaj ważne obliczenia i źródła.';
}
async function refresh() {
  const sequence = ++refreshSequence,
    data = await send('snapshot', { tabId });
  if (sequence !== refreshSequence) return;
  history = data.history;
  applyTheme(data.settings.theme);
  document.documentElement.dataset.preference = data.settings.theme;
  const job = data.job,
    running = ['running', 'preparing', 'selecting'].includes(job.status);
  if (job.entryId && job.entryId !== seenJob && (seenJob !== undefined || !selectedId)) {
    selectedId = job.entryId;
    historyOpen = false;
    $('historyView').hidden = true;
  }
  seenJob = job.entryId || '';
  entry = history.find((e) => e.id === selectedId);
  renderEntry();
  if (historyOpen) filterHistory();
  $('progress').hidden = !running;
  if (running) {
    $('welcome').hidden = true;
    $('progressLabel').textContent =
      job.status === 'selecting'
        ? 'Zaznacz zadanie na stronie'
        : job.status === 'preparing'
          ? 'Przygotowuję materiał…'
          : 'Analizuję zadanie…';
    $('progressDetail').textContent =
      job.status === 'selecting'
        ? 'Popraw ramkę i potwierdź przyciskiem „Analizuj fragment”.'
        : 'Odpowiedź pojawi się tutaj. Możesz przerwać w każdej chwili.';
    if (job.text) renderMarkdown($('partial'), job.text);
    else $('partial').replaceChildren();
  }
  $('sendQuestion').disabled = running;
  $('question').disabled = running;
  document.querySelectorAll('[data-question]').forEach((b) => {
    b.disabled = running;
  });
  if (job.status === 'error') status(job.error, true);
  else if (running || job.status === 'done') status('');
  $('limitUsage').hidden = !(job.status === 'error' && job.auth === 'chatgpt');
}
async function ask(question) {
  if (!entry) return;
  $('sendQuestion').disabled = true;
  try {
    await send('followup', { tabId, id: entry.id, question });
    $('question').value = '';
    await refresh();
  } catch (e) {
    status(e.message, true);
    $('sendQuestion').disabled = false;
  }
}
$('questionForm').onsubmit = (e) => {
  e.preventDefault();
  void ask($('question').value);
};
$('limitUsage').href = USAGE_URL;
$('question').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!$('sendQuestion').disabled) $('questionForm').requestSubmit();
  }
};
document.querySelectorAll('[data-question]').forEach((b) => (b.onclick = () => ask(b.dataset.question)));
$('cancel').onclick = () =>
  send('cancel', { tabId })
    .then(refresh)
    .catch((e) => status(e.message, true));
$('startFromPanel').onclick = () =>
  send('launch', { tabId, kind: 'region' })
    .then(refresh)
    .catch((e) => status(e.message, true));
$('copyAnswer').onclick = () =>
  entry &&
  copy(entry.messages.filter((m) => m.role === 'assistant').at(-1).text)
    .then(() => status('Skopiowano odpowiedź.'))
    .catch(() =>
      status('Przeglądarka nie zezwoliła na kopiowanie. Zaznacz tekst odpowiedzi i skopiuj go ręcznie.', true)
    );
$('exportAnswer').onclick = () => entry && downloadNote(entry);
$('speakAnswer').onclick = () => {
  if (!entry) return;
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    $('speakAnswer').setAttribute('aria-label', 'Przeczytaj odpowiedź');
    return;
  }
  utterance = new SpeechSynthesisUtterance(
    entry.messages
      .filter((m) => m.role === 'assistant')
      .at(-1)
      .text.replace(/[*#`]/g, ' ')
  );
  utterance.lang = 'pl-PL';
  utterance.voice = speechSynthesis.getVoices().find((v) => /^pl/i.test(v.lang)) || null;
  utterance.onerror = (e) => {
    if (!['canceled', 'interrupted'].includes(e.error))
      status('Odczyt głosowy jest niedostępny w tej przeglądarce.', true);
  };
  utterance.onend = () => $('speakAnswer').setAttribute('aria-label', 'Przeczytaj odpowiedź');
  speechSynthesis.resume();
  speechSynthesis.speak(utterance);
  $('speakAnswer').setAttribute('aria-label', 'Zatrzymaj odczyt');
};
$('deleteAnswer').onclick = async () => {
  if (!entry) return;
  try {
    await send('history.delete', { id: entry.id });
    entry = null;
    selectedId = null;
    rendered = '';
    await refresh();
    status('Usunięto zadanie.');
  } catch (e) {
    status(e.message, true);
  }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes['okstudy.selected']?.newValue) {
    selectedId = changes['okstudy.selected'].newValue;
    historyOpen = false;
    $('historyView').hidden = true;
  }
  if (area === 'session' && changes['okstudy.showHistory']?.newValue) {
    showHistory();
    void chrome.storage.session.remove('okstudy.showHistory');
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch((e) => status(e.message, true)), 80);
});
chrome.tabs.onActivated.addListener((info) => {
  if (info.windowId !== windowId) return;
  tabId = info.tabId;
  seenJob = undefined;
  void refresh().catch((e) => status(e.message, true));
});
window.addEventListener('pagehide', () => speechSynthesis.cancel());
void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  windowId = tab?.windowId;
  const s = await chrome.storage.session.get(['okstudy.selected', 'okstudy.showHistory']);
  selectedId = s['okstudy.selected'];
  await refresh();
  if (s['okstudy.showHistory']) {
    showHistory();
    await chrome.storage.session.remove('okstudy.showHistory');
  }
})().catch((e) => status(e.message, true));
