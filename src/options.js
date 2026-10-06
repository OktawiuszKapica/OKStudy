import { PROVIDERS, USAGE_URL } from './config.js';
import { $, send, initializeUI, applyTheme, modes, status, copy, icon } from './ui.js';
initializeUI();
document.querySelector('.settings-main').inert = true;
let settings,
  configured = {},
  drafts = {},
  dirty = false,
  authGeneration = 0,
  chatgptModels = [];
const modesHelp = {
  tutor: 'Pełne wyjaśnienie w panelu obok strony, z możliwością dopytania.',
  hint: 'Jedna wskazówka na początek. Kolejne podpowiedzi i rozwiązanie odsłaniasz samodzielnie.',
  express: 'Krótka odpowiedź w wybranym miejscu na stronie.',
};
function changed() {
  dirty = true;
  $('saveHint').textContent = 'Masz niezapisane zmiany.';
}
function navigate() {
  const section = ['ai', 'appearance', 'shortcuts', 'privacy'].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : 'ai';
  document.querySelectorAll('.settings-section').forEach((el) => {
    el.hidden = el.id !== `section-${section}`;
  });
  document.querySelectorAll('[data-section]').forEach((el) => {
    if (el.dataset.section === section) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', navigate);
navigate();
function providerButtons() {
  $('providers').replaceChildren();
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    const b = document.createElement('button');
    b.className = 'provider-card';
    b.type = 'button';
    b.setAttribute('aria-pressed', id === settings.provider);
    const img = document.createElement('img');
    img.src = provider.image;
    img.alt = '';
    const title = document.createElement('strong');
    title.textContent = provider.name;
    const sub = document.createElement('small');
    sub.textContent =
      id === 'openai' ? 'Konto lub klucz API' : configured[id] ? 'Klucz zapisany' : 'Własny klucz API';
    b.append(img, title, sub);
    b.onclick = () => {
      settings.provider = id;
      changed();
      renderProvider();
    };
    $('providers').append(b);
  }
}
function populateModels() {
  const plan = settings.provider === 'openai' && settings.openaiAuth === 'chatgpt';
  const current = plan ? settings.chatgptModel : settings.models[settings.provider];
  const list = plan ? chatgptModels : PROVIDERS[settings.provider].models;
  $('model').replaceChildren();
  if (plan && !list.length) {
    const o = new Option('Zaloguj się, aby pobrać modele', '');
    $('model').add(o);
    $('model').disabled = true;
    $('customModelField').hidden = true;
    return;
  }
  $('model').disabled = false;
  for (const m of list) $('model').add(new Option(m.name + (m.detail ? ` · ${m.detail}` : ''), m.id));
  if (!plan) $('model').add(new Option('Własny / wcześniej wybrany model…', '__custom'));
  const known = list.some((m) => m.id === current);
  $('model').value = known ? current : plan ? list[0].id : '__custom';
  if (plan && !known) settings.chatgptModel = list[0].id;
  $('customModelField').hidden = plan || known;
  $('customModel').value = plan ? '' : current;
}
async function refreshAccount() {
  const generation = ++authGeneration;
  try {
    const s = await send('chatgpt.status');
    if (generation !== authGeneration) return;
    const selected = $('chatgptAccount').value;
    $('chatgptAccount').replaceChildren();
    for (const account of s.accounts || [])
      $('chatgptAccount').add(
        new Option(account.label + (account.connected ? '' : ' · zaloguj ponownie'), account.id)
      );
    $('chatgptAccount').add(new Option('Dodaj inne konto…', '__new'));
    $('chatgptAccount').value = (s.accounts || []).some((a) => a.id === selected)
      ? selected
      : s.activeId || '__new';
    $('accountPicker').hidden = !(s.accounts || []).length;
    $('chatgptStatus').textContent = s.connected
      ? `${s.email || 'Konto ChatGPT'} · ${s.sharing ? 'korzystanie z planu włączone' : 'brak zgody na korzystanie z planu'}`
      : 'Zaloguj się na stronie OpenAI i zezwól na korzystanie z planu.';
    $('signOut').hidden = !s.connected;
    $('manageUsage').hidden = !s.sharing;
    $('signInLabel').textContent = 'Continue with ChatGPT';
    if (s.sharing) {
      chatgptModels = await send('chatgpt.models');
      if (
        generation === authGeneration &&
        settings.provider === 'openai' &&
        settings.openaiAuth === 'chatgpt'
      )
        populateModels();
    } else {
      chatgptModels = [];
      if (settings.provider === 'openai' && settings.openaiAuth === 'chatgpt') populateModels();
    }
  } catch (error) {
    if (generation === authGeneration) {
      $('chatgptStatus').textContent = error.message;
      if (error.code?.startsWith('NATIVE_')) {
        chatgptModels = [];
        $('accountPicker').hidden = true;
        $('signOut').hidden = true;
        $('manageUsage').hidden = true;
        if (settings.provider === 'openai' && settings.openaiAuth === 'chatgpt') populateModels();
        $('companionHelp').open = error.code !== 'NATIVE_API_UNAVAILABLE';
      }
    }
  }
}
function renderProvider() {
  authGeneration++;
  providerButtons();
  const provider = PROVIDERS[settings.provider],
    plan = settings.provider === 'openai' && settings.openaiAuth === 'chatgpt';
  $('authChoice').hidden = settings.provider !== 'openai';
  $('apiFields').hidden = plan;
  $('chatgptFields').hidden = !plan;
  document
    .querySelectorAll('[data-auth]')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.auth === settings.openaiAuth));
  $('keyLabel').textContent = `Klucz API ${provider.name}`;
  $('keyLink').href = provider.keyUrl;
  $('apiKey').value = drafts[settings.provider] ?? '';
  $('apiKey').type = 'password';
  $('apiKey').placeholder = configured[settings.provider]
    ? 'Klucz zapisany. Wklej nowy, aby go zastąpić.'
    : provider.placeholder;
  $('keyHint').textContent = configured[settings.provider]
    ? 'Zapisany klucz pozostaje na tym urządzeniu. Puste pole zachowuje dotychczasowe połączenie.'
    : 'Klucz jest przechowywany lokalnie na tym urządzeniu, poza synchronizacją Chrome.';
  $('removeKey').hidden = !configured[settings.provider];
  status('', false, 'testStatus');
  populateModels();
  if (plan) void refreshAccount();
}
function renderModes() {
  modes($('modes'), settings.mode, (mode) => {
    settings.mode = mode;
    changed();
    renderModes();
  });
  $('modeHint').textContent = modesHelp[settings.mode];
}
function preview() {
  const sample = $('expressSample');
  sample.style.fontSize = `${settings.expressSize}px`;
  sample.style.opacity = settings.expressOpacity;
  sample.style.top = settings.pos.startsWith('t') ? '10px' : 'auto';
  sample.style.bottom = settings.pos.startsWith('t') ? 'auto' : '10px';
  sample.style.left = settings.pos.endsWith('l') ? '10px' : settings.pos === 'bc' ? '50%' : 'auto';
  sample.style.right = settings.pos.endsWith('l') || settings.pos === 'bc' ? 'auto' : '10px';
  sample.style.transform = settings.pos === 'bc' ? 'translateX(-50%)' : '';
  $('sizeValue').textContent = `${settings.expressSize} px`;
  $('opacityValue').textContent = `${Math.round(settings.expressOpacity * 100)}%`;
  $('durationValue').textContent = `${settings.expressDuration} s`;
}
$('apiKey').oninput = () => {
  drafts[settings.provider] = $('apiKey').value;
  changed();
};
$('showKey').onclick = () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('showKey').setAttribute('aria-label', show ? 'Ukryj wpisywany klucz' : 'Pokaż wpisywany klucz');
};
$('removeKey').onclick = () => {
  drafts[settings.provider] = '';
  configured[settings.provider] = false;
  changed();
  renderProvider();
  status('Klucz zostanie usunięty po zapisaniu ustawień.');
};
$('model').onchange = () => {
  const value = $('model').value;
  if (settings.provider === 'openai' && settings.openaiAuth === 'chatgpt') settings.chatgptModel = value;
  else if (value !== '__custom') settings.models[settings.provider] = value;
  $('customModelField').hidden = value !== '__custom';
  if (value === '__custom') $('customModel').focus();
  changed();
};
$('customModel').oninput = () => {
  settings.models[settings.provider] = $('customModel').value.trim();
  changed();
};
document.querySelectorAll('[data-auth]').forEach(
  (b) =>
    (b.onclick = () => {
      settings.openaiAuth = b.dataset.auth;
      changed();
      renderProvider();
    })
);
for (const [id, key] of [
  ['voice', 'voice'],
  ['theme', 'theme'],
  ['position', 'pos'],
  ['duration', 'expressDuration'],
  ['size', 'expressSize'],
  ['opacity', 'expressOpacity'],
  ['internet', 'internet'],
  ['persistentHistory', 'persistentHistory'],
]) {
  $(id).oninput = () => {
    const el = $(id);
    settings[key] =
      el.type === 'checkbox'
        ? el.checked
        : el.type === 'range'
          ? Number(el.value) / (id === 'opacity' ? 100 : 1)
          : el.value;
    changed();
    if (id === 'theme') applyTheme(settings.theme);
    preview();
  };
}
$('testKey').onclick = async () => {
  const provider = settings.provider,
    model = settings.models[provider];
  $('testKey').disabled = true;
  status('Sprawdzam połączenie z wybranym modelem…', false, 'testStatus');
  try {
    await send('test', { provider, model, key: drafts[provider] });
    if (provider === settings.provider)
      status('Połączenie działa. Model odpowiedział poprawnie.', false, 'testStatus');
  } catch (e) {
    if (provider === settings.provider) status(e.message, true, 'testStatus');
  } finally {
    $('testKey').disabled = false;
  }
};
$('save').onclick = async () => {
  $('save').disabled = true;
  try {
    if (!/^[a-zA-Z0-9._:/-]{1,120}$/.test(settings.models[settings.provider]))
      throw new Error('Podaj prawidłowy identyfikator modelu.');
    const keys = { ...drafts };
    for (const p of Object.keys(keys)) if (!keys[p].trim() && configured[p]) delete keys[p];
    settings = await send('settings.save', { settings, keys });
    drafts = {};
    dirty = false;
    const snapshot = await send('snapshot');
    configured = snapshot.configured;
    $('saveHint').textContent = 'Zapisano. Możesz wrócić do nauki.';
    status('Ustawienia zostały zapisane.');
    renderProvider();
  } catch (e) {
    status(e.message, true);
  } finally {
    $('save').disabled = false;
  }
};
$('signIn').onclick = async () => {
  $('signIn').disabled = true;
  status('Otwieram logowanie ChatGPT…', false, 'authStatus');
  try {
    const account = await send('chatgpt.signin', { accountId: $('chatgptAccount').value || '__new' });
    if (!account.sharing)
      throw new Error('Konto połączone. Zaloguj się ponownie i włącz zgodę na korzystanie z planu ChatGPT.');
    status(
      'Korzystasz z planu ChatGPT. Użycie i limity sprawdzisz przyciskiem „Zarządzaj użyciem”.',
      false,
      'authStatus'
    );
    settings.provider = 'openai';
    settings.openaiAuth = 'chatgpt';
    changed();
    await refreshAccount();
    const welcome = await chrome.storage.local.get('okstudy.planWelcomeSeen');
    if (!welcome['okstudy.planWelcomeSeen']) $('planWelcome').showModal();
  } catch (e) {
    status(e.message, true, 'authStatus');
    await refreshAccount();
  } finally {
    $('signIn').disabled = false;
  }
};
$('signOut').onclick = async () => {
  try {
    const result = await send('chatgpt.signout');
    chatgptModels = [];
    await refreshAccount();
    populateModels();
    status(
      result.remoteRevoked
        ? 'Wylogowano z konta ChatGPT.'
        : 'Wylogowano lokalnie. Nie udało się potwierdzić zakończenia sesji w OpenAI. Możesz odłączyć aplikację w ustawieniach ChatGPT.',
      !result.remoteRevoked,
      'authStatus'
    );
  } catch (e) {
    status(e.message, true, 'authStatus');
  }
};
$('chatgptAccount').onchange = async () => {
  if ($('chatgptAccount').value === '__new') return;
  try {
    await send('chatgpt.select', { accountId: $('chatgptAccount').value });
    chatgptModels = [];
    settings.chatgptModel = '';
    changed();
    await refreshAccount();
  } catch (e) {
    status(e.message, true, 'authStatus');
  }
};
$('manageUsage').href = USAGE_URL;
$('welcomeUsage').href = USAGE_URL;
$('dismissWelcome').onclick = async () => {
  $('planWelcome').close();
  await chrome.storage.local.set({ 'okstudy.planWelcomeSeen': true });
};
$('planWelcome').addEventListener('cancel', () => {
  void chrome.storage.local.set({ 'okstudy.planWelcomeSeen': true });
});
$('installCommand').textContent =
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1 -ExtensionId ${chrome.runtime.id}`;
$('copyInstall').onclick = () =>
  copy($('installCommand').textContent)
    .then(() => status('Skopiowano polecenie instalacji.', false, 'authStatus'))
    .catch((e) => status(e.message, true, 'authStatus'));
$('editShortcuts').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
$('clearHistory').onclick = () => {
  $('deleteConfirm').hidden = false;
  $('confirmClear').focus();
};
$('cancelClear').onclick = () => {
  $('deleteConfirm').hidden = true;
  $('clearHistory').focus();
};
$('confirmClear').onclick = async () => {
  try {
    await send('history.delete');
    $('deleteConfirm').hidden = true;
    $('historyCount').textContent = 'Brak zapisanych zadań.';
    status('Historia została wyczyszczona.');
  } catch (e) {
    status(e.message, true);
  }
};
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
void (async () => {
  const data = await send('snapshot');
  settings = data.settings;
  configured = data.configured;
  applyTheme(settings.theme);
  document.documentElement.dataset.preference = settings.theme;
  renderProvider();
  renderModes();
  for (const [id, value] of Object.entries({
    voice: settings.voice,
    theme: settings.theme,
    position: settings.pos,
    duration: settings.expressDuration,
    size: settings.expressSize,
    opacity: settings.expressOpacity * 100,
  }))
    $(id).value = value;
  $('internet').checked = settings.internet;
  $('persistentHistory').checked = settings.persistentHistory;
  preview();
  $('historyCount').textContent = `Zapisane zadania: ${data.history.length} / 40`;
  $('version').textContent = chrome.runtime.getManifest().version;
  document.querySelector('.settings-main').inert = false;
  for (const command of await chrome.commands.getAll()) {
    if (command.name === '_execute_action') continue;
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const label = document.createElement('span');
    label.textContent = command.description;
    const key = document.createElement('kbd');
    key.textContent = command.shortcut || 'Przypisz skrót';
    row.append(label, key);
    $('shortcutList').append(row);
  }
})().catch((e) => status(e.message, true));
