import { getKeys } from './storage.js';
import { speechText, OPENAI_VOICES } from './speech.js';
import { apiError } from './stream.js';
import { speechCacheId, cachedSpeech, cacheSpeech, reserveSpeech } from './speech-cache.js';

export const SPEECH_STATE = 'okstudy.speech';
let active, creating;
let writes = Promise.resolve();
const publish = (value, guard = () => true) => {
  writes = writes
    .catch(() => {})
    .then(() => guard() && chrome.storage.session.set({ [SPEECH_STATE]: value }));
  return writes;
};
const player = (message) => chrome.runtime.sendMessage({ target: 'okstudy-audio', ...message });
async function ensurePlayer() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('audio.html')],
  });
  if (contexts.length) return;
  if (!creating)
    creating = chrome.offscreen
      .createDocument({
        url: 'audio.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification:
          'Odtwarzanie wybranego przez użytkownika głosu OpenAI niezależnie od ograniczeń strony z zadaniem.',
      })
      .finally(() => {
        creating = null;
      });
  await creating;
}
export async function stopRemoteSpeech(tabId) {
  const previous = active;
  const saved = previous || (await chrome.storage.session.get(SPEECH_STATE))[SPEECH_STATE];
  if (active !== previous) return;
  if (tabId !== undefined && saved?.id && saved.tabId !== tabId) return;
  active = null;
  previous?.controller.abort();
  // Send stop even after a worker restart, when its in-memory task is gone.
  await player({ type: 'stop', id: saved?.id, tabId }).catch(() => {});
  await publish({ status: 'idle' }, () => !active);
}
export async function finishRemoteSpeech(id, error) {
  const previous = active;
  const saved = previous || (await chrome.storage.session.get(SPEECH_STATE))[SPEECH_STATE];
  if (active !== previous || saved?.id !== id) return;
  active = null;
  await publish({ status: error ? 'error' : 'idle', entryId: saved?.entryId, error }, () => !active);
}
export async function startRemoteSpeech(text, settings, meta = {}, keyOverride) {
  const previous = active;
  previous?.controller.abort();
  const task = { id: crypto.randomUUID(), controller: new AbortController(), ...meta };
  active = task;
  const alive = () => active === task && !task.controller.signal.aborted;
  const state = (status, extra = {}) =>
    publish({ id: task.id, entryId: task.entryId, tabId: task.tabId, status, ...extra }, alive);
  await player({ type: 'stop', id: previous?.id }).catch(() => {});
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
  try {
    await state('loading');
    const key = keyOverride || (await getKeys()).openai;
    if (!key)
      throw new Error(
        'Głos OpenAI wymaga klucza API. Dodaj go w ustawieniach głosu; abonament ChatGPT go nie zastępuje.'
      );
    const input = speechText(text);
    if (!input) throw new Error('Brak tekstu do przeczytania.');
    const voice = OPENAI_VOICES.includes(settings.openaiVoice) ? settings.openaiVoice : 'marin';
    const speed = Math.min(1.4, Math.max(0.7, settings.speechRate || 1));
    const cacheId = await speechCacheId(key, input, voice, speed);
    let audio = await cachedSpeech(cacheId);
    const fromCache = !!audio;
    task.controller.signal.throwIfAborted();
    if (!audio) {
      await reserveSpeech(settings, alive);
      task.controller.signal.throwIfAborted();
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice,
          input,
          response_format: 'mp3',
          speed,
          instructions:
            'Czytaj naturalnie po polsku, wyraźnie i spokojnie. Nie dodawaj żadnego wstępu ani komentarza.',
        }),
        signal: AbortSignal.any([task.controller.signal, AbortSignal.timeout(45000)]),
      });
      if (!response.ok) throw apiError(response.status, await response.text());
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 8 * 1024 * 1024)
        throw new Error('Usługa głosowa zwróciła nieprawidłowe nagranie.');
      if (!alive()) return { cancelled: true };
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      audio = `data:audio/mpeg;base64,${btoa(binary)}`;
      await cacheSpeech(cacheId, audio).catch(() => {});
    }
    if (!alive()) return { cancelled: true };
    await ensurePlayer();
    if (!alive()) return { cancelled: true };
    await state('playing', { fromCache });
    if (!alive()) return { cancelled: true };
    const result = await player({
      type: 'play',
      id: task.id,
      tabId: task.tabId,
      audio,
    });
    if (!result?.ok) throw new Error(result?.error || 'Nie udało się odtworzyć głosu OpenAI.');
    return { id: task.id };
  } catch (error) {
    if (!alive()) return { cancelled: true };
    const message =
      error.name === 'TimeoutError' ? 'Generowanie głosu trwało za długo. Spróbuj ponownie.' : error.message;
    await state('error', { error: message });
    if (active === task) active = null;
    throw new Error(message);
  } finally {
    clearInterval(keepAlive);
  }
}
