import { PROVIDERS, USAGE_URL } from './config.js';
import { $, send, initializeUI, applyTheme, modes, status, copy, icon } from './ui.js';
import { createSystemSpeech, systemVoices, OPENAI_VOICES } from './speech.js';
import { expressTheme } from './appearance.js';
initializeUI();
document.querySelector('.settings-main').inert = true;
let settings,
  configured = {},
  drafts = {},
  dirty = false,
  authGeneration = 0,
  chatgptModels = [],
  modelGeneration = 0,
  apiCatalogs = {},
  profiles = [];
const modesHelp = {
  tutor: 'Pełne wyjaśnienie w panelu obok strony, z możliwością dopytania.',
  hint: 'Jedna wskazówka na początek. Kolejne podpowiedzi i rozwiązanie odsłaniasz samodzielnie.',
  express: 'Krótka odpowiedź w wybranym miejscu na stronie.',
};
const speaker = createSystemSpeech((state, error) =>
  status(error || (state === 'playing' ? 'Odtwarzam próbkę głosu.' : ''), state === 'error', 'speechStatus')
);
function populateVoices() {
  const selected = settings?.systemVoice || '';
  $('systemVoice').replaceChildren(new Option('Automatyczny polski głos', ''));
  const voices = systemVoices();
  for (const voice of voices)
    $('systemVoice').add(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI));
  if (selected && !voices.some((v) => v.voiceURI === selected))
    $('systemVoice').add(new Option('Zapisany głos jest teraz niedostępny', selected));
  $('systemVoice').value = selected;
}
speechSynthesis.addEventListener('voiceschanged', populateVoices);
for (const voice of OPENAI_VOICES)
  $('openaiVoice').add(new Option(voice[0].toUpperCase() + voice.slice(1), voice));
function renderSpeechSettings() {
  const remote = settings.voiceEngine === 'openai';
  $('systemSpeechFields').hidden = remote;
  $('openaiSpeechFields').hidden = !remote;
  $('testVoice').textContent = remote ? 'Posłuchaj przykładu (płatne API)' : 'Posłuchaj przykładu';
  $('speechKey').value = drafts.openai || '';
  $('speechKey').placeholder = configured.openai
    ? 'Klucz zapisany. Puste pole zachowuje połączenie.'
    : 'sk-…';
  $('speechRateValue').textContent = `${settings.speechRate.toFixed(2)}×`;
}
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
  const list = plan
    ? chatgptModels
    : apiCatalogs[settings.provider]?.models || PROVIDERS[settings.provider].models;
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
  const known = list.some((m) => m.id === current);
  if (current && !known) $('model').add(new Option(`${current} · poprzedni / własny wybór`, current));
  if (!plan) $('model').add(new Option('Własny / wcześniej wybrany model…', '__custom'));
  $('model').value = current || list[0]?.id || '__custom';
  if (plan && !current && list.length) settings.chatgptModel = list[0].id;
  $('customModelField').hidden = true;
  $('customModel').value = plan ? '' : current;
}
async function refreshModels(force = false) {
  const generation = ++modelGeneration,
    provider = settings.provider,
    auth = settings.openaiAuth;
  $('refreshModels').disabled = true;
  $('modelCatalogStatus').textContent = 'Pobieram listę modeli…';
  try {
    const catalog = await send('models.list', {
      provider,
      auth,
      force,
      ...(drafts[provider] ? { key: drafts[provider] } : {}),
    });
    if (generation !== modelGeneration || provider !== settings.provider || auth !== settings.openaiAuth)
      return;
    if (provider === 'openai' && auth === 'chatgpt') chatgptModels = catalog.models;
    else apiCatalogs[provider] = catalog;
    populateModels();
    const selected =
      provider === 'openai' && auth === 'chatgpt' ? settings.chatgptModel : settings.models[provider];
    const missing =
      selected && !catalog.models.some((model) => model.id === selected) && catalog.source !== 'bundled';
    $('modelCatalogStatus').textContent =
      catalog.warning ||
      (missing
        ? 'Wybranego modelu nie ma na liście konta. Wybierz dostępny model lub sprawdź własny identyfikator.'
        : catalog.updatedAt
          ? `Lista konta · ${new Date(catalog.updatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
          : 'Lista startowa');
  } catch (error) {
    if (generation === modelGeneration) $('modelCatalogStatus').textContent = error.message;
  } finally {
    if (generation === modelGeneration) $('refreshModels').disabled = false;
  }
}
$('refreshModels').onclick = () => refreshModels(true);
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
  modelGeneration++;
  $('refreshModels').disabled = false;
  $('modelCatalogStatus').textContent = '';
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
  else void refreshModels();
  renderSpeechSettings();
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
  sample.textContent = settings.expressAnswerOnly
    ? 'Dynamika Techniczna'
    : 'D — krótkie wyjaśnienie odpowiedzi.';
  sample.style.fontSize = `${settings.expressSize}px`;
  sample.style.opacity = settings.expressOpacity;
  const theme = expressTheme(
    settings,
    document.documentElement.dataset.theme === 'light' ? [247, 249, 243] : [18, 25, 23]
  );
  sample.style.color = theme.color;
  sample.style.background = settings.expressStyle === 'text' ? 'transparent' : theme.background;
  sample.style.border = settings.expressStyle === 'text' ? 'none' : `1px solid ${theme.border}`;
  sample.style.borderRadius = settings.expressStyle === 'card' ? '12px' : '6px';
  sample.style.padding =
    settings.expressStyle === 'card' ? '12px 14px' : settings.expressStyle === 'label' ? '4px 8px' : '0';
  sample.style.maxWidth = `min(${settings.expressWidth}px, calc(100% - 20px))`;
  sample.style.top = settings.pos.startsWith('t') ? '10px' : 'auto';
  sample.style.bottom = settings.pos.startsWith('t') ? 'auto' : '10px';
  sample.style.left = settings.pos.endsWith('l') ? '10px' : settings.pos === 'bc' ? '50%' : 'auto';
  sample.style.right = settings.pos.endsWith('l') || settings.pos === 'bc' ? 'auto' : '10px';
  sample.style.transform = settings.pos === 'bc' ? 'translateX(-50%)' : '';
  $('sizeValue').textContent = `${settings.expressSize} px`;
  $('opacityValue').textContent = `${Math.round(settings.expressOpacity * 100)}%`;
  $('widthValue').textContent = `${settings.expressWidth} px`;
  $('durationValue').textContent = `${settings.expressDuration} s`;
  $('activityFull').hidden = settings.activityIndicator !== 'full';
  $('activityMinimal').hidden = settings.activityIndicator !== 'minimal';
  $('activityOff').hidden = settings.activityIndicator !== 'off';
  $('activityHint').textContent =
    settings.activityIndicator === 'full'
      ? 'Pełny komunikat z przyciskiem przerwania i opisem błędu.'
      : 'Błąd: mały „!” przez 1,5 sekundy. Szczegóły w panelu OKStudy. ' +
        (settings.activityIndicator === 'minimal'
          ? 'Kliknięcie kropek lub Alt+K przerywa analizę.'
          : 'Alt+K przerywa analizę.');
}
const appearanceFields = {
  voice: 'voice',
  theme: 'theme',
  position: 'pos',
  duration: 'expressDuration',
  size: 'expressSize',
  opacity: 'expressOpacity',
  activityIndicator: 'activityIndicator',
  voiceEngine: 'voiceEngine',
  openaiVoice: 'openaiVoice',
  speechRate: 'speechRate',
  expressStyle: 'expressStyle',
  expressContrast: 'expressContrast',
  expressWidth: 'expressWidth',
  speechDailyLimit: 'speechDailyLimit',
};
function syncAppearance() {
  for (const [id, key] of Object.entries(appearanceFields))
    $(id).value = ['opacity', 'speechRate'].includes(id) ? settings[key] * 100 : settings[key];
  for (const id of ['internet', 'persistentHistory', 'expressAnswerOnly']) $(id).checked = settings[id];
  populateVoices();
  renderModes();
  renderSpeechSettings();
  preview();
}
async function refreshProfiles() {
  profiles = await send('profiles.list');
  $('profile').replaceChildren(
    new Option('Wybierz profil…', ''),
    ...profiles.map((profile) => new Option(profile.name, profile.id))
  );
}
$('profile').onchange = () => {
  const profile = profiles.find((profile) => profile.id === $('profile').value);
  if (!profile) return;
  settings = { ...settings, ...profile.settings };
  $('deleteProfile').disabled = !profile.custom;
  $('profileName').value = profile.custom ? profile.name : '';
  changed();
  syncAppearance();
};
$('saveProfile').onclick = async () => {
  try {
    const profile = await send('profiles.save', { name: $('profileName').value, settings });
    await refreshProfiles();
    $('profile').value = profile.id;
    $('deleteProfile').disabled = false;
    status('Profil został zapisany.');
  } catch (error) {
    status(error.message, true);
  }
};
$('deleteProfile').onclick = async () => {
  try {
    await send('profiles.delete', { id: $('profile').value });
    await refreshProfiles();
    $('deleteProfile').disabled = true;
    status('Usunięto profil.');
  } catch (error) {
    status(error.message, true);
  }
};
$('clearPositions').onclick = () =>
  send('positions.clear')
    .then(() => status('Przywrócono pozycje. Zmiana zadziała przy kolejnej odpowiedzi.'))
    .catch((error) => status(error.message, true));
async function refreshSpeechUsage() {
  const usage = await send('speech.usage');
  $('speechUsage').textContent = `Próby generowania dzisiaj: ${usage.count}.`;
}
$('clearSpeechCache').onclick = () =>
  send('speech.cache.clear')
    .then(() => status('Usunięto zapamiętane nagrania.', false, 'speechStatus'))
    .catch((error) => status(error.message, true, 'speechStatus'));
$('apiKey').oninput = () => {
  drafts[settings.provider] = $('apiKey').value;
  if (settings.provider === 'openai') $('speechKey').value = drafts.openai;
  changed();
};
$('speechKey').oninput = () => {
  drafts.openai = $('speechKey').value;
  if (settings.provider === 'openai') $('apiKey').value = drafts.openai;
  changed();
};
$('testVoice').onclick = async () => {
  speaker.stop();
  $('testVoice').disabled = true;
  try {
    await send('speech.stop');
    if (settings.voiceEngine === 'openai') {
      status('Generuję próbkę głosu OpenAI…', false, 'speechStatus');
      await send('speech.preview', {
        voice: settings.openaiVoice,
        rate: settings.speechRate,
        key: drafts.openai,
      });
    } else speaker.speak('Cześć! To przykładowy głos OKStudy. Odpowiedź to: Dynamika Techniczna.', settings);
  } catch (e) {
    status(e.message, true, 'speechStatus');
  } finally {
    $('testVoice').disabled = false;
  }
};
$('stopVoice').onclick = () => {
  speaker.stop();
  void send('speech.stop').catch((e) => status(e.message, true, 'speechStatus'));
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['okstudy.speechUsage']) void refreshSpeechUsage();
  if (area !== 'session' || !changes['okstudy.speech']) return;
  const voice = changes['okstudy.speech'].newValue || {};
  status(
    voice.error ||
      (voice.status === 'loading'
        ? 'Generuję głos OpenAI…'
        : voice.status === 'playing'
          ? voice.fromCache
            ? 'Odtwarzam zapisane nagranie — bez nowego zapytania API.'
            : 'Odtwarzam głos wygenerowany przez AI.'
          : ''),
    voice.status === 'error',
    'speechStatus'
  );
});
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
  ['expressAnswerOnly', 'expressAnswerOnly'],
  ['activityIndicator', 'activityIndicator'],
  ['voiceEngine', 'voiceEngine'],
  ['systemVoice', 'systemVoice'],
  ['openaiVoice', 'openaiVoice'],
  ['speechRate', 'speechRate'],
  ['expressStyle', 'expressStyle'],
  ['expressContrast', 'expressContrast'],
  ['expressWidth', 'expressWidth'],
  ['speechDailyLimit', 'speechDailyLimit'],
]) {
  $(id).oninput = () => {
    const el = $(id);
    settings[key] =
      el.type === 'checkbox'
        ? el.checked
        : ['range', 'number'].includes(el.type)
          ? Number(el.value) / (['opacity', 'speechRate'].includes(id) ? 100 : 1)
          : el.value;
    changed();
    if (id === 'theme') applyTheme(settings.theme);
    preview();
    renderSpeechSettings();
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
$('extensionId').textContent = chrome.runtime.id;
$('copyExtensionId').onclick = () =>
  copy(chrome.runtime.id)
    .then(() => status('Skopiowano identyfikator dla instalatora.', false, 'authStatus'))
    .catch((error) => status(error.message, true, 'authStatus'));
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
    activityIndicator: settings.activityIndicator,
    voiceEngine: settings.voiceEngine,
    openaiVoice: settings.openaiVoice,
    speechRate: settings.speechRate * 100,
  }))
    $(id).value = value;
  $('internet').checked = settings.internet;
  $('persistentHistory').checked = settings.persistentHistory;
  $('expressAnswerOnly').checked = settings.expressAnswerOnly;
  populateVoices();
  syncAppearance();
  await refreshProfiles();
  await refreshSpeechUsage();
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
window.addEventListener('pagehide', () => {
  speaker.stop();
});
