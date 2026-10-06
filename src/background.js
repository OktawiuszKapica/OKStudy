import { PROVIDERS, cropBounds, normalizeSettings } from './config.js';
import {
  initializeStorage,
  getSettings,
  getKeys,
  updateSettings,
  getHistory,
  saveEntry,
  deleteHistory,
} from './storage.js';
import { requestAI } from './providers.js';
import { nativeRequest } from './native.js';
import { expressResult } from './text.js';
import { startRemoteSpeech, stopRemoteSpeech, finishRemoteSpeech } from './audio.js';
import { accountCatalog } from './model-catalog.js';
import {
  listProfiles,
  saveProfile,
  applyProfile,
  deleteProfile,
  originOf,
  loadPosition,
  savePosition,
  clearPositions,
} from './preferences.js';
import { clearSpeechCache, speechUsage } from './speech-cache.js';

const jobs = new Map(),
  images = new Map(),
  stateWrites = new Map();
const badgeTimers = new Map();
async function clearBadge(tabId) {
  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.delete(tabId);
  await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
}
let shortcutSettings;
let captureQueue = Promise.resolve(),
  lastCapture = 0;
let lastRepeat = 0,
  repeats = 0,
  repeatIndex = 0,
  shownEntry;
const ready = initializeStorage();
ready.catch(() => {});
ready
  .then(getSettings)
  .then((value) => {
    shortcutSettings = value;
  })
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['okstudy.settings.v2'])
    shortcutSettings = changes['okstudy.settings.v2'].newValue;
});
const trustedPage = (sender) =>
  sender.id === chrome.runtime.id &&
  [
    chrome.runtime.getURL('popup.html'),
    chrome.runtime.getURL('options.html'),
    chrome.runtime.getURL('panel.html'),
  ].includes(sender.url?.split('?')[0].split('#')[0]);
const tell = (tabId, message) => chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => null);
const jobKey = (tabId) => `okstudy.job.${tabId}`;
function state(tabId, value, guard = () => true) {
  const next = (stateWrites.get(tabId) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      if (guard()) await chrome.storage.session.set({ [jobKey(tabId)]: { ...value, at: Date.now() } });
    });
  stateWrites.set(tabId, next);
  next
    .finally(() => {
      if (stateWrites.get(tabId) === next) stateWrites.delete(tabId);
    })
    .catch(() => {});
  return next;
}
const jobState = (job, value) => state(job.tabId, value, job.alive);
function forgetImage(id) {
  clearTimeout(images.get(id)?.timer);
  images.delete(id);
}
function rememberImage(id, image) {
  forgetImage(id);
  images.set(id, { image, at: Date.now(), timer: setTimeout(() => forgetImage(id), 30 * 60000) });
  while (images.size > 3) forgetImage(images.keys().next().value);
}
function makeJob(tabId) {
  void stopRemoteSpeech(tabId).catch(() => {});
  jobs.get(tabId)?.controller.abort();
  const job = { id: crypto.randomUUID(), tabId, controller: new AbortController() };
  jobs.set(tabId, job);
  job.alive = () => jobs.get(tabId) === job && !job.controller.signal.aborted;
  return job;
}
async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['js/content.js'] });
}
async function usableTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url)
    throw new Error('Kliknij ikonę OKStudy na karcie z zadaniem, aby udzielić dostępu do tej strony.');
  if (
    !tab.url ||
    !/^https?:\/\//.test(tab.url) ||
    /^https:\/\/(chromewebstore.google.com|chrome.google.com\/webstore)/.test(tab.url)
  )
    throw new Error(
      'Otwórz zwykłą stronę z zadaniem. Na stronach ustawień przeglądarki i w sklepie rozszerzeń OKStudy nie działa.'
    );
  return tab;
}
function capture(job, tab) {
  const next = captureQueue
    .catch(() => {})
    .then(async () => {
      if (!job.alive()) throw new DOMException('Anulowano', 'AbortError');
      const wait = Math.max(0, 600 - (Date.now() - lastCapture));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      if (!job.alive()) throw new DOMException('Anulowano', 'AbortError');
      const [before] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
      if (before?.id !== tab.id)
        throw new Error('Karta zmieniła się przed zrzutem. Wróć do zadania i spróbuj ponownie.');
      lastCapture = Date.now();
      const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const [after] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
      if (after?.id !== tab.id) throw new Error('Karta zmieniła się podczas zrzutu. Spróbuj ponownie.');
      return image;
    });
  captureQueue = next.catch(() => {});
  return next;
}
async function cropImage(image, rect) {
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  try {
    const b = cropBounds(rect, bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(b.width, b.height);
    canvas.getContext('2d').drawImage(bitmap, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:image/png;base64,${btoa(binary)}`;
  } finally {
    bitmap.close();
  }
}
async function markError(job, error) {
  if (!job.alive()) return;
  const text =
    error.name === 'TimeoutError'
      ? 'Analiza trwała za długo. Zawęź zadanie lub wybierz szybszy model.'
      : error instanceof TypeError
        ? 'Nie udało się połączyć z dostawcą AI. Sprawdź połączenie z internetem.'
        : error.message || 'Analiza nie powiodła się.';
  await jobState(job, { status: 'error', error: text, entryId: job.entryId, auth: job.auth });
  if (!job.alive()) return;
  await chrome.action.setBadgeText({ tabId: job.tabId, text: '!' }).catch(() => {});
  const settings = job.settings || (await getSettings());
  if (settings.activityIndicator !== 'full') {
    clearTimeout(badgeTimers.get(job.tabId));
    const timer = setTimeout(() => {
      if (badgeTimers.get(job.tabId) === timer) void clearBadge(job.tabId);
    }, 1500);
    badgeTimers.set(job.tabId, timer);
  }
  await tell(job.tabId, { type: 'notice', text, error: true, settings });
}
async function infer(job, settings, entry, image) {
  job.settings = settings;
  job.entryId = entry.id;
  job.auth = entry.auth;
  const signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(120000)]);
  const args = {
    provider: entry.provider,
    model: entry.model,
    mode: entry.mode,
    internet: entry.internet,
    image,
    messages: entry.messages,
    answerOnly: entry.answerOnly === true,
  };
  let lastWrite = 0;
  const partial = (text) => {
    if (entry.mode === 'express' && entry.answerOnly) return;
    if (!job.alive() || Date.now() - lastWrite < 180) return;
    lastWrite = Date.now();
    void jobState(job, {
      status: 'running',
      entryId: entry.id,
      text: text.slice(0, 100000),
      mode: entry.mode,
    }).catch(() => {});
  };
  const started = Date.now();
  await jobState(job, { status: 'running', entryId: entry.id, text: '', mode: entry.mode });
  if (!job.alive()) return;
  await tell(job.tabId, { type: 'working', jobId: job.id, settings });
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
  try {
    let result;
    if (entry.provider === 'openai' && entry.auth === 'chatgpt')
      result = await nativeRequest('infer', { args }, signal, partial);
    else {
      const key = (await getKeys())[entry.provider];
      if (!key)
        throw new Error(`Połącz ${PROVIDERS[entry.provider].name} w ustawieniach, aby rozpocząć naukę.`);
      result = await requestAI(args, key, signal, partial);
    }
    if (!job.alive()) return;
    if (entry.mode === 'express') result.text = expressResult(result.text, entry.answerOnly);
    const completed = {
      ...entry,
      messages: [...entry.messages, { role: 'assistant', text: result.text }],
      sources: result.sources || [],
      searchSuggestions: result.searchSuggestions || '',
      durationMs: Date.now() - started,
    };
    const saved = await saveEntry(completed, job.alive);
    if (!saved || !job.alive()) return;
    if (image) rememberImage(entry.id, image);
    await jobState(job, { status: 'done', entryId: entry.id });
    if (!job.alive()) return;
    await clearBadge(job.tabId);
    await tell(job.tabId, { type: 'answer', text: result.text, settings, entryId: entry.id });
    autoSpeak(completed, settings, job.tabId);
  } finally {
    clearInterval(keepAlive);
  }
}
function autoSpeak(entry, settings, tabId) {
  if (settings.voice === 'off' || settings.voiceEngine !== 'openai') return;
  const text = entry.messages.filter((m) => m.role === 'assistant').at(-1)?.text;
  if (!text) return;
  const spoken = entry.mode === 'express' ? text : text.match(/Wniosek:\s*([\s\S]+)/i)?.[1] || text;
  void startRemoteSpeech(spoken, settings, { tabId, entryId: entry.id }).catch((error) =>
    tell(tabId, { type: 'notice', text: error.message, error: true, speech: true, settings })
  );
}
async function launch(tabId, kind, internetOverride, selectedText) {
  const job = makeJob(tabId);
  try {
    await ready;
    const settings = await getSettings();
    job.settings = settings;
    await clearBadge(tabId);
    const tab = await usableTab(tabId);
    await inject(tabId);
    await jobState(job, { status: 'preparing' });
    if (!job.alive()) return;
    await tell(tabId, { type: 'prepare', settings });
    if (!job.alive()) return;
    let image,
      text = '';
    if (kind === 'text') {
      text =
        selectedText ||
        (await chrome.tabs.sendMessage(tabId, { type: 'selectionText' }, { frameId: 0 }))?.text ||
        '';
      text = text.trim();
      if (!text) throw new Error('Najpierw zaznacz tekst zadania na stronie, a potem wybierz tę opcję.');
      if (text.length > 16000) throw new Error('Zaznacz krótszy fragment, do 16 000 znaków.');
    } else {
      image = await capture(job, tab);
      if (!job.alive()) return;
      if (kind === 'region') {
        await jobState(job, { status: 'selecting' });
        if (!job.alive()) return;
        const selection = await chrome.tabs.sendMessage(
          tabId,
          { type: 'selectRegion', screenshot: image },
          { frameId: 0 }
        );
        if (!selection || selection.cancelled) {
          await jobState(job, { status: 'idle' });
          return;
        }
        image = await cropImage(image, selection);
      }
    }
    if (!job.alive()) return;
    const provider = settings.provider,
      auth = provider === 'openai' ? settings.openaiAuth : 'api';
    job.auth = auth;
    let model = settings.models[provider];
    if (auth === 'chatgpt') {
      const list = await nativeRequest('models', {}, job.controller.signal);
      if (!list.length)
        throw new Error('To konto ChatGPT nie udostępnia obecnie modeli. Sprawdź ustawienia użycia planu.');
      if (settings.chatgptModel && !list.some((m) => m.id === settings.chatgptModel))
        throw new Error(
          'Wybrany model nie jest już dostępny na tym koncie ChatGPT. Odśwież listę w ustawieniach i wybierz dostępny model.'
        );
      model = settings.chatgptModel || list[0].id;
    }
    const entry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      tabId,
      provider,
      model,
      auth,
      mode: settings.mode,
      answerOnly: settings.mode === 'express' && settings.expressAnswerOnly,
      internet: internetOverride ?? settings.internet,
      title: text ? text.slice(0, 90) : kind === 'region' ? 'Zaznaczone zadanie' : 'Zadanie z ekranu',
      source: kind,
      messages: [{ role: 'user', text: text || 'Pomóż mi zrozumieć zadanie na tym obrazie.' }],
    };
    await infer(job, settings, entry, image);
  } catch (error) {
    await markError(job, error);
  } finally {
    if (jobs.get(tabId) === job) jobs.delete(tabId);
  }
}
async function followup(tabId, id, question, explain = false) {
  if (typeof question !== 'string' || !question.trim() || question.length > 4000)
    throw new Error('Wpisz pytanie, maksymalnie 4000 znaków.');
  const entry = (await getHistory()).find((e) => e.id === id);
  if (!entry) throw new Error('Tej odpowiedzi nie ma już w historii.');
  if (entry.messages.length >= 38)
    throw new Error('Rozmowa osiągnęła limit długości. Rozpocznij nową analizę.');
  const job = makeJob(tabId);
  try {
    const cached = images.get(id);
    const image = cached && Date.now() - cached.at < 30 * 60000 ? cached.image : undefined;
    if (cached && !image) forgetImage(id);
    if (entry.source !== 'text' && entry.mode === 'express' && !image)
      throw new Error(
        'Obraz tego zadania nie jest już dostępny. Zaznacz je ponownie, aby dopytać o szczegóły.'
      );
    await infer(
      job,
      { ...(await getSettings()), ...(explain ? { mode: 'tutor', voice: 'off' } : {}) },
      {
        ...entry,
        ...(explain ? { mode: 'tutor', answerOnly: false } : {}),
        messages: [...entry.messages, { role: 'user', text: question.trim() }],
      },
      image
    );
  } catch (error) {
    await markError(job, error);
  } finally {
    if (jobs.get(tabId) === job) jobs.delete(tabId);
  }
}
async function explainLast(tabId) {
  const recent = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
  const history = await getHistory();
  const entry =
    history.find((entry) => entry.id === recent?.entryId) || history.find((entry) => entry.tabId === tabId);
  if (!entry) throw new Error('Najpierw przeanalizuj zadanie na tej karcie.');
  await chrome.storage.session.set({ 'okstudy.selected': entry.id });
  return followup(tabId, entry.id, 'Wyjaśnij poprzednią odpowiedź krok po kroku. Podaj uzasadnienie.', true);
}
async function cancel(tabId) {
  jobs.get(tabId)?.controller.abort();
  jobs.delete(tabId);
  await stopRemoteSpeech(tabId);
  await tell(tabId, { type: 'cancel' });
  await state(tabId, { status: 'idle' });
  await clearBadge(tabId);
}
async function snapshot(tabId) {
  const settings = await getSettings(),
    keys = await getKeys(),
    history = await getHistory();
  let job = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)] || { status: 'idle' };
  if (['running', 'preparing', 'selecting'].includes(job.status) && !jobs.has(tabId))
    job = {
      status: 'error',
      error: 'Analiza została przerwana po ponownym uruchomieniu rozszerzenia. Spróbuj ponownie.',
    };
  return {
    settings,
    configured: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, !!keys[p]])),
    history,
    job,
  };
}
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (request.target === 'okstudy-audio') return;
  if (sender.url === chrome.runtime.getURL('audio.html') && request.type === 'speech.finished') {
    void finishRemoteSpeech(request.id, request.error).then(() => respond({ ok: true }));
    return true;
  }
  const trusted = trustedPage(sender),
    fromContent = sender.tab && sender.frameId === 0;
  if (
    !trusted &&
    !(
      fromContent &&
      ['cancel', 'openPanel', 'explain', 'position.load', 'position.save'].includes(request.type)
    )
  )
    return;
  if (request.type === 'openPanel') {
    chrome.sidePanel
      .open({ tabId: sender.tab.id })
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false, error: 'Otwórz panel przyciskiem pod ikoną OKStudy.' }));
    return true;
  }
  if (request.type === 'explain') {
    const explainTab = trusted ? Number(request.tabId) : sender.tab.id;
    chrome.sidePanel
      .open({ tabId: explainTab })
      .then(() => {
        respond({ ok: true });
        void explainLast(explainTab).catch((error) =>
          state(explainTab, { status: 'error', error: error.message })
        );
      })
      .catch((error) => respond({ ok: false, error: error.message }));
    return true;
  }
  (async () => {
    await ready;
    const tabId = trusted ? Number(request.tabId) : sender.tab.id;
    switch (request.type) {
      case 'snapshot':
        return snapshot(tabId);
      case 'settings.save':
        return updateSettings(request.settings || {}, request.keys);
      case 'models.list': {
        const settings = await getSettings();
        const provider = request.provider || settings.provider;
        const plan = provider === 'openai' && (request.auth || settings.openaiAuth) === 'chatgpt';
        if (plan) return { models: await nativeRequest('models'), source: 'live', updatedAt: Date.now() };
        const key =
          typeof request.key === 'string' &&
          sender.url?.split('#')[0] === chrome.runtime.getURL('options.html')
            ? request.key.trim().slice(0, 4096)
            : (await getKeys())[provider];
        return accountCatalog(provider, key, request.force === true);
      }
      case 'profiles.list':
        return listProfiles();
      case 'profiles.save':
        return saveProfile(request.name, request.settings);
      case 'profiles.apply':
        return applyProfile(request.id);
      case 'profiles.delete':
        return deleteProfile(request.id);
      case 'position.load':
        return loadPosition(originOf(sender.url));
      case 'position.save':
        return savePosition(originOf(sender.url), request.position);
      case 'positions.clear':
        return clearPositions();
      case 'speech.usage':
        return speechUsage();
      case 'speech.cache.clear':
        return clearSpeechCache();
      case 'speech.stop':
        await stopRemoteSpeech();
        return {};
      case 'speech.preview': {
        if (sender.url?.split('#')[0] !== chrome.runtime.getURL('options.html'))
          throw new Error('Otwórz ustawienia głosu.');
        const settings = normalizeSettings({
          ...(await getSettings()),
          openaiVoice: request.voice,
          speechRate: request.rate,
        });
        return startRemoteSpeech(
          'Cześć! To przykładowy głos OKStudy. Odpowiedź to: Dynamika Techniczna.',
          settings,
          { preview: true },
          typeof request.key === 'string' ? request.key.slice(0, 4096) : undefined
        );
      }
      case 'speech.read': {
        const settings = await getSettings();
        if (settings.voiceEngine !== 'openai') throw new Error('Wybierz głos OpenAI w ustawieniach.');
        const entry = (await getHistory()).find((e) => e.id === request.entryId);
        if (!entry) throw new Error('Tej odpowiedzi nie ma już w historii.');
        const text = entry.messages.filter((m) => m.role === 'assistant').at(-1)?.text;
        return startRemoteSpeech(text, settings, {
          tabId: Number.isInteger(tabId) ? tabId : undefined,
          entryId: entry.id,
        });
      }
      case 'launch':
        await usableTab(tabId);
        void launch(tabId, ['region', 'screen', 'text'].includes(request.kind) ? request.kind : 'screen');
        return { started: true };
      case 'followup':
        void followup(tabId, request.id, request.question).catch((error) =>
          state(tabId, { status: 'error', error: error.message })
        );
        return { started: true };
      case 'cancel':
        await cancel(tabId);
        return {};
      case 'history.delete':
        await stopRemoteSpeech();
        await clearSpeechCache();
        for (const job of jobs.values())
          if (!request.id || job.entryId === request.id) await cancel(job.tabId);
        if (request.id) forgetImage(request.id);
        else for (const id of images.keys()) forgetImage(id);
        await deleteHistory(request.id);
        return {};
      case 'test': {
        if (!Object.hasOwn(PROVIDERS, request.provider)) throw new Error('Wybierz dostawcę.');
        const s = await getSettings(),
          keys = await getKeys(),
          key = request.key || keys[request.provider];
        if (!key) throw new Error('Najpierw wklej klucz API.');
        await requestAI(
          {
            provider: request.provider,
            model: request.model || s.models[request.provider],
            mode: 'express',
            internet: false,
            messages: [{ role: 'user', text: 'Odpowiedz wyłącznie: OK' }],
          },
          key,
          AbortSignal.timeout(45000),
          () => {}
        );
        return { connected: true };
      }
      case 'chatgpt.status':
        return nativeRequest('status');
      case 'chatgpt.signin':
        for (const job of jobs.values()) if (job.auth === 'chatgpt') await cancel(job.tabId);
        return nativeRequest('signin', { accountId: request.accountId });
      case 'chatgpt.signout':
        for (const job of jobs.values()) if (job.auth === 'chatgpt') await cancel(job.tabId);
        return nativeRequest('signout');
      case 'chatgpt.select':
        for (const job of jobs.values()) if (job.auth === 'chatgpt') await cancel(job.tabId);
        return nativeRequest('select', { accountId: request.accountId });
      case 'chatgpt.models':
        return nativeRequest('models');
      default:
        throw new Error('Nieobsługiwana operacja.');
    }
  })()
    .then((data) => respond({ ok: true, data }))
    .catch((error) => respond({ ok: false, error: error.message, code: error.code }));
  return true;
});
chrome.commands.onCommand.addListener((command, commandTab) => {
  if (
    ['solve_fast', 'solve_internet', 'solve_alt', 'repeat_last'].includes(command) &&
    commandTab?.id &&
    shortcutSettings?.mode !== 'express' &&
    shortcutSettings?.voice !== 'only'
  )
    chrome.sidePanel.open({ tabId: commandTab.id }).catch(() => {});
  void (async () => {
    const tab = commandTab?.id
      ? commandTab
      : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id) return;
    if (command === 'cancel') return cancel(tab.id);
    if (command === 'explain_last') {
      await chrome.sidePanel.open({ tabId: tab.id });
      return explainLast(tab.id);
    }
    if (['solve_fast', 'solve_internet', 'solve_alt'].includes(command))
      return launch(tab.id, command === 'solve_alt' ? 'region' : 'screen', command === 'solve_internet');
    if (command === 'toggle_model') {
      const s = await getSettings(),
        plan = s.provider === 'openai' && s.openaiAuth === 'chatgpt';
      const list = plan
        ? await nativeRequest('models')
        : (await accountCatalog(s.provider, (await getKeys())[s.provider])).models;
      if (!list.length) return;
      const current = plan ? s.chatgptModel : s.models[s.provider];
      const next = list[(list.findIndex((m) => m.id === current) + 1) % list.length];
      await updateSettings(plan ? { chatgptModel: next.id } : { models: { [s.provider]: next.id } });
      await inject(tab.id);
      return tell(tab.id, { type: 'notice', text: next.name });
    }
    if (command === 'repeat_last') {
      const history = await getHistory();
      if (!history.length) return;
      const now = Date.now();
      if (now - lastRepeat < 180) {
        lastRepeat = now;
        if (++repeats === 4 && shownEntry)
          await tell(tab.id, { type: 'copy', text: shownEntry.messages.at(-1).text });
        return;
      }
      lastRepeat = now;
      repeats = 0;
      shownEntry = history[repeatIndex++ % history.length];
      await inject(tab.id);
      const s = await getSettings();
      await state(tab.id, { status: 'done', entryId: shownEntry.id });
      await tell(tab.id, {
        type: 'answer',
        text: shownEntry.messages.at(-1).text,
        settings: s,
        entryId: shownEntry.id,
      });
      autoSpeak(shownEntry, s, tab.id);
    }
  })().catch((error) => {
    if (commandTab?.id) void state(commandTab.id, { status: 'error', error: error.message });
  });
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus
    .removeAll()
    .then(() =>
      chrome.contextMenus.create({ id: 'okstudy-text', title: 'Wyjaśnij w OKStudy', contexts: ['selection'] })
    );
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'okstudy-text' || !tab?.id) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  void launch(tab.id, 'text', undefined, info.selectionText);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void stopRemoteSpeech(tabId);
  void clearBadge(tabId);
  jobs.get(tabId)?.controller.abort();
  jobs.delete(tabId);
  void chrome.storage.session.remove(jobKey(tabId));
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') void stopRemoteSpeech(tabId);
  if (change.status === 'loading' && jobs.has(tabId)) void cancel(tabId);
});
