import { PROVIDERS, modelLabel } from './config.js';
import { $, send, initializeUI, applyTheme, modes, status, historyRows } from './ui.js';
initializeUI();
let tabId,
  settings,
  quickSequence = 0;
for (const id of ['region', 'screen', 'text']) $(id).disabled = true;
const options = () => chrome.runtime.openOptionsPage();
$('openSettings').onclick = options;
$('manageConnection').onclick = options;
$('connection').onclick = () => {
  if (!settings) return;
  $('quickConnection').hidden = !$('quickConnection').hidden;
  $('connection').setAttribute('aria-expanded', !$('quickConnection').hidden);
  if (!$('quickConnection').hidden) {
    void quickModels();
    $('quickProvider').focus();
  }
};
async function quickModels(force = false) {
  const sequence = ++quickSequence;
  const plan = settings.provider === 'openai' && settings.openaiAuth === 'chatgpt';
  $('quickProvider').value = `${settings.provider}:${plan ? 'chatgpt' : 'api'}`;
  $('quickModel').replaceChildren(new Option('Wczytuję modele…', ''));
  $('quickModel').disabled = true;
  try {
    const catalog = await send('models.list', {
      provider: settings.provider,
      auth: settings.openaiAuth,
      force,
    });
    const list = [...catalog.models];
    if (sequence !== quickSequence) return;
    const selected = plan ? settings.chatgptModel : settings.models[settings.provider];
    if (selected && !list.some((m) => m.id === selected))
      list.push({ id: selected, name: `${selected} · poprzedni / własny wybór` });
    $('quickModel').replaceChildren(...list.map((m) => new Option(m.name, m.id)));
    $('quickModel').value = list.some((m) => m.id === selected) ? selected : list[0]?.id || '';
    $('quickModel').disabled = !list.length;
    if (!list.length) $('quickModel').add(new Option('Połącz konto w ustawieniach', ''));
    $('modelCatalogStatus').textContent =
      catalog.warning ||
      (catalog.source === 'bundled' ? 'Lista startowa' : 'Modele dostępne na Twoim koncie');
  } catch {
    if (sequence === quickSequence)
      $('quickModel').replaceChildren(new Option('Połącz konto w ustawieniach', ''));
  }
}
$('refreshModels').onclick = () => quickModels(true);
for (const [id, key] of [
  ['quickAnswerOnly', 'expressAnswerOnly'],
  ['quickIndicator', 'activityIndicator'],
  ['quickVoice', 'voice'],
])
  $(id).onchange = async () => {
    try {
      await send('settings.save', {
        settings: { [key]: $(id).type === 'checkbox' ? $(id).checked : $(id).value },
      });
      await refresh();
    } catch (error) {
      status(error.message, true);
    }
  };
$('quickProfile').onchange = async () => {
  if (!$('quickProfile').value) return;
  try {
    await send('profiles.apply', { id: $('quickProfile').value });
    await refresh();
  } catch (error) {
    status(error.message, true);
  }
};
$('explainLast').onclick = () => {
  chrome.sidePanel
    .open({ tabId })
    .then(() => send('explain', { tabId }))
    .then(() => window.close())
    .catch((error) => status(error.message, true));
};
$('quickProvider').onchange = async () => {
  const [provider, auth] = $('quickProvider').value.split(':');
  $('quickProvider').disabled = true;
  $('quickModel').disabled = true;
  quickSequence++;
  try {
    await send('settings.save', {
      settings: { provider, ...(provider === 'openai' ? { openaiAuth: auth } : {}) },
    });
    await refresh();
  } catch (e) {
    status(e.message, true);
  } finally {
    $('quickProvider').disabled = false;
  }
};
$('quickModel').onchange = async () => {
  const model = $('quickModel').value;
  if (!model) return;
  const patch =
    settings.provider === 'openai' && settings.openaiAuth === 'chatgpt'
      ? { chatgptModel: model }
      : { models: { [settings.provider]: model } };
  try {
    await send('settings.save', { settings: patch });
    await refresh();
  } catch (e) {
    status(e.message, true);
  }
};
function openPanel(entryId) {
  if (entryId) void chrome.storage.session.set({ 'okstudy.selected': entryId });
  chrome.sidePanel
    .open({ tabId })
    .then(() => window.close())
    .catch((e) => status(e.message, true));
}
$('openHistory').onclick = () => {
  void chrome.storage.session.set({ 'okstudy.showHistory': true });
  openPanel();
};
async function refresh() {
  const data = await send('snapshot', { tabId });
  settings = data.settings;
  applyTheme(settings.theme);
  document.documentElement.dataset.preference = settings.theme;
  const provider = PROVIDERS[settings.provider],
    plan = settings.provider === 'openai' && settings.openaiAuth === 'chatgpt';
  $('providerName').textContent = plan ? 'ChatGPT' : provider.name;
  $('providerImage').src = provider.image;
  $('modelName').textContent = plan
    ? settings.chatgptModel || 'Modele Twojego konta'
    : modelLabel(settings.provider, settings.models[settings.provider]);
  $('connectionTag').textContent = plan
    ? 'Twój plan'
    : data.configured[settings.provider]
      ? 'Klucz zapisany'
      : 'Połącz';
  $('setupHint').hidden = plan || data.configured[settings.provider];
  modes($('modes'), settings.mode, async (mode) => {
    try {
      await send('settings.save', { settings: { mode } });
      await refresh();
    } catch (e) {
      status(e.message, true);
    }
  });
  $('internet').checked = settings.internet;
  $('quickAnswerOnly').checked = settings.expressAnswerOnly;
  $('quickIndicator').value = settings.activityIndicator;
  $('quickVoice').value = settings.voice;
  $('quickVoiceHint').textContent =
    settings.voiceEngine === 'openai'
      ? 'Wybrane źródło: OpenAI — płatne API dla nowych nagrań.'
      : 'Wybrane źródło: głos przeglądarki / systemu.';
  $('explainLast').disabled = !data.history.some((entry) => entry.tabId === tabId);
  historyRows($('recent'), data.history, (e) => openPanel(e.id), 2);
  $('emptyHistory').hidden = !!data.history.length;
  for (const id of ['region', 'screen', 'text']) $(id).disabled = !Number.isInteger(tabId);
  if (!$('quickConnection').hidden) void quickModels();
}
$('internet').onchange = async () => {
  try {
    settings = await send('settings.save', { settings: { internet: $('internet').checked } });
  } catch (e) {
    status(e.message, true);
  }
};
for (const kind of ['region', 'screen', 'text'])
  $(kind).onclick = () => {
    const panel =
      settings.mode !== 'express' && settings.voice !== 'only'
        ? chrome.sidePanel.open({ tabId })
        : Promise.resolve();
    for (const id of ['region', 'screen', 'text']) $(id).disabled = true;
    panel
      .then(() => send('launch', { tabId, kind }))
      .then(() => window.close())
      .catch((e) => {
        status(e.message, true);
        for (const id of ['region', 'screen', 'text']) $(id).disabled = false;
      });
  };
void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  const profiles = await send('profiles.list');
  $('quickProfile').replaceChildren(
    new Option('Wybierz profil…', ''),
    ...profiles.map((profile) => new Option(profile.name, profile.id))
  );
  await refresh();
})().catch((e) => status(e.message, true));
